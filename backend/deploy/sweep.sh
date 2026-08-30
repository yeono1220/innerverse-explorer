#!/usr/bin/env bash
set -uo pipefail

LABEL="${LABEL:-A_baseline}"
CONCURRENCIES="${CONCURRENCIES:-1 2 4 8 12 16 24 32}"
REPEATS=3
RESET_MODE="${RESET_MODE:-reset}"

BASE_URL="${BASE_URL:-http://localhost:8000}"
API_KEY="${RUNPOD_VLLM_TOKEN:-my-secret-token}"
MODEL_NAME="${MODEL_NAME:-Qwen3-8B}"
TOKENIZER="${TOKENIZER:-/workspace/models/Qwen3-8B}"
RESULT_DIR="${RESULT_DIR:-/workspace/bench/result/${LABEL}}"

export HF_HOME=/workspace/huggingface_cache
export HF_HUB_OFFLINE=1
export OPENAI_API_KEY=my-secret-token
mkdir -p "$RESULT_DIR"

SERVER_CMD_DIR="${SERVER_CMD_DIR:-/vllm-workspace/innerverse-explorer}"
SERVER_LOG_DIR="${SERVER_LOG_DIR:-/workspace/bench/serverlogs}"

SERVER_LOG="${SERVER_LOG:-/dev/null}"
WARMUP_TIMEOUT="${WARMUP_TIMEOUT:-600}"
BENCH_TIMEOUT="${BENCH_TIMEOUT:-1800}"
rep=0;conc=0
rm -f /tmp/vllm.pid
mkdir -p "$SERVER_LOG_DIR"

gpu_pids() { nvidia-smi --query-compute-apps=pid --format=csv,noheader | tr -d ' '; }

# 시작 전, 좀프 프로세스 있으면 아예 시작하지 않음.
preflight() {
  local leftover; leftover=$(gpu_pids)
  if [ -n "$leftover" ]; then
    echo "[preflight] GPU 점유 프로세스가 남아 있습니다: $leftover"
    nvidia-smi --query-compute-apps=pid,used_memory --format=csv
    echo "[preflight] 정리 후 다시 실행하세요:  kill -9 $leftover"
    exit 1
  fi
  if ss -lnt 2>/dev/null | grep -q ':8000 '; then
    echo "[preflight] 8000 포트가 이미 사용 중입니다."
    ss -lntp | grep ':8000 '
    exit 1
  fi
  echo "[preflight] ok"
}

kill_server() {
  local pid; pid=$(cat /tmp/vllm.pid 2>/dev/null || echo "")
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
    kill -TERM -- "-${pid}" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
  else
    pgrep -f 'runpod_specdec|vllm\.entrypoints|EngineCore' \
      | grep -v "^$$\$" | xargs -r kill -TERM 2>/dev/null
  fi

  # VRAM이 실제로 내려갈 때까지 대기 (고정 sleep 금지)
  for _ in $(seq 1 45); do
    used=$(nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits | head -1)
    [ "$used" -lt 1000 ] && return 0
    sleep 2
  done

  # 그래도 남아 있으면 GPU 점유 PID를 직접 SIGKILL
  for p in $(gpu_pids); do kill -KILL "$p" 2>/dev/null || true; done
  sleep 5
}

start_server() {
  mkdir -p "$SERVER_LOG_DIR"
  SERVER_LOG="${SERVER_LOG_DIR}/${LABEL}_c${conc}_r${rep}.log"
  ( cd "$SERVER_CMD_DIR" && \
    KV_OFFLOAD="${KV_OFFLOAD:-off}" PREFIX_CACHE="${PREFIX_CACHE:-off}" \
    PYTHONUNBUFFERED=1 setsid python3 backend/deploy/runpod_specdec.py \
      > "$SERVER_LOG" 2>&1 & )
      sleep 3
      pgrep -f runpod_specdec | head -1 > /tmp/vllm.pid
}

restart_server() {
  kill_server
  start_server
  wait_ready || return 1
  sleep 5
}

reset_cache() {
  if [ "$RESET_MODE" = "none" ]; then
    sleep 3
    return 0

  elif [ "$RESET_MODE" = "api" ]; then
    if curl -sf -X POST "${BASE_URL}/reset_prefix_cache" \
         -H "Authorization: Bearer ${API_KEY}" > /dev/null; then
      echo "  [reset] ok"
    else
      echo "  [reset] FAILED - results may be contaminated"
    fi

  else
    echo "  [reset] restart server now"
    restart_server
  fi
  sleep 3
}

mkdir -p result/$LABEL
SERVER_PID=$(pgrep -f 'vllm.entrypoints|runpod_specdec' | head -1)
{ echo "=== server cmd ==="; tr '\0' ' ' < "/proc/${SERVER_PID}/cmdline"; echo
  echo "=== vllm ==="; vllm --version
  python3 -c "import torch; print('torch', torch.__version__)"
} > "$RESULT_DIR/ENV.txt" 2>&1

