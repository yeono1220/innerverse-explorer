"""
모모챗 vLLM 성능 로깅 — 지연시간·처리량(latency-throughput) trade-off 실험용.

수집하는 9지표:
    1) input/output 토큰 수      2) concurrency
    3) active sequence count     4) queue time
    5) kv cache 점유율            6) ttft (time to first token)
    7) tpot (time per output token)  8) actual e2e latency
    9) system tps

수집 방식 (A안):
    - 요청별 정밀 지표(ttft/tpot/e2e/토큰/req tps)는 vLLM 을 '스트리밍'으로 호출하며 직접 측정.
      (프론트 API 계약은 그대로 — 백엔드가 스트림을 다 받아 완성 텍스트를 반환)
    - 서버 전역 지표(concurrency/active seq/queue/kv%/system tps)는 vLLM 의 Prometheus
      /metrics 엔드포인트를 스냅샷해서 붙인다.
    → 두 출처를 한 줄에 합쳐 기록하므로 "그 순간 서버 부하 ↔ 내 요청 지연" 을 상관지을 수 있다.

출력:
    - 매 턴: 9지표 JSON 한 줄을 터미널 출력 + JSONL 파일 적재
    - 대화 마무리: 그 세션의 턴들을 집계한 요약 블록 출력 + JSONL 적재

※ 모모챗 경로(momo_reply / momo_diary)에서만 사용한다.
"""
from __future__ import annotations

import json
import os
import threading
import time
import urllib.request
from collections import defaultdict
from typing import Optional

# JSONL 적재 경로 (환경변수로 덮어쓰기 가능)
LOG_PATH = os.getenv("MOMO_METRICS_LOG", "momo_metrics.jsonl")

# 세션별 턴 지표 누적 (대화 마무리 요약용)
_sessions: dict[str, list[dict]] = defaultdict(list)
# system tps 계산용 직전 스냅샷: base_url -> (ts, generation_tokens_total)
_last_snap: dict[str, tuple[float, float]] = {}
_lock = threading.Lock()


# ─────────────────────────────────────────────────────────────
# vLLM /metrics (Prometheus) 스냅샷 & 파싱
# ─────────────────────────────────────────────────────────────
def _metrics_url(base_url: str) -> str:
    """base_url 은 .../v1 형태 → Prometheus /metrics 는 루트에 노출된다."""
    root = base_url.rstrip("/")
    if root.endswith("/v1"):
        root = root[: -len("/v1")]
    return root + "/metrics"


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


def parse_prom(text: str) -> dict:
    """vLLM Prometheus 텍스트에서 필요한 값만 추출. 라벨은 무시하고 첫 표본 사용."""
    out: dict = {}
    sums: dict[str, float] = {}
    counts: dict[str, float] = {}
    for line in text.splitlines():
        if not line or line[0] == "#":
            continue
        try:
            name_part, val = line.rsplit(" ", 1)
            value = float(val)
        except ValueError:
            continue
        base = name_part.split("{", 1)[0]
        if base in _GAUGES:
            out.setdefault(_GAUGES[base], value)
        elif base in _COUNTERS:
            out.setdefault(_COUNTERS[base], value)
        else:
            for hname, okey in _HISTS.items():
                if base == hname + "_sum":
                    sums[okey] = sums.get(okey, 0.0) + value
                elif base == hname + "_count":
                    counts[okey] = counts.get(okey, 0.0) + value
    for okey in _HISTS.values():
        if counts.get(okey):
            out[okey] = round(sums.get(okey, 0.0) / counts[okey], 5)
    return out


def scrape_vllm_metrics(base_url: str, timeout: float = 2.0) -> dict:
    """vLLM /metrics 스냅샷 → 서버 전역 지표 dict. 실패해도 예외 없이 {}(에러 표기)."""
    try:
        req = urllib.request.Request(_metrics_url(base_url))
        with urllib.request.urlopen(req, timeout=timeout) as r:  # noqa: S310 (신뢰된 내부 URL)
            return parse_prom(r.read().decode("utf-8", "replace"))
    except Exception as e:  # noqa: BLE001
        return {"scrape_error": str(e)}


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


# ─────────────────────────────────────────────────────────────
# 스트리밍 계측 (요청별 ttft/tpot/e2e/토큰) + 9지표 로깅
# ─────────────────────────────────────────────────────────────
def _approx_tokens(text: str) -> int:
    """usage 가 없을 때의 대략적 토큰 추정(한국어 혼합 안전값)."""
    return max(1, round(len(text) / 2)) if text else 0


