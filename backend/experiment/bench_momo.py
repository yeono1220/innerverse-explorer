"""
모모챗 앱 경로(/api/momo/reply) 폐루프(closed-loop) 부하 드라이버 — Track 2.

동시성 레벨을 스윕하며 각 레벨마다 C개의 워커가 지속적으로 요청을 쏜다.
서버 쪽 9지표는 백엔드가 momo_metrics.jsonl 에 적재하고(각 요청의 session_id=exp-c{C}),
이 스크립트는 클라이언트 관점 요약(요청수·처리율·E2E p50/p95)만 출력한다.

준비:
  pip install httpx
  ⚠️ mac OS와 충돌한다면 가상환경(venv)에서 진행
  # 백엔드를 vLLM 백엔드로 로컬 기동 (Modal vLLM 을 가리키게)
  #   ANALYZER_BACKEND=vllm VLLM_PROVIDER=modal MODAL_VLLM_URL=... VLLM_MODEL=Qwen/Qwen3-8B \
  #   MOMO_METRICS_LOG=$PWD/experiment/momo_metrics.jsonl uvicorn main:app --port 8000

사용:
  python experiment/bench_momo.py --base-url http://localhost:8000 \
         --levels 1,2,4,8,16,24,32 --duration 60 --no-think

참고:
  - 프롬프트는 매 요청 고유 접미사를 붙여 vLLM prefix-cache 왜곡을 피한다.
  - --no-think 는 Qwen3 thinking 을 끄는 소프트 스위치(/no_think)를 붙여 출력 길이를 통제한다.
  - 레벨 간 --gap 초 쉬어 서버 큐를 비운다.
"""
from __future__ import annotations

import argparse
import asyncio
import statistics
import time

try:
    import httpx
except ImportError:  # noqa
    raise SystemExit("httpx 가 필요합니다:  pip install httpx")

PROMPTS = [
    "요즘 계속 긴장돼서 잠이 잘 안 와",
    "오늘 시험을 망친 것 같아 속상해",
    "친구랑 크게 다퉈서 마음이 무거워",
    "그냥 평범한 하루였는데 왠지 공허해",
    "오랜만에 좋은 일이 있어서 기분이 좋아",
    "일이 너무 많아서 지치고 화가 나",
    "보고 싶은 사람이 있어서 마음이 몽글몽글해",
    "아무것도 하기 싫고 무기력한 날이야",
]


def pctl(xs: list[float], q: float) -> float | None:
    if not xs:
        return None
    s = sorted(xs)
    return round(s[min(len(s) - 1, int(len(s) * q))], 4)


async def worker(client, url, session_id, deadline, no_think, counter, lat):
    while time.perf_counter() < deadline:
        i = counter[0]
        counter[0] += 1
        text = PROMPTS[i % len(PROMPTS)] + f" (#{i})"  # 고유 접미사 → prefix-cache 왜곡 방지
        if no_think:
            text += " /no_think"
        t0 = time.perf_counter()
        try:
            r = await client.post(
                f"{url}/api/momo/reply",
                json={"text": text, "session_id": session_id},
            )
            ok = r.status_code == 200
        except Exception:
            ok = False
        dt = time.perf_counter() - t0
        lat["e2e"].append(dt)
        lat["ok" if ok else "err"] += 1


async def run_level(url: str, c: int, duration: float, no_think: bool, timeout: float) -> dict:
    session_id = f"exp-c{c}"
    lat = {"e2e": [], "ok": 0, "err": 0}
    counter = [0]
    limits = httpx.Limits(max_connections=c + 4, max_keepalive_connections=c + 4)
    async with httpx.AsyncClient(timeout=timeout, limits=limits) as client:
        deadline = time.perf_counter() + duration
        t_start = time.perf_counter()
        await asyncio.gather(
            *[worker(client, url, session_id, deadline, no_think, counter, lat) for _ in range(c)]
        )
        wall = time.perf_counter() - t_start
    total = lat["ok"] + lat["err"]
    return {
        "concurrency": c,
        "session_id": session_id,
        "requests": total,
        "ok": lat["ok"],
        "err": lat["err"],
        "req_per_s": round(lat["ok"] / wall, 2) if wall > 0 else None,
        "client_e2e_p50": pctl(lat["e2e"], 0.50),
        "client_e2e_p95": pctl(lat["e2e"], 0.95),
        "wall_s": round(wall, 1),
    }


async def main_async(args):
    levels = [int(x) for x in args.levels.split(",") if x.strip()]
    print(f"[bench] base={args.base_url} levels={levels} duration={args.duration}s no_think={args.no_think}")
    print(f"{'C':>4} {'req':>6} {'ok':>6} {'err':>5} {'req/s':>8} {'e2e_p50':>9} {'e2e_p95':>9}")
    rows = []
    for c in levels:
        row = await run_level(args.base_url, c, args.duration, args.no_think, args.timeout)
        rows.append(row)
        print(f"{c:>4} {row['requests']:>6} {row['ok']:>6} {row['err']:>5} "
              f"{str(row['req_per_s']):>8} {str(row['client_e2e_p50']):>9} {str(row['client_e2e_p95']):>9}")
        if c != levels[-1]:
            await asyncio.sleep(args.gap)  # 서버 큐 배수
    print("\n[bench] 완료. 서버 쪽 9지표는 백엔드의 momo_metrics.jsonl 에 적재됨 "
          "(session_id=exp-c<C>). analyze_metrics.py 로 집계하세요.")


def main():
    ap = argparse.ArgumentParser(description="모모챗 /api/momo/reply 동시성 스윕 부하 드라이버")
    ap.add_argument("--base-url", default="http://localhost:8000")
    ap.add_argument("--levels", default="1,2,4,8,16,24,32", help="쉼표구분 동시성 레벨")
    ap.add_argument("--duration", type=float, default=60.0, help="레벨당 지속 시간(초)")
    ap.add_argument("--gap", type=float, default=5.0, help="레벨 간 대기(초)")
    ap.add_argument("--timeout", type=float, default=120.0, help="요청 타임아웃(초)")
    ap.add_argument("--no-think", action="store_true", help="Qwen3 thinking 끄기(/no_think) — 출력 통제")
    asyncio.run(main_async(ap.parse_args()))


if __name__ == "__main__":
    main()
