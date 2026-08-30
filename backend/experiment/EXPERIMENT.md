# vLLM 지연-처리량(Latency–Throughput) Trade-off 실험 시나리오

> 대상: `backend/deploy/*` (Modal vLLM) + `backend/momo_metrics.py`(모모챗 9지표 로깅)
> 모델: `Qwen/Qwen3-8B` (bf16 ≈ 16GB) / GPU: **NVIDIA L4 (24GB)**

---

## 0. 한눈에 — 결론부터

단일 L4 벤치마크는 **매우 저렴**하다. L4 = **$0.7992/hr(=$0.000222/초, 초당 과금)** 이므로 $30이면 이론상 **≈ 37.5 L4-시간**. 아래 전체 계획(A+B+C)을 다 돌려도 **실사용 GPU 시간 ≈ 60~90분, 비용 ≈ $2~5 (크레딧의 10~15%)** 다.
→ **$30은 병목이 아니다.** 진짜 관리 포인트는 **낭비 차단**: (1) 가중치 1회 캐시, (2) `scaledown_window` 짧게 + 스윕을 한 번에 warm 상태로, (3) 큰 GPU(A100/H100) 금지, (4) disagg(2 GPU) 남용 금지, (5) 끝나면 `modal app stop`.
⚠️ 로컬에 vllm설치 불 필요! 아래 안내된 방식 ❌ 별도 스크립드 작성함 ✅

---

## 1. 목표 & 가설

**목표**: Qwen3-8B를 vLLM으로 단일 L4에서 서빙할 때, **동시성(concurrency)** 을 올릴수록 처리량(throughput)과 지연(latency)이 어떻게 맞바뀌는지 곡선으로 특성화하고 **무릎(knee) 지점**을 찾는다. 그리고 TPOT 상승의 원인을 서버 상태(active sequence · KV cache · queue)로 설명한다.

**핵심 가설**
- H1. 동시성 ↑ → **system TPS(처리량) 증가**하다가 KV-cache/compute 한계에서 **포화**된다.
- H2. 동시성 ↑ → 배치가 커져 **TPOT(토큰당 지연) 증가**, 용량 초과 시 **queue time 급증 → TTFT·E2E 악화**.
- H3. `active_seq`(동시 실행 시퀀스)와 `kv_cache_usage`가 임계에 닿는 지점이 곧 무릎이다.
- H4(선택). **Speculative decoding**은 저동시성·수락률 높을 때 TPOT↓, 고동시성에선 이득 축소.
- H5(선택). **Prefill/Decode 분리(disagg)**는 이 스케일·챗봇 워크로드에선 이득이 없거나 오히려 손해(오버헤드) — contention 이론으로 설명.

---

## 2. 측정 지표 (9가지) 와 수집 출처

| # | 지표 | 의미 | Track1 (`vllm bench`) | Track2 (앱 9지표 로깅) |
|---|------|------|:--:|:--:|
| 1 | input/output 토큰 수 | 워크로드 크기 | ✅(고정 설정) | ✅ `input_tokens`/`output_tokens` |
| 2 | concurrency | 동시 in-flight 요청 | ✅(`--max-concurrency`) | ✅ `concurrency`(running+waiting) |
| 3 | active sequence count | vLLM 실행 중 시퀀스(TPOT 원인) | ✅(/metrics) | ✅ `active_seq` |
| 4 | queue time | 큐 대기 시간 | ✅(/metrics) | ✅ `queue_time_s` |
| 5 | kv cache 점유율 | KV 캐시 사용률 | ✅(/metrics) | ✅ `kv_cache_usage` |
| 6 | TTFT | 첫 토큰까지 | ✅(요청별) | ✅ `ttft_s`(요청별 스트리밍 계측) |
| 7 | TPOT | 토큰당 지연 | ✅(요청별) | ✅ `tpot_s`(요청별) |
| 8 | actual E2E latency | 실제 종단 지연 | ✅ | ✅ `e2e_s` |
| 9 | system TPS | 서버 총 생성 처리량 | ✅ | ✅ `system_tps` |

