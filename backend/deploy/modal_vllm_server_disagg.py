"""
Modal 에 vLLM 을 OpenAI 호환 서버로 띄우는 배포 스크립트.
(SERVE_MODE 로 baseline ↔ P/D 분리(disagg) 를 토글한다.
 다만 Prefill/Decode Disaggregation은 TTFT 최적화가 중요한 챗봇 서비스에 적합하지 않다.
 baseline과 동일조건에서 concurrency와 prompt length를 바꿔가며 TTFT/TPOT/Throughput/토큰당 비용 측정. 왜 이 스케일에선 이득 없고 어디에서 뒤집히는 지 contention이론으로 설명
 )

이 파일은 백엔드(main.py)와 별개로, '축 2 = modal' 을 실제로 뒷받침하는
vLLM 서버를 Modal 에 배포한다.

  ※ 이 파일 자체는 `import modal` 때문에 Colab 에서 그대로 import 되진 않는다.
    Colab 과 정말로 '공유'할 순수 로직은 build_vllm_args() 하나뿐이니,
    Colab 노트북에서는 이 함수 본문만 복사해서 vllm serve 커맨드를 재현하면 된다.

관계도:
    [프론트] → [main.py /api/analyze] → analyzers.VllmAnalyzer
                                            → providers.ModalProvider
                                            → 여기서 배포한 이 서버(/v1)
                                              (disagg 모드면 /v1 앞단이 프록시)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
배포 순서
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  1) pip install modal
  2) modal token new                       # 최초 1회 (브라우저 인증)
  3) (선택) 게이트 모델이면 HF 토큰 시크릿 등록:
         modal secret create huggingface-secret HF_TOKEN=hf_xxx

  4) 배포 — 모드를 env 로 고른다:
       # ── baseline (단일 GPU, chunked prefill) ──
       SERVE_MODE=baseline VLLM_GPU=L4 modal deploy modal_vllm_server.py
       # ── disagg  (P/D 분리, GPU 2장 + 프록시) ──
       SERVE_MODE=disagg  VLLM_GPU=L4:2 modal deploy modal_vllm_server.py

  5) 출력된 URL 을 backend/.env 에:
         ANALYZER_BACKEND=vllm
         VLLM_PROVIDER=modal
         MODAL_VLLM_URL=https://<you>--innerverse-vllm-serve.modal.run
         VLLM_MODEL=Qwen/Qwen3-8B   # ← 아래 MODEL 과 반드시 일치
     (providers.ModalProvider 가 뒤에 /v1 을 자동으로 붙인다)

  로컬 빠른 확인:
       SERVE_MODE=disagg VLLM_GPU=L4:2 modal serve modal_vllm_server.py   # 임시 URL 라이브 테스트

⚠️ 두 가지 반드시 일치:
   - MODEL ↔ backend 의 VLLM_MODEL  (OpenAI 호환 API 는 model 필드가 서버 로드본과 일치해야 함)
   - Qwen3 는 vLLM ≥ 0.8.5 필요(여기선 0.9.1). 0.6.x 로는 Qwen3 자체가 로드 안 된다.

━━━ 벤치마크(포트폴리오용 TTFT / throughput 비교) ━━━
  두 모드를 각각 배포한 뒤, 동일 부하로 vLLM 내장 벤치를 돌려 비교한다:
       vllm bench serve --model Qwen/Qwen3-8B \
            --base-url https://<...baseline...>.modal.run \
            --endpoint /v1/chat/completions --dataset-name random ...
       vllm bench serve --model Qwen/Qwen3-8B \
            --base-url https://<...disagg...>.modal.run  ...
  → TTFT / TPOT / throughput 을 baseline vs disagg 로 표로 정리하면 그대로 결과물이 된다.
"""
from __future__ import annotations

import json
import os

import modal

