"""
momo_metrics.jsonl → 동시성 레벨별 지연-처리량 집계 (Track 2 분석).

각 요청 라인의 session_id(=exp-c<C>)로 그룹핑해 레벨별로:
  요청수, 입/출력 토큰 합, ttft/tpot/e2e p50·p95,
  active_seq 평균·최대, kv 평균·최대, queue 평균, system_tps 평균,
  throughput(= 출력토큰합 / 그룹 벽시계) 을 계산해 표로 출력하고, CSV 저장(선택).

사용:
  python experiment/analyze_metrics.py experiment/momo_metrics.jsonl --csv trade_off.csv
  # 임의 태그로 묶으려면 --group-key session_id (기본) 또는 --group-key concurrency
"""
from __future__ import annotations

import argparse
import csv
import json
import re


def pctl(xs, q):
    xs = [x for x in xs if x is not None]
    if not xs:
        return None
    s = sorted(xs)
    return round(s[min(len(s) - 1, int(len(s) * q))], 4)


def avg(xs):
    xs = [x for x in xs if x is not None]
    return round(sum(xs) / len(xs), 4) if xs else None


def mx(xs):
    xs = [x for x in xs if x is not None]
    return round(max(xs), 4) if xs else None


def conc_of(session_id: str):
    """'exp-c8' → 8 (정렬용). 매칭 안 되면 큰 수."""
    m = re.search(r"c(\d+)", session_id or "")
    return int(m.group(1)) if m else 10**9


def main():
    ap = argparse.ArgumentParser(description="momo_metrics.jsonl 동시성별 집계")
    ap.add_argument("path", help="momo_metrics.jsonl 경로")
    ap.add_argument("--csv", default=None, help="CSV 저장 경로(선택)")
    ap.add_argument("--call-types", default="momo_reply,momo_diary",
                    help="집계할 call_type (쉼표구분)")
    args = ap.parse_args()

    want = set(args.call_types.split(","))
    groups: dict[str, list[dict]] = {}
    with open(args.path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                continue
            if rec.get("type") == "session_summary":   # 세션 요약 라인은 건너뜀
                continue
            if rec.get("call_type") not in want:
                continue
            sid = rec.get("session_id") or "(none)"
            groups.setdefault(sid, []).append(rec)

    if not groups:
        print("집계할 요청 라인이 없습니다. (경로/call_type 확인)")
        return

    rows = []
    for sid, recs in groups.items():
        ts = [r["ts"] for r in recs if r.get("ts") is not None]
        wall = (max(ts) - min(ts)) if len(ts) >= 2 else None
        out_tok = sum((r.get("output_tokens") or 0) for r in recs)
        rows.append({
            "group": sid,
            "concurrency": conc_of(sid),
            "requests": len(recs),
            "in_tok_sum": sum((r.get("input_tokens") or 0) for r in recs),
            "out_tok_sum": out_tok,
            "ttft_p50": pctl([r.get("ttft_s") for r in recs], 0.50),
            "ttft_p95": pctl([r.get("ttft_s") for r in recs], 0.95),
            "tpot_p50": pctl([r.get("tpot_s") for r in recs], 0.50),
            "tpot_p95": pctl([r.get("tpot_s") for r in recs], 0.95),
            "e2e_p50": pctl([r.get("e2e_s") for r in recs], 0.50),
            "e2e_p95": pctl([r.get("e2e_s") for r in recs], 0.95),
            "active_seq_avg": avg([r.get("active_seq") for r in recs]),
            "active_seq_max": mx([r.get("active_seq") for r in recs]),
            "kv_avg": avg([r.get("kv_cache_usage") for r in recs]),
            "kv_max": mx([r.get("kv_cache_usage") for r in recs]),
            "queue_avg": avg([r.get("queue_time_s") for r in recs]),
            "system_tps_avg": avg([r.get("system_tps") for r in recs]),
            # throughput(앱 관점): 출력토큰 합 / 그룹 벽시계
            "out_tps_wall": round(out_tok / wall, 2) if wall and wall > 0 else None,
        })

    rows.sort(key=lambda r: r["concurrency"])

    cols = ["concurrency", "requests", "in_tok_sum", "out_tok_sum",
            "ttft_p50", "ttft_p95", "tpot_p50", "tpot_p95", "e2e_p50", "e2e_p95",
            "active_seq_avg", "active_seq_max", "kv_max", "queue_avg",
            "system_tps_avg", "out_tps_wall"]
    hdr = {"concurrency": "C", "requests": "req", "in_tok_sum": "in_tok", "out_tok_sum": "out_tok",
           "ttft_p50": "ttft50", "ttft_p95": "ttft95", "tpot_p50": "tpot50", "tpot_p95": "tpot95",
           "e2e_p50": "e2e50", "e2e_p95": "e2e95", "active_seq_avg": "aseq_avg",
           "active_seq_max": "aseq_max", "kv_max": "kv_max", "queue_avg": "queue",
           "system_tps_avg": "sysTPS", "out_tps_wall": "outTPS"}
    widths = {c: max(len(hdr[c]), 8) for c in cols}
    print("  ".join(hdr[c].rjust(widths[c]) for c in cols))
    for r in rows:
        print("  ".join(str(r[c]).rjust(widths[c]) for c in cols))

    if args.csv:
        with open(args.csv, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=["group"] + cols)
            w.writeheader()
            for r in rows:
                w.writerow({k: r[k] for k in (["group"] + cols)})
        print(f"\nCSV 저장: {args.csv}")


if __name__ == "__main__":
    main()
