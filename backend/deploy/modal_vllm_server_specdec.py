"""
Baseline vLLM(단일 GPU) + Speculative Decoding 을 Modal 에 띄우는 배포 스크립트.

목적:
    저동시성·지연 민감한 챗봇에서 speculative decoding 이 TPOT(토큰간 지연)를
    실제로 줄이는지, 그 대가로 acceptance rate / 메모리는 어떻게 움직이는지
    baseline(spec 끔) 대비 A/B 로 '검증'하기 위한 서버.

  ⚠️ 솔직한 전제(공식 문서 경고): speculative decoding 은 아직 완전히 최적화되지
     않았고, 데이터셋에 따라 ITL(토큰간 지연) 이득이 없을 수도 있다. 그래서 이건
     "무조건 빨라진다" 가 아니라 "어떤 조건에서 값을 하는지 재보는" 실험 대상이다.

관계도:
    [프론트] → [main.py /api/analyze] → analyzers.VllmAnalyzer
                                            → providers.ModalProvider
                                            → 여기서 배포한 이 서버(/v1)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
배포 (SPEC_METHOD 로 토글해서 A/B)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  # (1) baseline — spec 끔 (비교 기준선)
  SPEC_METHOD=off   VLLM_GPU=L4 modal deploy modal_vllm_server_specdec.py
  # (2) draft-model spec decoding (Qwen3-0.6B 이 Qwen3-8B 를 대신 초안 작성)
  SPEC_METHOD=draft VLLM_GPU=L4 modal deploy modal_vllm_server_specdec.py
  # (3) n-gram spec decoding (드래프트 모델 없이, 추가 메모리 0)
  SPEC_METHOD=ngram VLLM_GPU=L4 modal deploy modal_vllm_server_specdec.py

━━━ 측정(포트폴리오 핵심) ━━━
  • TPOT / TTFT / throughput: 세 배포(off/draft/ngram)에 동일 부하로
        vllm bench serve --model Qwen/Qwen3-8B --base-url <url> --endpoint /v1/chat/completions ...
  • acceptance rate(초안 수락률): 서버 로그 또는 GET /metrics 의
        vllm:spec_decode_* (draft_acceptance_rate 등) 지표로 확인.
  • 결과 서사: "draft 는 acceptance ↑일 때 TPOT ↓ / ngram 은 open-ended 챗에선
    hit rate 낮아 이득 적음 / 둘 다 메모리·품질 트레이드오프" 를 표로.

━━━ 반드시 알아둘 제약 ━━━
  1) draft 와 target 은 '같은 토크나이저/vocab' 이어야 한다.
     → Qwen3-0.6B ↔ Qwen3-8B 는 동일 계열이라 OK. 서로 다른 계열 섞으면 안 됨.
     동일계열 : {0.6B, 1.7B, 8B}. 이중 0.6B가 가장 GPU 메모리 차지 않하고 파라미터 적음
     ⚠️ 여유 있다면 acceptance rate까지 고려하기 위해 1.7B와 비교하기
  2) draft 모델도 같은 GPU 에 올라간다(가중치+KV 추가). 8B + 0.6B 가 L4 에 빠듯하면
     VLLM_MAX_MODEL_LEN 이나 VLLM_GPU_UTIL 을 낮춘다. (OOM 은 util 을 '낮춰서' 해결)
  3) draft-model 방식이 V1 엔진에서 에러나면 VLLM_USE_V1=0 으로 배포(V0 는 검증된 경로).
     n-gram 방식은 V1 에서 안전.
"""
from __future__ import annotations

import json
import os

import modal

# ── 튜닝 포인트 (배포 시점 로컬 값이 아래 image.env 로 컨테이너에 '구워'진다) ──
# target(=실제 서빙) 모델. backend 의 VLLM_MODEL 과 일치해야 한다.
MODEL = os.environ.get("VLLM_MODEL", "Qwen/Qwen3-8B")
GPU = os.environ.get("VLLM_GPU", "L4")
MAX_CONCURRENT = int(os.environ.get("VLLM_MAX_CONCURRENT", "10"))
SCALEDOWN_WINDOW = int(os.environ.get("VLLM_SCALEDOWN", "300"))
API_KEY = os.environ.get("MODAL_VLLM_TOKEN", "")
MAX_MODEL_LEN = os.environ.get("VLLM_MAX_MODEL_LEN", "16384")
GPU_UTIL = os.environ.get("VLLM_GPU_UTIL", "0.90")   # OOM 나면 0.85 (draft 추가로 더 빡빡)
MAX_BATCHED = os.environ.get("VLLM_MAX_BATCHED", "8192")
REASONING_PARSER = os.environ.get("VLLM_REASONING_PARSER", "qwen3")  # 비우면 미적용