# ── 튜닝 포인트 (전부 env 로 조절, 배포 시점의 로컬 값이 아래 image.env 로 구워진다) ──
# 서빙할 모델. backend 의 VLLM_MODEL 과 동일해야 한다.
MODEL = os.environ.get("VLLM_MODEL", "Qwen/Qwen3-8B")
# GPU 타입. baseline=1장(L4). disagg 는 2장 필요 → "L4:2".
GPU = os.environ.get("VLLM_GPU", "L4")
# 동시 요청 여유. vLLM 이 배칭하므로 1 컨테이너가 여러 요청 처리 가능.
MAX_CONCURRENT = int(os.environ.get("VLLM_MAX_CONCURRENT", "10"))
# 유휴 시 컨테이너 유지 시간(초). 짧으면 비용↓ 콜드스타트↑.
SCALEDOWN_WINDOW = int(os.environ.get("VLLM_SCALEDOWN", "300"))
# vLLM 서버가 요구할 API 키(선택). 설정하면 --api-key 로 전달, 프록시도 같은 키를 붙인다.
# 비우면 인증 없음.
API_KEY = os.environ.get("MODAL_VLLM_TOKEN", "")
# 컨텍스트 길이. L4(24G)+Qwen3-8B 에서 OOM 나면 8192 등으로 낮춘다.
MAX_MODEL_LEN = os.environ.get("VLLM_MAX_MODEL_LEN", "16384")
# GPU 메모리 사용률. OOM(특히 CUDA graph capture) 나면 0.85 로.
GPU_UTIL = os.environ.get("VLLM_GPU_UTIL", "0.90")
# baseline 의 chunked prefill 노브. 값↓ = TTFT 유리 / 값↑ = throughput 유리.
MAX_BATCHED = os.environ.get("VLLM_MAX_BATCHED", "8192")
# Qwen3 사고과정/답변 분리용 reasoning parser. 비우면 미적용.
# (disagg 는 V0 엔진으로 도는데, 혹시 V0 에서 문제되면 VLLM_REASONING_PARSER="" 로 끄면 된다.)
REASONING_PARSER = os.environ.get("VLLM_REASONING_PARSER", "qwen3")

VLLM_PORT = 8000        # 외부로 노출되는 포트. baseline=vLLM 본체 / disagg=프록시.
PREFILL_PORT = 8100     # disagg 내부: prefill(producer)
DECODE_PORT = 8200      # disagg 내부: decode(consumer)

# baseline | disagg
SERVE_MODE = os.environ.get("SERVE_MODE", "baseline")

# disagg 인데 GPU 를 1장으로 준 흔한 실수 → 자동으로 2장 확보.
if SERVE_MODE == "disagg" and ":" not in GPU:
    GPU = f"{GPU}:2"

# ── 이미지 ────────────────────────────────────────────────────────────────────
# ⚠️ Modal 은 '로컬 쉘 env' 를 컨테이너 런타임으로 자동 전달하지 않는다.
#    SERVE_MODE 등은 serve() 안(=컨테이너)에서 다시 읽히므로, 배포 시점의 로컬 값을
#    아래 .env(...) 로 이미지에 '구워' 넣어야 컨테이너에서도 같은 값이 된다.
#    (이걸 빼먹으면: disagg 로 배포 → 컨테이너에선 baseline 으로 읽혀 2GPU 낭비 + 분리 안 됨)
vllm_image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install(
        "vllm==0.9.1",                       # Qwen3 지원(≥0.8.5). 0.6.x 는 Qwen3 로드 불가.
        "huggingface_hub[hf_transfer]",
        "quart", "aiohttp",                  # disagg 프록시용
    )
    .env(
        {
            "HF_HUB_ENABLE_HF_TRANSFER": "1",   # 모델 다운로드 가속
            # ↓ 배포 시점 로컬 값을 컨테이너 런타임으로 고정
            "SERVE_MODE": SERVE_MODE,
            "VLLM_MODEL": MODEL,
            "VLLM_MAX_MODEL_LEN": MAX_MODEL_LEN,
            "VLLM_GPU_UTIL": GPU_UTIL,
            "VLLM_MAX_BATCHED": MAX_BATCHED,
            "VLLM_REASONING_PARSER": REASONING_PARSER,
            "MODAL_VLLM_TOKEN": API_KEY,
            # NCCL P2P 문제로 disagg 가 멈추면 아래 주석을 풀어 host-memory 폴백(느리지만 동작):
            # "NCCL_P2P_DISABLE": "1",
            # KV cache 전송 벡엔드로 NCCL P2P 적용"
        }
    )
)

