import json
import os
import time
import threading
import urllib.request
import random
from typing import Optional

from locust import User, task, between, events
from openai import OpenAI

# ─────────────────────────────────────────────────────────────
# 1. 설정 및 글로벌 변수
# ─────────────────────────────────────────────────────────────
VLLM_BASE_URL = os.getenv("VLLM_BASE_URL", "http://localhost:8000/v1")
MODEL_NAME = os.getenv("MODEL_NAME", "Qwen/Qwen3-8B")
_RUN_TS = time.strftime("%Y%m%d_%H%M")
LOG_PATH = os.getenv("MOMO_METRICS_LOG", f"momo_metrics_{_RUN_TS}.jsonl")
# LOG_PATH = os.getenv("MOMO_METRICS_LOG", "momo_metrics.jsonl")

# ─────────────────────────────────────────────────────────────
# 2. Prometheus Metrics 백그라운드 캐싱 (엔드포인트 과부하 방지)
# ─────────────────────────────────────────────────────────────
class MetricsCache:
    """별도의 스레드에서 1초마다 vLLM 상태를 가져와 캐싱합니다."""
    def __init__(self, base_url: str):
        self.base_url = base_url
        self.metrics = {}
        self.lock = threading.Lock()
        
        # TPS 계산용 상태 변수 추가
        self.last_time = time.time()
        self.last_tokens = None
        
        # 데몬 스레드 시작
        thread = threading.Thread(target=self._update_loop, daemon=True)
        thread.start()
        
    def _metrics_url(self) -> str:
        root = self.base_url.rstrip("/")
        if root.endswith("/v1"):
            root = root[:-len("/v1")]
        return root + "/metrics"


    def _update_loop(self):
        while True:
            try:
                req = urllib.request.Request(self._metrics_url())
                with urllib.request.urlopen(req, timeout=1.0) as r:
                    text = r.read().decode("utf-8", "replace")
                    parsed = self._parse_prom(text)
                    
                    # --- System TPS 직접 계산 로직 추가 ---
                    now = time.time()
                    cur_tokens = parsed.get("gen_tokens_total")
                    
                    with self.lock:
                        if cur_tokens is not None:
                            if self.last_tokens is not None:
                                dt = now - self.last_time
                                dtok = cur_tokens - self.last_tokens
                                if dt > 0 and dtok >= 0:
                                    parsed["system_tps"] = round(dtok / dt, 2)
                            
                            self.last_time = now
                            self.last_tokens = cur_tokens
                            
                        self.metrics = parsed
            except Exception as e:
                with self.lock:
                    self.metrics = {"scrape_error": str(e)}
            time.sleep(1.0) # 1초 주기로 갱신

    def _parse_prom(self, text: str) -> dict:
        out = {}
        for line in text.splitlines():
            if not line or line.startswith("#"): continue
            try:
                name_part, val = line.rsplit(" ", 1)
                value = float(val)
                base = name_part.split("{", 1)[0]
                
                # 필요한 지표만 추출
                if base == "vllm:num_requests_running": out["num_running"] = value
                elif base == "vllm:num_requests_waiting": out["num_waiting"] = value
                elif base in ("vllm:gpu_cache_usage_perc", "vllm:kv_cache_usage_perc"):
                    out["kv_cache_usage"] = value
                # gen_tps_gauge 는 deprecated. counter로 대체
                elif base == "vllm:generation_tokens_total": 
                    out["gen_tokens_total"] = value # TPS 계산을 위해 가져옴
            except:
                continue
        return out

    def get_current(self) -> dict:
        with self.lock:
            return self.metrics.copy()

# 우리가 쓸 vLLM 지표 (버전에 따라 일부가 없을 수 있어 방어적으로 파싱)
_GAUGES = {
    "vllm:num_requests_running": "num_running",   # active sequence count
    "vllm:num_requests_waiting": "num_waiting",   # 큐 대기 수
    "vllm:gpu_cache_usage_perc": "kv_cache_usage",  # kv cache 점유율(0~1)
    "vllm:kv_cache_usage_perc": "kv_cache_usage",   # (신버전 별칭)
    "vllm:avg_generation_throughput_toks_per_s": "gen_tps_gauge",  # system tps (게이지가 있으면)
}
_COUNTERS = {
    "vllm:generation_tokens_total": "gen_tokens_total",  # system tps 계산용(델타)
}
# histogram: _sum / _count 로 평균 산출 — queue time 만 서버에서 가져온다.
# TTFT/TPOT 는 '요청별'로 streaming_chat 에서 직접 측정하므로 서버 평균(histogram)은 쓰지 않는다.
_HISTS = {
    "vllm:request_queue_time_seconds": "queue_time_avg",   # queue time
}

# 전역 메트릭 캐시 인스턴스
global_metrics_cache = MetricsCache(VLLM_BASE_URL)