- **Track 1 (권장, 정밀 곡선)**: `vllm bench serve`를 Modal vLLM URL에 직접 → 입출력 길이·동시성 정밀 제어. 서버 진실값. TTFT/TPOT/throughput + `/metrics`(active_seq·kv·queue).
- **Track 2 (앱 관점, 우리가 만든 9지표)**: `bench_momo.py`로 `/api/momo/reply`에 폐루프 부하 → `momo_metrics.jsonl`에 요청별 9지표 적재. 네트워크·FastAPI·Qwen3 reasoning까지 포함한 **앱이 실제 보는 값**.

두 트랙은 상호 검증용이다. **곡선의 정답은 Track 1**, **모모챗 현실값은 Track 2**.
LLM Inference의 경우 Track 1를 뼈대로.

---

## 3. 배포 설정 — 반드시 지킬 4가지

배포 파일: `backend/deploy/modal_vllm_server_specdec.py` (기본 workhorse; `SPEC_METHOD=off`가 곧 baseline이고, 나중에 specdec A/B도 같은 파일로). disagg만 `modal_vllm_server_disagg.py`.

1. **한 GPU에서 배칭을 측정하도록 오토스케일 고정.** Modal은 컨테이너당 `max_inputs` 초과 요청이 오면 **컨테이너를 새로 띄운다**(→ 2 GPU가 되어 배칭이 아니라 오토스케일을 재게 됨). 그래서:
   - `@modal.concurrent(max_inputs=64)` 로 올리고 (스윕 최대 동시성 32보다 크게),
   - `@app.function(..., max_containers=1)` 로 **컨테이너 1개 고정**.
   - 환경변수로: `VLLM_MAX_CONCURRENT=64` (스크립트가 `max_inputs`에 사용). `max_containers=1`은 데코레이터에 직접 추가.
2. **유휴 과금 최소화**: `VLLM_SCALEDOWN=60` (기본 300 → 실험 중엔 60초). 스윕은 컨테이너가 **warm인 채로 연속** 실행.
3. **가중치 1회 캐시**: 첫 배포에서 Qwen3-8B(~16GB)만 다운로드되고 `innerverse-hf-cache` 볼륨에 저장됨 → 이후 배포는 로드만(짧음). specdec draft(0.6B)도 최초 1회만.
4. **Qwen3 'thinking' 통제** (지연 실험의 최대 교란요인): `--reasoning-parser qwen3`가 켜져 있으면 Qwen3가 `<think>...</think>`를 길게 뱉어 **출력 토큰·TTFT-투-답변이 요동**친다. 실험은 두 모드를 명시적으로 구분:
   - **통제 모드(권장, 곡선용)**: thinking OFF. 요청에 `chat_template_kwargs={"enable_thinking": false}`(OpenAI 호환은 `extra_body`), 또는 사용자 메시지 끝에 Qwen3 소프트 스위치 `/no_think`.
   - **현실 모드**: thinking ON = 실제 모모챗. 출력이 길어 지연↑ — "앱 현실값"으로 별도 기록.

> **prefix caching 주의**: vLLM은 prefix cache가 기본 ON이라 **동일 프롬프트 반복 시 TTFT가 비현실적으로 낮게** 나온다. 부하는 **매 요청 프롬프트를 다르게**(Track1 `--dataset-name random`, Track2 드라이버가 프롬프트 풀+인덱스로 변주) 줄 것.

---

## 4. 실험 매트릭스

### Exp A — 베이스라인 동시성 스윕 (핵심)
`SPEC_METHOD=off`, 단일 L4.

- 독립변수: **동시성 C ∈ {1, 2, 4, 8, 16, 24, 32}**
- 워크로드 2종(입력/출력 토큰, 통제 모드):
  - **P1 챗형**: in≈256 / out≈128 (모모챗과 유사)
  - **P2 장문**: in≈1024 / out≈256
- 각 (C, 프로파일)마다 **60초 지속 부하** 또는 **200요청** 중 먼저 도달.
- 산출: 각 지표의 **p50/p95**, 평균 system TPS, 평균/최대 active_seq, kv 최대, queue 평균.

### Exp B — Speculative Decoding A/B (선택, 가성비 高)
같은 단일 L4, `SPEC_METHOD ∈ {off, ngram, draft}` 3배포. 동시성은 **{1, 4, 8}** 정도만(저동시성이 spec의 강점 구간).
- draft: `Qwen/Qwen3-0.6B`(동일 토크나이저 계열). 여유되면 `1.7B`도.
- 추가 지표: **acceptance rate** — `/metrics`의 `vllm:spec_decode_*`(draft_acceptance_rate 등).
- 서사: "draft는 수락률↑일 때 TPOT↓ / ngram은 open-ended 챗에서 hit rate 낮아 이득 적음 / 둘 다 메모리·품질 트레이드오프".