# 모델 가중치 캐시용 볼륨 — 재배포/스케일 시 재다운로드 방지
hf_cache = modal.Volume.from_name("innerverse-hf-cache", create_if_missing=True)

app = modal.App("innerverse-vllm")


# ── 공용: vLLM serve 인자 빌더 (순수 함수) ──
def build_vllm_args(port: int, kv_role: str | None = None) -> list[str]:
    """OpenAI 호환 vLLM serve 커맨드를 '리스트'로 만든다(shell=False 로 실행할 것).

    kv_role=None       → baseline (단일 인스턴스)
    kv_role="producer" → disagg prefill 인스턴스
    kv_role="consumer" → disagg decode 인스턴스
    """
    args = [
        "vllm", "serve", MODEL,
        "--host", "0.0.0.0",
        "--port", str(port),
        "--max-model-len", MAX_MODEL_LEN,
        "--gpu-memory-utilization", GPU_UTIL,
    ]
    if REASONING_PARSER:
        args += ["--reasoning-parser", REASONING_PARSER]
    if API_KEY:
        args += ["--api-key", API_KEY]

    if kv_role is None:
        # baseline: chunked prefill 튜닝 노브
        args += ["--max-num-batched-tokens", MAX_BATCHED]
    else:
        # disagg: KV 전송 설정. PyNcclConnector = 단일 노드 2GPU 용(0.9.1 공식 예제).
        kv_cfg = json.dumps(
            {
                "kv_connector": "PyNcclConnector",
                "kv_role": f"kv_{kv_role}",        # kv_producer / kv_consumer
                "kv_rank": 0 if kv_role == "producer" else 1,
                "kv_parallel_size": 2,
            }
        )
        args += ["--kv-transfer-config", kv_cfg]
    return args


# ── disagg 프록시(:8000) 소스 — 컨테이너 안에 파일로 떨궈 실행한다 ──
# 공식 예제(disagg_prefill_proxy_server.py)를 확장:
#   (1) prefill 인스턴스에 max_tokens=1 로 KV 캐시만 채우고
#   (2) decode 인스턴스에서 실제 토큰을 스트리밍한다.
#   + /v1/chat/completions, /v1/models 라우트 추가(백엔드/스모크테스트가 사용).
#   이때 스트리밍 방식은 HTTP SSE 방식
PROXY_SRC = r'''
import os
import aiohttp
from quart import Quart, request, make_response, Response

PREFILL = "http://localhost:8100"
DECODE  = "http://localhost:8200"
TOKEN   = os.environ.get("MODAL_VLLM_TOKEN", "")
TIMEOUT = aiohttp.ClientTimeout(total=6 * 60 * 60)

app = Quart(__name__)


def _headers():
    h = {"Content-Type": "application/json"}
    if TOKEN:
        h["Authorization"] = f"Bearer {TOKEN}"
    return h


async def _stream(url, data):
    async with aiohttp.ClientSession(timeout=TIMEOUT) as s:
        async with s.post(url, json=data, headers=_headers()) as r:
            async for chunk in r.content.iter_chunked(1024):
                yield chunk


async def _handle(path):
    original = await request.get_json()

    # 1) prefill(producer): max_tokens=1 로 KV 캐시만 생성(출력은 버림)
    prefill = dict(original)
    prefill["max_tokens"] = 1
    if "max_completion_tokens" in prefill:
        prefill["max_completion_tokens"] = 1
    async for _ in _stream(f"{PREFILL}{path}", prefill):
        pass

    # 2) decode(consumer): 전송된 KV 를 받아 실제 생성 → 그대로 스트리밍
    resp = await make_response(_stream(f"{DECODE}{path}", original))
    resp.timeout = None
    resp.headers["Content-Type"] = (
        # SSE(server-sent events) 
        "text/event-stream" if original.get("stream") else "application/json"
    )
    return resp


@app.route("/v1/completions", methods=["POST"])
async def completions():
    return await _handle("/v1/completions")


@app.route("/v1/chat/completions", methods=["POST"])
async def chat_completions():
    return await _handle("/v1/chat/completions")


@app.route("/v1/models", methods=["GET"])
async def models():
    # 헬스체크/스모크테스트용: decode 인스턴스로 그대로 패스스루
    async with aiohttp.ClientSession(timeout=TIMEOUT) as s:
        async with s.get(f"{DECODE}/v1/models", headers=_headers()) as r:
            body = await r.read()
            return Response(body, status=r.status, content_type="application/json")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000)
'''