''' system tps 계산용 이전 스냅샷 저장 (base_url → (timestamp, gen_tokens_total))
def _system_tps(base_url: str, server: dict) -> Optional[float]:
    """generation_tokens_total 델타/시간으로 실측 system tps. 게이지가 있으면 그걸 우선."""
    gauge = server.get("gen_tps_gauge")
    if gauge is not None:
        return round(float(gauge), 2)
    cur = server.get("gen_tokens_total")
    now = time.time()
    if cur is None:
        return None
    prev = _last_snap.get(base_url)
    _last_snap[base_url] = (now, float(cur))
    if not prev:
        return None
    dt = now - prev[0]
    dtok = float(cur) - prev[1]
    return round(dtok / dt, 2) if dt > 0 and dtok >= 0 else None

'''
# ─────────────────────────────────────────────────────────────
# 3. 측정 유틸리티 함수
# ─────────────────────────────────────────────────────────────
def _append_jsonl(obj: dict) -> None:
    try:
        with open(LOG_PATH, "a", encoding="utf-8") as f:
            f.write(json.dumps(obj, ensure_ascii=False) + "\n")
    except Exception as e:
        print(f"JSONL Write Error: {e}")

def _percentile(data: list, percentile: float) -> Optional[float]:
    if not data: return None
    s = sorted(data)
    idx = min(len(s) - 1, int(len(s) * percentile))
    return round(s[idx], 4)

# ─────────────────────────────────────────────────────────────
# 4. Locust User 정의
# ─────────────────────────────────────────────────────────────
class VLLMLocustUser(User):
    # 유저별로 요청 사이에 1~3초 대기 (실제 사용자 패턴 모사)
    wait_time = between(1.0, 3.0)

    def on_start(self):
        """유저 생성 시 OpenAI 클라이언트 초기화"""
        self.client = OpenAI(base_url=VLLM_BASE_URL, api_key=os.getenv("VLLM_API_KEY", "my-secret-key"))
        self.prompts = [
            "양자역학의 기본 원리를 3문장으로 설명해줘.",
            "파이썬에서 데코레이터가 무엇인지 예시 코드를 작성해줘.",
            "광합성 과정을 초등학생도 이해할 수 있게 쉽게 비유해서 설명해줄래?",
            "리더십에서 가장 중요한 덕목 3가지는 무엇이라고 생각해?"
        ]

    @task
    def streaming_chat_task(self):
        prompt = random.choice(self.prompts)
        messages = [{"role": "user", "content": prompt}]
        
        # 1. 서버 현재 상태 캐시 조회 (엔드포인트 부하 없음)
        server_state = global_metrics_cache.get_current()
        
        t0 = time.perf_counter()
        ttft = None
        last_chunk_time = t0
        itls = []
        parts = []
        out_tokens = 0
        error_msg = None

        try:
            stream = self.client.chat.completions.create(
                model=MODEL_NAME,
                messages=messages,
                max_tokens=512,
                temperature=0.7,
                stream=True,
                stream_options={"include_usage": True},
            )

            for chunk in stream:
                chunk_time = time.perf_counter()
                
                # 텍스트 추출
                for chunk in stream:
                    chunk_time = time.perf_counter()
                    if not chunk.choices:
                        continue  # 마지막 usage 청크
                    delta = chunk.choices[0].delta
                    piece = delta.content or getattr(delta, "reasoning_content", None)
                    if piece:
                        parts.append(piece)
                        if ttft is None:
                            ttft = chunk_time - t0
                        else:
                            itls.append(chunk_time - last_chunk_time)
                        last_chunk_time = chunk_time
                        out_tokens += 1

        except Exception as e:
            error_msg = str(e)
            
        e2e = time.perf_counter() - t0

        # 지표 연산
        gen_time = max(1e-6, e2e - (ttft or 0.0))
        tpot = round(gen_time / max(1, out_tokens - 1), 6) if out_tokens > 1 else None
        
        # Locust 대시보드에 요청 결과 보고
        if error_msg:
            events.request.fire(
                request_type="STREAM",
                name="/chat/completions",
                response_time=e2e * 1000,
                response_length=0,
                exception=Exception(error_msg)
            )
        else:
            events.request.fire(
                request_type="STREAM",
                name="/chat/completions",
                response_time=e2e * 1000,
                response_length=len("".join(parts)),
                exception=None
            )

        # 9지표 + ITL + system_tps 디테일 JSONL 기록
        num_running = server_state.get("num_running", 0)
        num_waiting = server_state.get("num_waiting", 0)
        system_tps = server_state.get("system_tps")
        
        rec = {
            "ts": time.time(), # 요청 완료 시각 로그
            "model": MODEL_NAME,
            "output_tokens": out_tokens,
            "active_seq": num_running,
            "num_waiting": num_waiting,
            "concurrency": num_running + num_waiting,
            "kv_cache_usage": server_state.get("kv_cache_usage"),
            "ttft_s": round(ttft, 4) if ttft else None,
            "tpot_s": tpot,
            "max_itl_s": round(max(itls), 4) if itls else None,
            "p90_itl_s": _percentile(itls, 0.90),
            "e2e_s": round(e2e, 4),
            "system_tps": system_tps,
            "error": error_msg
        }
        
        _append_jsonl(rec)