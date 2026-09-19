# Innerverse

매일의 감정을 기록하고 AI가 분석하는 감정 일기장.
일기를 쓰면 AI가 5가지 감정(고양·평온·긴장·격앙·침체)으로 분석하고, 그 결과가 나만의 행성 색과 디오라마로 쌓입니다.

## Stack

- **Frontend**: React 18 · Vite · TypeScript · Tailwind CSS · shadcn-ui · three.js · zustand
- **Backend**: FastAPI (Python 3.12) — `backend/`
- **DB / Auth / Storage**: Supabase — `supabase/`
- **Deploy**: Vercel (frontend, `main` 브랜치 기준)

## Frontend

```bash
npm i
npm run dev        # http://localhost:8080
npm run build
npm run test
```

## Backend

```bash
pip install -r requirements.txt      # 쓰는 조합의 SDK 만 있어도 됨

# 조합 A) Gemini
ANALYZER_BACKEND=gemini ANTHROPIC_API_KEY=... uvicorn main:app

# 조합 B) Modal 위 vLLM
#   1) 먼저 vLLM 서버 배포:  modal deploy modal_vllm_server.py
#   2) 배포 후 나온 URL 을 MODAL_VLLM_URL 에 넣고 실행:
ANALYZER_BACKEND=vllm VLLM_PROVIDER=modal \
  VLLM_MODEL=innerverse-emotion \
  MODAL_VLLM_URL=https://<user>--innerverse-vllm-serve.modal.run \
  uvicorn main:app

# 조합 C) RunPod 위 vLLM (Serverless)
ANALYZER_BACKEND=vllm VLLM_PROVIDER=runpod \
  VLLM_MODEL=innerverse-emotion \
  RUNPOD_VLLM_URL=https://api.runpod.ai/v2/<ID>/openai/v1 \
  RUNPOD_API_KEY=... \
  uvicorn main:app

# 조합 D) 기본 (AI 서버 불필요)
uvicorn main:app
```

현재 활성 조합은 `GET /health` 로 확인합니다:
```json
{ "analyzer_backend": "vllm", "active_analyzer": "vllm", "vllm_provider": "modal" }
```

## Fail-safe

- **지연 초기화**: 쓰는 조합의 클라이언트만 만듭니다. Gemini 를 쓰면
  vLLM/provider 는 조회조차 안 됩니다(불필요한 연결·에러 없음).
- 폴백: 설정 누락·초기화 실패 시 서버가 죽지 않고 `dummy` 로 떨어집니다
  (`FALLBACK_TO_DUMMY=false` 로 끌 수 있음).
- 콜드스타트 대비: `REQUEST_TIMEOUT=120`. 서버리스(Modal/RunPod Serverless)
  첫 요청의 모델 로딩 지연을 견딥니다.
- 공통 계약: 어떤 조합이든 결과는 동일한 JSON 형태 + 동일한 감정 색상.
  프론트(Zustand store)는 백엔드 조합과 무관하게 동작합니다.

## TODO
- 음성(STT): 현재 오디오는 임시 저장 후 고정 문자열을 씁니다.
  Whisper 로 텍스트 변환을 붙여야 vLLM/Gemini 에 넘길 입력이 생깁니다.
- 프론트 연동: `/api/analyze` 를 `fetch` 로 호출해 store 에 반영하는 코드는 별도.