def _spawn(cmd: list[str], gpu_index: int | None = None, force_v0: bool = False):
    """서브프로세스로 vLLM/프록시를 띄운다. (리스트 그대로, shell=False)"""
    import subprocess

    env = dict(os.environ)
    if gpu_index is not None:
        env["CUDA_VISIBLE_DEVICES"] = str(gpu_index)   # 인스턴스별 GPU 고정
    if force_v0:
        env["VLLM_USE_V1"] = "0"                        # PyNcclConnector 는 V0 커넥터

    print(f"[modal_vllm] spawn (CUDA={env.get('CUDA_VISIBLE_DEVICES','all')}):", " ".join(cmd))
    return subprocess.Popen(cmd, env=env)              # 문자열 join ❌, 리스트 그대로


@app.function(
    image=vllm_image,
    gpu=GPU,
    volumes={"/root/.cache/huggingface": hf_cache},
    # secrets=_secrets,
    timeout=60 * 60,                 # 긴 배치/다운로드 대비
    scaledown_window=SCALEDOWN_WINDOW,
)
@modal.concurrent(max_inputs=MAX_CONCURRENT)
@modal.web_server(port=VLLM_PORT, startup_timeout=60 * 10)
def serve():
    """SERVE_MODE 에 따라 baseline / disagg 를 띄운다.
    외부 접근: https://<...>.modal.run/v1/chat/completions"""
    import sys

    if SERVE_MODE == "disagg":
        # ── P/D 분리: GPU0=prefill(:8100), GPU1=decode(:8200), 프록시(:8000) ──
        # (Modal 은 :8000 이 열리면 'ready' 로 보므로, 두 vLLM 로그가 다 뜬 뒤 호출할 것)
        _spawn(build_vllm_args(PREFILL_PORT, kv_role="producer"), gpu_index=0, force_v0=True)
        _spawn(build_vllm_args(DECODE_PORT, kv_role="consumer"), gpu_index=1, force_v0=True)
        with open("/root/proxy.py", "w") as f:
            f.write(PROXY_SRC)
        _spawn([sys.executable, "/root/proxy.py"])     # 외부 노출 = 프록시(:8000)
        print("[modal_vllm] disagg 기동: prefill(GPU0:8100) + decode(GPU1:8200) + proxy(:8000)")
    else:
        # ── baseline: 단일 인스턴스가 :8000 을 그대로 서빙 ──
        _spawn(build_vllm_args(VLLM_PORT))
        print("[modal_vllm] baseline 기동: 단일 vLLM(:8000)")


# ── 배포 후 헬스체크용 로컬 진입점 ──
# 사용:  modal run modal_vllm_server.py            # 모델 목록 확인
#        modal run modal_vllm_server.py --prompt "안녕"   # 실제 추론 1회
@app.local_entrypoint()
def main(prompt: str = ""):
    """배포된 서버(=disagg 면 프록시)에 실제로 붙어보는 스모크 테스트.
    (this runs on your machine, calls the deployed Modal URL)"""
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

    # 1) 모델 목록 (disagg 면 두 인스턴스가 다 뜨기 전엔 실패할 수 있음 → 잠시 뒤 재시도)
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
