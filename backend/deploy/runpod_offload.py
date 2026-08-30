"""
RunPod 환경에서 vLLM을 OpenAI 호환 서버로 띄우는 배포 스크립트 (Python Wrapper).
Baseline vLLM(단일 GPU) + Speculative Decoding A/B 테스트용.
"""
import json
import os
import subprocess
import sys

# ── 튜닝 포인트 (터미널에서 실행 시 환경변수로 오버라이드 가능) ──
# MODEL = os.environ.get("VLLM_MODEL", "Qwen/Qwen3-8B")
MODEL = os.environ.get("VLLM_MODEL", "/workspace/models/Qwen3-8B") # eagle3 모델로 변경
MAX_MODEL_LEN = os.environ.get("VLLM_MAX_MODEL_LEN", "16384")
GPU_UTIL = os.environ.get("VLLM_GPU_UTIL", "0.90")  # L4 환경에서 OOM 발생 시 0.85로 조정
MAX_BATCHED = os.environ.get("VLLM_MAX_BATCHED", "8192")
REASONING_PARSER = os.environ.get("VLLM_REASONING_PARSER", "qwen3")
API_KEY = os.environ.get("RUNPOD_VLLM_TOKEN", "my-secret-token") # 외부 노출용 토큰

# ── Speculative decoding 설정 ──
SPEC_METHOD = os.environ.get("SPEC_METHOD", "off").lower()
SPEC_DRAFT_MODEL = os.environ.get("SPEC_DRAFT_MODEL", "AngelSlim/Qwen3-8B_eagle3")
SPEC_NUM_TOKENS = int(os.environ.get("SPEC_NUM_TOKENS", "3")) # 미리 예측할 토큰 수 3
SPEC_PROMPT_LOOKUP_MAX = os.environ.get("SPEC_PROMPT_LOOKUP_MAX", "4")
SPEC_PROMPT_LOOKUP_MIN = os.environ.get("SPEC_PROMPT_LOOKUP_MIN", "")

# ── 캐시 실험 설정 ──
PREFIX_CACHE = os.environ.get("PREFIX_CACHE", "off").lower()
KV_OFFLOAD = os.environ.get("KV_OFFLOAD", "off").lower()
LMCACHE_CONFIG = os.environ.get("LMCACHE_CONFIG", "/workspace/lmcache_config.yaml")


VLLM_PORT = os.environ.get("VLLM_PORT", "8000")

# ⚠️ RunPod 30GB 컨테이너 디스크 용량 부족 방지를 위해 캐시 디렉토리를 Network Volume으로 강제 지정
os.environ["HF_HOME"] = "/workspace/huggingface_cache"
os.environ["HF_HUB_ENABLE_HF_TRANSFER"] = "1"

# 허브 접근 차단
os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"

def build_spec_config() -> str | None:
    """--speculative-config 에 넣을 JSON 문자열. off 면 None."""
    if SPEC_METHOD == "off":
        return None
        ''' n-gram이 일상 챗봇 서비스엔 승인율이 높지 않아 eagle 적용
        if SPEC_METHOD == "ngram":
            cfg = {
                "method": "ngram",
                "num_speculative_tokens": int(SPEC_NUM_TOKENS),
                "prompt_lookup_max": int(SPEC_PROMPT_LOOKUP_MAX),
            }
            if SPEC_PROMPT_LOOKUP_MIN:
                cfg["prompt_lookup_min"] = int(SPEC_PROMPT_LOOKUP_MIN)
            return json.dumps(cfg)
        '''
    if SPEC_METHOD in ("eagle", "eagle3"):
        return json.dumps({
            "model": SPEC_DRAFT_MODEL,
            "method": "eagle3",
            "num_speculative_tokens": SPEC_NUM_TOKENS,
        })
    raise SystemExit(
        f"지원하지 않는 SPEC_METHOD={SPEC_METHOD!r} "
        "(off, eagle 중 선택) draft model 방식은 vllm V1에서 미지원"
    )
    '''
    # draft (기본): 별도 초안 모델 - vllm V1에서 미지원
    return json.dumps(
        {
            "model": SPEC_DRAFT_MODEL,
            "num_speculative_tokens": int(SPEC_NUM_TOKENS),
        }
    )
    '''

def build_cache_args() -> list[str]:
    args = []
    if PREFIX_CACHE == "on":
        args += ["--enable-prefix-caching"]
    else:
        args += ["--no-enable-prefix-caching"]

    if KV_OFFLOAD == "on":
        if PREFIX_CACHE != "on":
            raise SystemExit("KV_OFFLOAD를 켜려면 PREFIX_CACHE=on 이어야 합니다.")
        os.environ["LMCACHE_CONFIG_FILE"] = LMCACHE_CONFIG
        os.environ["VLLM_WORKER_MULTIPROC_METHOD"] ='spawn'
        args += ["--kv-transfer-config",
            json.dumps({"kv_connector": "LMCacheConnectorV1", 
            "kv_role": "kv_both"}),]
            
    return args
    
def build_vllm_args() -> list[str]:
    """OpenAI 호환 vLLM serve 커맨드 리스트 빌드"""
    args = [
        sys.executable, "-m", "vllm.entrypoints.openai.api_server",
        "--model", MODEL,
        "--host", "0.0.0.0",
        "--port", str(VLLM_PORT),
        "--max-model-len", MAX_MODEL_LEN,
        "--gpu-memory-utilization", GPU_UTIL,
        "--max-num-batched-tokens", MAX_BATCHED,
    ]
    args += build_cache_args()
    
    args += ["--served-model-name", "qwen3-8b", "Qwen/Qwen3-8B"] # 모델명 간단히 qwen3-8b
    args += ["--seed", "0", "--disable-log-requests"]
    # disable-log-requests: vLLM 서버가 요청마다 로그를 남기지 않도록 설정. 동시성을 올리기 위해 필요

    # args += ["--trust-remote-code"] # 네이티브 포맷으로 변경함에 따라 주석처리
    if REASONING_PARSER:
        args += ["--reasoning-parser", REASONING_PARSER]
    if API_KEY:
        args += ["--api-key", API_KEY]

    spec = build_spec_config()
    if spec:
        args += ["--speculative-config", spec]
        
    return args

def serve():
    cmd = build_vllm_args()
    print("="*80)
    print(f"🚀 [vllm] SPEC_METHOD={SPEC_METHOD} 기동을 시작합니다.")
    print(f"📁 HF_HOME 지정 경로: {os.environ['HF_HOME']}")
    print(f"💻 실행 커맨드: {' '.join(cmd)}")
    print("="*60)
    
    try:
        # RunPod 컨테이너 내부에서 포그라운드로 실행하여 로그를 바로 볼 수 있게 함
        subprocess.run(cmd, check=True)
    except KeyboardInterrupt:
        print("\n서버가 사용자에 의해 종료되었습니다.")
    except subprocess.CalledProcessError as e:
        print(f"\nvLLM 서버 실행 중 오류가 발생했습니다. (Exit code: {e.returncode})")
        sys.exit(e.returncode)

if __name__ == "__main__":
    serve()