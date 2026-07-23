"""
Modal 에 vLLM 을 OpenAI 호환 서버로 띄우는 배포 스크립트.

이 파일은 백엔드(main.py)와 별개로, '축 2 = modal' 을 실제로 뒷받침하는
vLLM 서버를 Modal 에 배포한다.

관계도:
    [프론트] → [main.py /api/analyze] → analyzers.VllmAnalyzer
                                            → providers.ModalProvider
                                            → 여기서 배포한 이 서버(/v1)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
배포 순서
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  1) pip install modal
  2) modal token new                       # 최초 1회 (브라우저 인증)
  3) (선택) 게이트 모델이면 HF 토큰 시크릿 등록:
         modal secret create huggingface-secret HF_TOKEN=hf_xxx
  4) modal deploy modal_vllm_server.py
  5) 출력된 URL 을 backend/.env 에:
         ANALYZER_BACKEND=vllm
         VLLM_PROVIDER=modal
         MODAL_VLLM_URL=https://<you>--innerverse-vllm-serve.modal.run
         VLLM_MODEL=Qwen3-8B         # ← 아래 MODEL 과 반드시 일치
     (providers.ModalProvider 가 뒤에 /v1 을 자동으로 붙인다)

  로컬 빠른 확인:  modal serve modal_vllm_server.py   # 임시 URL 로 라이브 테스트

⚠️ MODEL 값을 바꾸면 backend 의 VLLM_MODEL 도 똑같이 바꿔야 한다.
   (OpenAI 호환 API 는 model 필드가 서버에 로드된 것과 일치해야 함)
"""
from __future__ import annotations

import os

import modal

# ── 튜닝 포인트 ───────────────────────────────────────────────────────────────
# 서빙할 모델. backend 의 VLLM_MODEL 과 동일해야 한다.
MODEL = os.environ.get("VLLM_MODEL", "Qwen/Qwen3-8B")
# GPU 타입. 7B 급은 L4/A10G 로 충분. 더 큰 모델이면 "A100" 등으로.
GPU = os.environ.get("VLLM_GPU", "L4")
# 동시 요청 여유. vLLM 이 배칭하므로 1 컨테이너가 여러 요청 처리 가능.
MAX_CONCURRENT = int(os.environ.get("VLLM_MAX_CONCURRENT", "10"))
# 유휴 시 컨테이너 유지 시간(초). 짧으면 비용↓ 콜드스타트↑.
SCALEDOWN_WINDOW = int(os.environ.get("VLLM_SCALEDOWN", "300"))
# vLLM 서버가 요구할 API 키(선택). 설정하면 --api-key 로 전달.
# backend 의 MODAL_VLLM_TOKEN 과 일치시켜야 한다. 비우면 인증 없음.
API_KEY = os.environ.get("MODAL_VLLM_TOKEN", "")
VLLM_PORT = 8000
# VLLM_VERSION = "0.21.0"

# ── 이미지 ────────────────────────────────────────────────────────────────────
# vLLM + FastAPI 서버가 들어간 이미지. 버전은 필요에 맞게 올려도 됨.
vllm_image = (
    modal.Image.debian_slim(python_version="3.12")
    # .pip_install("vllm==0.6.3", "huggingface_hub[hf_transfer]==0.26.2") # Qwen3-8B 로드를 위해 vllm 버전 수정 필요
    # ===== FIX: transformers 핀 고정 — vllm 0.9.1 이 aimv2 를 직접 등록하는데
    #   transformers>=4.54.0 이 aimv2 를 내장하면서 충돌("already used") → import 단계에서 죽음.
    #   vllm<=0.10.0 은 transformers<4.54.0 필요. 4.51.3 = Qwen3 지원 + 커뮤니티 검증된 안전값.
    #   기존: .pip_install("vllm==0.9.1", "huggingface_hub[hf_transfer]")
    # --- FIX2: [hf_transfer] 제거 → huggingface_hub 가 hf_xet(Xet 가속)을 자동 포함 (deprecated 회피)
    .pip_install("vllm==0.9.1", "transformers==4.51.3", "huggingface_hub")
    # ===== /FIX =====
    # --- FIX2: HF_HUB_ENABLE_HF_TRANSFER 제거 (deprecated 경고). hf_xet 설치 시 Xet 이 기본 활성
    #   (adaptive concurrency)이라 env 불필요. HF_XET_HIGH_PERFORMANCE=1 은 16GB 버퍼·RAM 64GB 요구 →
    #   L4 기본 컨테이너에선 호스트 RAM OOM 위험이라 일부러 안 켬 (필요하면 memory=65536+ 후 추가).
)

