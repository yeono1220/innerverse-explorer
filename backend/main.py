from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
import shutil
import os

app = FastAPI(title="Innerverse AI Backend")

# 🚨 CORS 세팅 (가장 중요)
# 프론트엔드(React)와 백엔드(GCP) 주소가 다를 때 발생하는 통신 에러를 막아줍니다.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 실제 배포 시에는 연오님의 프론트엔드 도메인만 넣어야 함
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"message": "Innerverse AI Server is running!"}

@app.post("/api/analyze")
async def analyze_diary(
    audio_file: UploadFile | None = File(None),
    text_data: str | None = Form(None)
):
    """
    프론트엔드에서 보낸 일기(텍스트)와 음성(Blob)을 받아서 분석하는 라우터
    """
    extracted_text = text_data or ""

    # 1. 음성 파일 수신 및 임시 저장 처리
    if audio_file:
        file_path = f"temp_{audio_file.filename}"
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(audio_file.file, buffer)
        
        print(f"🎤 오디오 파일 저장 완료: {file_path}")
        
        # [TODO: AI 로직] 
        # 여기에 OpenAI Whisper API를 연결해서 file_path 오디오를 텍스트로 변환하는 코드가 들어갑니다.
        extracted_text = "[음성에서 변환된 텍스트입니다. 나중에 Whisper가 처리합니다]"
        
        # 처리 끝난 오디오 파일 삭제 (서버 용량 꽉 차는 것 방지)
        os.remove(file_path)

    # 2. 텍스트 데이터 확인
    if text_data:
        print(f"✍️ 텍스트 일기 수신: {text_data[:20]}...")

    # [TODO: AI 로직]
    # 여기에 KoELECTRA나 GPT API를 연결해서 extracted_text의 감정과 인간관계를 분석합니다.

    # 3. 프론트엔드로 분석 결과 (JSON) 반환
    # (일단은 프론트엔드가 받을 규격에 맞춰서 더미 데이터를 던져줍니다)
    return {
        "status": "success",
        "extracted_text": extracted_text,
        "emotions": [
            {"label": "기쁨", "value": 45, "color": "hsl(45, 96%, 55%)"},
            {"label": "슬픔", "value": 15, "color": "hsl(217, 91%, 60%)"},
            {"label": "분노", "value": 5, "color": "hsl(348, 83%, 60%)"},
            {"label": "불안", "value": 20, "color": "hsl(258, 58%, 58%)"},
            {"label": "평온", "value": 60, "color": "hsl(187, 80%, 42%)"}
        ],
        "relationships": [
            {"person": "김팀장", "relation": "직장 동료", "status": "스트레스 유발", "score": -80},
            {"person": "지현이", "relation": "친구", "status": "위로가 됨", "score": 60}
        ]
    }