### Exp C — Prefill/Decode 분리(disagg) (선택, 2×L4 = 2배 비용)
`SERVE_MODE=disagg`, `VLLM_GPU=L4:2`. baseline(단일)과 **동일 부하**로 비교.
- 목적: 이 스케일 챗봇에선 disagg가 **이득 없음/손해**임을 정량화(=의도된 "네거티브 결과").
- 최소 조건만(예: C∈{1,8}, P1) 짧게. **비용 2배**이므로 런타임을 타이트하게.

---

## 5. 부하 생성 — 실행 커맨드

### Track 1 — vLLM 내장 벤치(정밀 곡선)
로컬(또는 Colab)에 `pip install vllm`만 있으면 됨(GPU 불필요, 클라이언트로만 사용).

```bash
export URL=https://<you>--innerverse-vllm-serve.modal.run
export TOK=<MODAL_VLLM_TOKEN>   # 배포 시 API 키를 걸었다면

for C in 1 2 4 8 16 24 32; do
  vllm bench serve \
    --model Qwen/Qwen3-8B \
    --base-url $URL --endpoint /v1/chat/completions \
    --dataset-name random --random-input-len 256 --random-output-len 128 \
    --max-concurrency $C --num-prompts $((C*20)) \
    --percentile-metrics ttft,tpot,itl,e2el \
    --save-result --result-filename benchA_p1_c${C}.json \
    --extra-body '{"chat_template_kwargs":{"enable_thinking":false}}'
done
```
- `--random-input-len/--random-output-len`로 워크로드 고정, `--max-concurrency`로 동시성 스윕.
- 각 C 실행 직후 `/metrics`를 한 번 긁어(active_seq·kv·queue) 같이 저장하면 좋다:
  `curl -s $URL/metrics | grep -E 'num_requests_running|gpu_cache_usage_perc|request_queue_time'`

### Track 2 — 앱 9지표 로깅(모모챗 경로)
백엔드를 로컬에서 vLLM 백엔드로 띄우고(요금 X, 로컬), 드라이버로 동시성 스윕:

```bash
# 1) 백엔드 (로컬) — Modal vLLM 을 가리킴
cd backend
export ANALYZER_BACKEND=vllm VLLM_PROVIDER=modal \
       MODAL_VLLM_URL=https://<you>--innerverse-vllm-serve.modal.run \
       VLLM_MODEL=Qwen/Qwen3-8B FALLBACK_TO_DUMMY=false \
       MOMO_METRICS_LOG=$PWD/experiment/momo_metrics.jsonl
uvicorn main:app --port 8000

# 2) 드라이버 (다른 터미널) — 동시성 스윕, session_id=exp-c{C} 태깅
python experiment/bench_momo.py \
  --base-url http://localhost:8000 \
  --levels 1,2,4,8,16,24,32 --duration 60 --no-think

# 3) 분석 — 동시성별 p50/p95·throughput 표 + CSV
python experiment/analyze_metrics.py experiment/momo_metrics.jsonl --csv trade_off.csv
```
→ `momo_metrics.jsonl`의 `[momo-metrics]` 라인이 요청별 9지표, `session_id=exp-cN`이 동시성 레벨. `analyze_metrics.py`가 레벨별로 묶어 곡선표를 만든다.

> 대화 마무리(일기 저장) 지표도 보려면 몇 번 `/api/momo/diary`를 호출하면 `[momo-metrics][SESSION]` 세션 요약이 찍힌다.

---

## 6. 실행 체크리스트 (순서대로)

