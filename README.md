# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)

## How to Run this Project (사용법)

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