wait_ready() {
  local pid; pid=$(cat /tmp/vllm.pid 2>/dev/null || echo "")
  for _ in $(seq 1 150); do      # LMCache 초기화가 느리니 300초로
    curl -sf "${BASE_URL}/health" > /dev/null && return 0
    if [ -n "$pid" ] && ! kill -0 "$pid" 2>/dev/null; then
      echo "  [!] 서버 프로세스가 죽었습니다. 로그 tail:"
      tail -40 "$SERVER_LOG"
      return 1                   # exit 아님
    fi
    sleep 2
  done
  echo "  [!] health check timeout"
  return 1
}

# 서버가 준비된 뒤에 기록 + 빈 PID 방어
dump_env() {
  local pid; pid=$(pgrep -f 'vllm\.entrypoints|runpod_specdec' | head -1)
  {
    echo "=== server cmd ==="
    [ -n "$pid" ] && tr '\0' ' ' < "/proc/${pid}/cmdline" || echo "(no server pid)"
    echo; echo "=== vllm ==="; vllm --version
    pip show lmcache 2>/dev/null | grep -iE '^(Name|Version)'
    python3 -c "import torch; print('torch', torch.__version__)"
    echo "=== kv budget ==="
    grep -h 'Available KV cache memory\|GPU KV cache size' "$SERVER_LOG" 2>/dev/null
    echo "=== mem ==="; free -g
    echo "vllm 엔진 프로세스 cmdline:";
    cat /proc/$(pgrep -f 'vllm serve'|head -1)/cmdline | tr '\0' ' '
  } > "$RESULT_DIR/ENV.txt" 2>&1
}

snap_metrics() {   # 진행 여부 판정용 스냅샷
  curl -s "${BASE_URL}/metrics" | grep -E \
    'prefix_cache_(queries|hits)|num_preemptions_total|gpu_cache_usage_perc|kv_cache_usage|num_requests_(running|waiting)|generation_tokens_total'
}

warmup() {  
    echo "warmimg up the server"                          
    timeout "$WARMUP_TIMEOUT" vllm bench serve \
      --backend vllm --base-url "$BASE_URL" \
      --model Qwen/Qwen3-8B --tokenizer "$TOKENIZER" \
      --dataset-name random --seed 0 \
      --random-input-len 2000 --random-output-len 200 \
      --random-prefix-len 512 --random-range-ratio 0.1 \
      --num-prompts 64 --max-concurrency 8 \
      --ignore-eos --disable-tqdm 2>&1 | tail -20                     # --save-result 생략 → 결과 폐기
    [ "${PIPESTATUS[0]}" -eq 124 ] && echo "  [!] warmup timeout (${WARMUP_TIMEOUT}s) — 계속 진행"
    snap_metrics
  

  nvidia-smi --query-gpu=clocks.sm,temperature.gpu,power.draw \
    --format=csv,noheader > "$RESULT_DIR/gpu_warmup_$(date +%s).txt"
}
preflight
start_server
wait_ready || echo "  [!] 초기 서버 기동 실패"; exit 1;
dump_env
warmup
echo "start ${LABEL} repeats=${REPEATS} reset=${RESET_MODE}"

for rep in $(seq 1 "$REPEATS"); do
  for conc in $CONCURRENCIES; do
    n=$(( conc * 20))

    echo "== rep ${rep}/${REPEATS} conc=${conc} prompts=${n}"
    if ! reset_cache; then
      echo "SKIP rep=${rep} conc=${conc} due to server failure" | tee -a "$RESULT_DIR/FAILED.txt"
      continue
    fi

    timeout "$BENCH_TIMEOUT" vllm bench serve \
      --base-url "$BASE_URL" \
      --endpoint /v1/completions \
      --model Qwen/Qwen3-8B \
      --tokenizer "$TOKENIZER" \
      --dataset-name random \
      --random-input-len 2000 \
      --random-output-len 200 \
      --random-prefix-len 512 \
      --num-prompts "$n" \
      --max-concurrency "$conc" \
      --seed 0 \
      --random-range-ratio 0.1 \
      --percentile-metrics ttft,tpot,itl,e2el \
      --metric-percentiles 50,75,90,95 \
      --ignore-eos \
      --save-result \
      --result-dir "$RESULT_DIR" \
      --result-filename "${LABEL}_c${conc}_r${rep}.json" \
      2>&1 | tee "${RESULT_DIR}/${LABEL}_c${conc}_r${rep}.log"
    if [ "${PIPESTATUS[0]}" -eq 124 ]; then
      echo " TIMEOUT rep=${rep} conc=${conc} (${BENCH_TIMEOUT}s)" | tee -a "$RESULT_DIR/FAILED.txt"
    fi

    sleep 5

    snap_metrics > "$RESULT_DIR/metrics_${LABEL}_c${conc}_r${rep}_$(date +%s).txt"
  done
done

echo "done: ${RESULT_DIR}"