# ── Speculative decoding 설정 ──
# off   : spec 끔 (baseline 기준선)
# draft : 별도 초안 모델(SPEC_DRAFT_MODEL)로 초안 → target 이 검증 (고전적 방식)
# ngram : 초안 모델 없이 컨텍스트의 n-gram 매칭으로 초안 (메모리 0)
SPEC_METHOD = os.environ.get("SPEC_METHOD", "draft").lower()
SPEC_DRAFT_MODEL = os.environ.get("SPEC_DRAFT_MODEL", "Qwen/Qwen3-0.6B")   # target 과 같은 계열!
SPEC_NUM_TOKENS = os.environ.get("SPEC_NUM_TOKENS", "5")                    # 한 번에 초안 낼 토큰 수
SPEC_PROMPT_LOOKUP_MAX = os.environ.get("SPEC_PROMPT_LOOKUP_MAX", "4")      # ngram 최대 창
SPEC_PROMPT_LOOKUP_MIN = os.environ.get("SPEC_PROMPT_LOOKUP_MIN", "")       # ngram 최소 창(선택)

# draft-model 이 V1 에서 문제되면 "0" 으로. 비우면 vLLM 기본값에 맡긴다.
VLLM_USE_V1 = os.environ.get("VLLM_USE_V1", "")

VLLM_PORT = 8000

# ── 이미지 ────────────────────────────────────────────────────────────────────
# ⚠️ Modal 은 로컬 쉘 env 를 컨테이너 런타임으로 자동 전달하지 않는다.
#    serve() 안(=컨테이너)에서 다시 읽히는 값들은 아래 .env() 로 '구워' 넣어야 한다.
_img_env = {
    "HF_HUB_ENABLE_HF_TRANSFER": "1",       # 모델 다운로드 가속
    # ↓ 배포 시점 로컬 값을 컨테이너 런타임으로 고정
    "VLLM_MODEL": MODEL,
    "VLLM_MAX_MODEL_LEN": MAX_MODEL_LEN,
    "VLLM_GPU_UTIL": GPU_UTIL,
    "VLLM_MAX_BATCHED": MAX_BATCHED,
    "VLLM_REASONING_PARSER": REASONING_PARSER,
    "MODAL_VLLM_TOKEN": API_KEY,
    "SPEC_METHOD": SPEC_METHOD,
    "SPEC_DRAFT_MODEL": SPEC_DRAFT_MODEL,
    "SPEC_NUM_TOKENS": SPEC_NUM_TOKENS,
    "SPEC_PROMPT_LOOKUP_MAX": SPEC_PROMPT_LOOKUP_MAX,
    "SPEC_PROMPT_LOOKUP_MIN": SPEC_PROMPT_LOOKUP_MIN,
}
if VLLM_USE_V1:  # 비어있지 않을 때만 강제(빈 문자열을 굽지 않는다)
    _img_env["VLLM_USE_V1"] = VLLM_USE_V1

vllm_image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install(
        "vllm==0.9.1",                       # Qwen3 지원(≥0.8.5). --speculative-config JSON 방식.
        "huggingface_hub[hf_transfer]",
    )
    .env(_img_env)
)

# 모델 가중치 캐시용 볼륨 — target/draft 재다운로드 방지
hf_cache = modal.Volume.from_name("innerverse-hf-cache", create_if_missing=True)

app = modal.App("innerverse-vllm")