# 모델 가중치 캐시용 볼륨 — 재배포/스케일 시 재다운로드 방지
hf_cache = modal.Volume.from_name("innerverse-hf-cache", create_if_missing=True)

app = modal.App("innerverse-vllm")
'''
# 게이트(승인 필요) 모델을 위한 HF 토큰 시크릿. 공개 모델이면 없어도 됨.
_secrets = []
try:
    _secrets.append(modal.Secret.from_name("huggingface-secret"))
except Exception:
    # 시크릿 미등록이면 무시(공개 모델 가정)
    pass
'''

@app.function(
    image=vllm_image,
    gpu=GPU,
    volumes={"/root/.cache/huggingface": hf_cache},
    # secrets=_secrets,
    timeout=60 * 60,             # 긴 배치/다운로드 대비
    scaledown_window=SCALEDOWN_WINDOW,
)
@modal.concurrent(max_inputs=MAX_CONCURRENT) # 동시에 처리할 요청
@modal.web_server(port=VLLM_PORT, startup_timeout=60 * 10)
#  ⚠️ 모든 웹 함수는 요청당 150초 하드 HTTP 타임아웃 강제(별도 지정 불가)
def serve():
    """vLLM 의 OpenAI 호환 서버를 그대로 띄운다.
    → https://<...>.modal.run/v1/chat/completions 로 접근 가능."""
    import subprocess

    cmd = [
        "vllm", "serve", MODEL,
        "--host", "0.0.0.0",
        "--port", str(VLLM_PORT),
        # 컨텍스트 길이는 모델/GPU 메모리에 맞춰 조정
        "--max-model-len", os.environ.get("VLLM_MAX_MODEL_LEN", "8192"),
        # "--max-model-len", os.environ.get("VLLM_MAX_MODEL_LEN", "16384"),
        # Qwen3-8B에서 사고과정/답변생성 분리
        # ===== FIX: 한 문자열 → 두 토큰 (shell=False 리스트는 원소 안 공백을 안 쪼갬) =====
        # 기존: "--reasoning-parser qwen3"  → vllm 이 통째로 보고 인자 인식 실패
        "--reasoning-parser", "qwen3",
        # ===== /FIX =====
    ]
    if API_KEY:
        cmd += ["--api-key", API_KEY]

    print("[modal_vllm] 실행:", " ".join(cmd))
    # ===== FIX: shell=False 에는 리스트(cmd)를 그대로 — join 하면 안 됨 =====
    # 기존: subprocess.Popen(" ".join(cmd), shell=False)
    #   → 합친 문자열 전체를 '실행파일명'으로 찾아 FileNotFoundError
    #   → 리스트+shell=False 가 정석(중간 셸 없이 vllm 직접 실행 → 종료 시그널도 깔끔)
    subprocess.Popen(cmd)
    # ===== /FIX =====

# ── 배포 후 헬스체크용 로컬 진입점 ──
# 사용:  modal run modal_vllm_server.py            # 모델 목록 확인
#        modal run modal_vllm_server.py --prompt "안녕"   # 실제 추론 1회
@app.local_entrypoint()
def main(prompt: str = ""):
    """배포된 서버에 실제로 붙어보는 스모크 테스트.
    (this runs on your machine, calls the deployed Modal URL)"""
    import json
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

    # 1) 모델 목록
    try:
        req = urllib.request.Request(f"{base}/models", headers=headers)
        with urllib.request.urlopen(req, timeout=30) as r:
            print("GET /v1/models →", r.read().decode()[:300])
    except Exception as e:
        print("models 조회 실패:", e)
        return

    # 2) 실제 추론(선택)
    if prompt:
        body = json.dumps({
            "model": MODEL,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.4,
        }).encode()
        req = urllib.request.Request(f"{base}/chat/completions", data=body, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                data = json.loads(r.read().decode())
                print("응답:", data["choices"][0]["message"]["content"])
        except Exception as e:
            print("추론 실패:", e)