1. `pip install modal && modal token new` (최초 1회).
2. 배포 파일에 **`max_containers=1`** 추가(§3-1). 
3. `SPEC_METHOD=off VLLM_GPU=L4 VLLM_MAX_CONCURRENT=64 VLLM_SCALEDOWN=60 modal deploy backend/deploy/modal_vllm_server_specdec.py`
4. 나온 URL로 스모크: `MODAL_VLLM_URL=... modal run backend/deploy/modal_vllm_server_specdec.py --prompt "안녕 /no_think"`.
5. **Exp A** — Track 1 스윕(§5) + (원하면) Track 2 스윕. warm 상태로 연속 실행.
6. (선택) **Exp B** — `SPEC_METHOD=ngram`, `=draft` 재배포 후 저동시성 스윕.
7. (선택) **Exp C** — `SERVE_MODE=disagg VLLM_GPU=L4:2 modal deploy backend/deploy/modal_vllm_server_disagg.py`, 짧게.
8. **`modal app stop innerverse-vllm`** — 실험 끝나면 즉시 중지(유휴 과금 컷).
9. Modal 대시보드에서 사용액 확인.

---

## 7. 가드레일

**가드레일(낭비 차단)**
- ✅ **GPU는 L4만**(디스크·KV 여유). A100/H100 금지(비용 2.5~5배, 8B엔 과함).
- ✅ `VLLM_SCALEDOWN=60`, 스윕은 warm 연속. 실험 종료 시 **`modal app stop`**.
- ✅ disagg는 2배 비용 — Exp C는 최소 조건만, 끝나면 즉시 stop.
- ✅ 백엔드(FastAPI)·드라이버·`vllm bench`는 **로컬**에서(무료). Modal엔 vLLM만.
- ✅ **킬 스위치**: 대시보드 Usage를 주기적으로 확인, 예상 밖 컨테이너가 떠 있으면 `modal app stop innerverse-vllm`. `max_containers=1`로 오토스케일 폭주 원천 차단.
- ⚠️ 무료 크레딧은 **월 리셋**. 큰 실험은 월초에.

---

## 8. 분석 & 그래프

- **Trade-off 곡선(핵심 1장)**: x축 = system TPS(또는 req/s), y축 = **p95 E2E**(또는 p50 TPOT), 각 점 = 동시성 레벨. 우상향하다 꺾이는 **무릎**이 "지연 예산 내 최대 처리량".
- **동시성 대비 분해**: C축에 대해 TTFT·TPOT·queue_time·active_seq·kv_usage를 겹쳐 그리면, **queue/kv가 임계에 닿는 순간 TPOT·E2E가 튀는 것**이 보인다(H2/H3 검증).
- `analyze_metrics.py`가 레벨별 표(p50/p95 + throughput)와 `trade_off.csv`를 내주므로, 그대로 표/그래프로 사용.
- Exp B: (off/ngram/draft) × 동시성에 대한 **TPOT + acceptance rate** 표.

---

## 9. 예상 결과 서사 (해석 가이드)

- **Exp A**: 저동시성에선 TPS가 거의 선형↑(배칭 이득), 중반에 KV/compute 포화로 **TPS 곡선이 눕고**, 그 지점부터 **active_seq·kv_usage 포화 → queue_time↑ → TTFT/E2E 급등**. TPOT는 배치 크기에 따라 완만히↑. → **무릎 직전이 운영 스위트스팟**.
- **Exp B**: draft-spec은 acceptance가 높은(정형적) 응답에서 **저동시성 TPOT를 눈에 띄게 낮추지만**, 동시성이 오르면 GPU가 이미 배치로 포화돼 **이득이 줄고**, draft가 KV/compute를 더 먹어 되레 손해날 수 있음. ngram은 open-ended 챗에서 hit rate가 낮아 이득 미미.
- **Exp C**: 이 스케일(8B·L4·챗봇)에선 disagg의 KV 전송/프록시 오버헤드가 이득보다 커 **TTFT·throughput이 baseline만 못하기 쉬움**. 분리는 prefill이 길고 대규모 다중 GPU에서 유리 — "왜 여기선 안 되는가"를 contention(단일 GPU가 이미 prefill+decode를 잘 인터리빙)으로 설명.

[ 7.25 vLLM 벤치마크 도구 매핑 ]
# 시트 1 (현재 표) — closed-loop
vllm bench serve --max-concurrency 8 --request-rate inf --ignore-eos ...
✏️ 엔진 자체의 지연-처리량 곡선

# 시트 2 — open-loop, 푸아송 도착
vllm bench serve --request-rate 4 --ignore-eos ...
✏️ 서비스 용량 산정용(서비스 관점)