def streaming_chat(
    client,
    model: str,
    messages: list,
    temperature: float,
    base_url: str,
    *,
    call_type: str,
    session_id: Optional[str] = None,
) -> tuple[str, dict]:
    """
    vLLM 을 스트리밍으로 호출하며 요청별 지표를 측정하고, /metrics 스냅샷을 붙여
    9지표를 로깅한다. 완성된 응답 텍스트와 기록(dict)을 반환.
    """
    # (1) 호출 직전 서버 상태 스냅샷 — 이 요청이 마주친 큐/부하
    server = scrape_vllm_metrics(base_url)

    t0 = time.perf_counter()
    ttft: Optional[float] = None
    parts: list[str] = []
    prompt_tokens: Optional[int] = None
    completion_tokens: Optional[int] = None

    stream = client.chat.completions.create(
        model=model,
        messages=messages,
        temperature=temperature,
        stream=True,
        stream_options={"include_usage": True},  # 마지막 청크에 usage 포함
    )
    for chunk in stream:
        choices = getattr(chunk, "choices", None)
        if choices:
            delta = getattr(choices[0], "delta", None)
            content = getattr(delta, "content", None) if delta else None
            if content:
                if ttft is None:
                    ttft = time.perf_counter() - t0  # 첫 토큰까지 시간
                parts.append(content)
        usage = getattr(chunk, "usage", None)
        if usage:
            prompt_tokens = getattr(usage, "prompt_tokens", None)
            completion_tokens = getattr(usage, "completion_tokens", None)

    e2e = time.perf_counter() - t0
    text = "".join(parts)
    out_tok = completion_tokens if completion_tokens is not None else _approx_tokens(text)

    # tpot = 첫 토큰 이후 나머지 토큰들의 평균 생성 간격
    gen_time = max(1e-6, e2e - (ttft or 0.0))
    tpot = round(gen_time / (out_tok - 1), 6) if out_tok and out_tok > 1 else None
    req_tps = round(out_tok / e2e, 2) if out_tok and e2e > 0 else None

    num_running = server.get("num_running")
    num_waiting = server.get("num_waiting")
    # concurrency = 시스템 내 총 in-flight(실행+대기), active_seq = 실행 중 시퀀스(TPOT 상승 원인 지표)
    concurrency = (
        (num_running or 0) + (num_waiting or 0)
        if (num_running is not None or num_waiting is not None)
        else None
    )

    rec = {
        "ts": time.time(),
        "session_id": session_id,
        "call_type": call_type,
        "model": model,
        "stream": True,
        # 1) 입/출력 토큰
        "input_tokens": prompt_tokens,
        "output_tokens": out_tok,
        # 2) concurrency  3) active sequence count
        "concurrency": concurrency,
        "active_seq": num_running,
        "num_waiting": num_waiting,
        # 4) queue time  5) kv cache 점유율
        "queue_time_s": server.get("queue_time_avg"),
        "kv_cache_usage": server.get("kv_cache_usage"),
        # 6) ttft  7) tpot  8) e2e  9) system tps
        "ttft_s": round(ttft, 4) if ttft is not None else None,
        "tpot_s": tpot,
        "e2e_s": round(e2e, 4),
        "system_tps": _system_tps(base_url, server),
        # 참고: 이 요청 단독 tps
        "req_tps": req_tps,
    }
    if "scrape_error" in server:
        rec["metrics_scrape_error"] = server["scrape_error"]

    log_turn(rec)
    return text, rec


# ─────────────────────────────────────────────────────────────
# 로깅 (매 턴 JSON 한 줄 + JSONL 적재) & 세션 요약
# ─────────────────────────────────────────────────────────────
def _append_jsonl(obj: dict) -> None:
    try:
        with open(LOG_PATH, "a", encoding="utf-8") as f:
            f.write(json.dumps(obj, ensure_ascii=False) + "\n")
    except Exception as e:  # noqa: BLE001
        print(f"[momo-metrics] JSONL 적재 실패: {e}")


def log_turn(rec: dict) -> None:
    """매 턴 9지표를 터미널 + JSONL 로 남기고, 세션 누적에 추가."""
    print("[momo-metrics] " + json.dumps(rec, ensure_ascii=False))
    _append_jsonl(rec)
    sid = rec.get("session_id")
    if sid:
        with _lock:
            _sessions[sid].append(rec)


def _avg(xs: list) -> Optional[float]:
    return round(sum(xs) / len(xs), 4) if xs else None


def _pct(xs: list, q: float) -> Optional[float]:
    if not xs:
        return None
    s = sorted(xs)
    idx = min(len(s) - 1, int(len(s) * q))
    return round(s[idx], 4)


def log_session_summary(session_id: Optional[str]) -> Optional[dict]:
    """대화 마무리 시 — 그 세션 턴들을 집계해 요약 블록 출력 + JSONL 적재."""
    if not session_id:
        return None
    with _lock:
        turns = list(_sessions.get(session_id, []))
    if not turns:
        print(f"[momo-metrics][SESSION] {session_id}: 기록된 턴 없음(vLLM 백엔드 아님/스킵)")
        return None

    def vals(k):
        return [t[k] for t in turns if t.get(k) is not None]

    summary = {
        "type": "session_summary",
        "ts": time.time(),
        "session_id": session_id,
        "turns": len(turns),
        "input_tokens_total": sum(vals("input_tokens")),
        "output_tokens_total": sum(vals("output_tokens")),
        "ttft_s_avg": _avg(vals("ttft_s")),
        "ttft_s_p95": _pct(vals("ttft_s"), 0.95),
        "tpot_s_avg": _avg(vals("tpot_s")),
        "tpot_s_p95": _pct(vals("tpot_s"), 0.95),
        "e2e_s_avg": _avg(vals("e2e_s")),
        "e2e_s_p95": _pct(vals("e2e_s"), 0.95),
        "active_seq_max": max(vals("active_seq")) if vals("active_seq") else None,
        "concurrency_max": max(vals("concurrency")) if vals("concurrency") else None,
        "kv_cache_usage_max": max(vals("kv_cache_usage")) if vals("kv_cache_usage") else None,
        "queue_time_s_avg": _avg(vals("queue_time_s")),
        "system_tps_avg": _avg(vals("system_tps")),
    }
    print("[momo-metrics][SESSION] " + json.dumps(summary, ensure_ascii=False))
    _append_jsonl(summary)
    return summary