# ── 공용: speculative-config JSON 빌더 (순수 함수, Colab 에서도 재사용 가능) ──
def build_spec_config() -> str | None:
    """--speculative-config 에 넣을 JSON 문자열. off 면 None."""
    if SPEC_METHOD == "off":
        return None
    if SPEC_METHOD == "ngram":
        cfg = {
            "method": "ngram",
            "num_speculative_tokens": int(SPEC_NUM_TOKENS),
            "prompt_lookup_max": int(SPEC_PROMPT_LOOKUP_MAX),
        }
        if SPEC_PROMPT_LOOKUP_MIN:
            cfg["prompt_lookup_min"] = int(SPEC_PROMPT_LOOKUP_MIN)
        return json.dumps(cfg)
    # draft (기본): 별도 초안 모델
    return json.dumps(
        {
            "model": SPEC_DRAFT_MODEL,
            "num_speculative_tokens": int(SPEC_NUM_TOKENS),
        }
    )


# ── 공용: vLLM serve 인자 빌더 (순수 함수) ──
def build_vllm_args() -> list[str]:
    """OpenAI 호환 vLLM serve 커맨드를 '리스트'로 만든다(shell=False 로 실행)."""
    args = [
        "vllm", "serve", MODEL,
        "--host", "0.0.0.0",
        "--port", str(VLLM_PORT),
        "--max-model-len", MAX_MODEL_LEN,
        "--gpu-memory-utilization", GPU_UTIL,
        "--max-num-batched-tokens", MAX_BATCHED,
    ]
    # ✅ 공백 포함 단일 원소 금지 — 반드시 '두 개의 원소'로.
    if REASONING_PARSER:
        args += ["--reasoning-parser", REASONING_PARSER]
    if API_KEY:
        args += ["--api-key", API_KEY]

    spec = build_spec_config()
    if spec:
        args += ["--speculative-config", spec]
    return args


@app.function(
    image=vllm_image,
    gpu=GPU,
    volumes={"/root/.cache/huggingface": hf_cache},
    timeout=60 * 60,                 # 긴 배치/다운로드(target+draft) 대비
    scaledown_window=SCALEDOWN_WINDOW,
)
@modal.concurrent(max_inputs=MAX_CONCURRENT)
@modal.web_server(port=VLLM_PORT, startup_timeout=60 * 10)
def serve():
    """단일 vLLM 인스턴스(:8000)를 SPEC_METHOD 에 맞춰 띄운다.
    외부 접근: https://<...>.modal.run/v1/chat/completions
    스펙 지표(acceptance rate 등)는 GET /metrics 에서 확인."""
    import subprocess

    cmd = build_vllm_args()
    print(f"[modal_vllm] SPEC_METHOD={SPEC_METHOD} 기동:", " ".join(cmd))
    # ✅ 리스트 그대로, shell=False. (VLLM_USE_V1 등은 이미 컨테이너 env 에 구워져 있어 상속됨)
    subprocess.Popen(cmd)


# ── 배포 후 헬스체크용 로컬 진입점 ──
# 사용:  modal run modal_vllm_server_specdec.py --prompt "요즘 계속 불안해요"
@app.local_entrypoint()
def main(prompt: str = ""):
    """배포된 서버에 붙어보는 스모크 테스트. (this runs on your machine)"""
    import urllib.request

    base = os.environ.get("MODAL_VLLM_URL", "").rstrip("/")
    if not base:
        print("MODAL_VLLM_URL 환경변수를 먼저 설정하세요 (배포 시 나온 URL).")
        print("예: export MODAL_VLLM_URL=https://<you>--innerverse-vllm-serve.modal.run")
        return
    if not base.endswith("/v1"):
        base += "/v1"

    headers = {"Content-Type": "application/json"}
    if API_KEY:
        headers["Authorization"] = f"Bearer {API_KEY}"

    # 1) 모델 목록 (target 이 뜨는지 확인)
    try:
        req = urllib.request.Request(f"{base}/models", headers=headers)
        with urllib.request.urlopen(req, timeout=30) as r:
            print("GET /v1/models →", r.read().decode()[:300])
    except Exception as e:
        print("models 조회 실패(아직 기동 중일 수 있음):", e)
        return

    # 2) 실제 추론(선택)
    if prompt:
        body = json.dumps(
            {
                "model": MODEL,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.4,
            }
        ).encode()
        req = urllib.request.Request(f"{base}/chat/completions", data=body, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                data = json.loads(r.read().decode())
                print("응답:", data["choices"][0]["message"]["content"])
        except Exception as e:
            print("추론 실패:", e)
