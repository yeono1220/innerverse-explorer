"""
INNERVERSE 2.0 — AI Backend (FastAPI)

API 계약 = BACKEND_AI_PLAN.md 3절. 응답 규격은 프론트 `src/store/emotionStore.ts`
및 `src/lib/api-types.ts`와 1:1로 맞춰야 한다.

5감정 키(pos/calm/ten/sad/emp)는 프론트·백·DB 전부에서 불변. (행성 색 블렌딩이 묶임)

⚠️ 의료/위기 원칙 (BACKEND_AI_PLAN.md 4-3):
  - AI는 진단하지 않는다. crisis_score / escalate 는 '신호 강도'일 뿐.
  - 위기 연계 여부는 항상 사용자 선택. 직접 의료행위 금지 → 제휴 병원/플랫폼 아웃링크.

현재 단계 = Phase 0(토대): 계약 고정 + 더미/휴리스틱 응답.
실제 OpenAI 연결은 Phase 1+ 에서 `analyze_with_llm()` 등을 채운다.
"""
from __future__ import annotations

import os
import shutil
from typing import Literal, Optional

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# backend/.env 자동 로드 (python-dotenv 없으면 무시)
try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass

app = FastAPI(title="Innerverse AI Backend", version="0.1.0")

# 🚨 CORS — 배포 시 allow_origins 를 실제 프론트 도메인으로 좁힐 것 (BACKEND_AI_PLAN.md 규율 7)
# 환경변수 ALLOWED_ORIGINS(콤마 구분)가 있으면 그것을 우선 사용.
_origins_env = os.getenv("ALLOWED_ORIGINS", "").strip()
ALLOWED_ORIGINS = [o.strip() for o in _origins_env.split(",") if o.strip()] or ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─────────────────────────────────────────────────────────────────────────────
# 공통 타입
# ─────────────────────────────────────────────────────────────────────────────
EmoKey = Literal["pos", "calm", "ten", "sad", "emp"]
Dominant = Literal["bloom", "calm", "tense", "wither", "void"]


class EmotionScores(BaseModel):
    pos: int = Field(0, ge=0, le=100)  # 고양 Elated
    calm: int = Field(0, ge=0, le=100)  # 평온 Serene
    ten: int = Field(0, ge=0, le=100)  # 긴장 Tense
    sad: int = Field(0, ge=0, le=100)  # 격앙 Agitated
    emp: int = Field(0, ge=0, le=100)  # 침체 Depressed


class AnalyzeResponse(BaseModel):
    status: str = "success"
    extracted_text: str
    pos: int
    calm: int
    ten: int
    sad: int
    emp: int
    dominant: Dominant
    keywords: list[str]
    crisis_score: float = Field(0.0, ge=0.0, le=1.0)


class MomoReplyRequest(BaseModel):
    text: str
    emotions: Optional[EmotionScores] = None
    history: list[str] = Field(default_factory=list)


class MomoReplyResponse(BaseModel):
    reply: str
    escalate: bool = False


class CrisisCheckRequest(BaseModel):
    text: str


class CrisisCheckResponse(BaseModel):
    risk_score: float = Field(0.0, ge=0.0, le=1.0)
    signal: str
    suggest_escalation: bool = False


class VisionResponse(BaseModel):
    labels: list[str]
    scene: str
    emotion_hint: Optional[Dominant] = None


class WeeklyReviewResponse(BaseModel):
    summary: str
    dominant: Dominant
    calendar: list[Optional[Dominant]]  # 7일
    recommendations: list[str]


# ─────────────────────────────────────────────────────────────────────────────
# 휴리스틱 (Phase 0 더미) — Phase 1에서 LLM 으로 교체
# ─────────────────────────────────────────────────────────────────────────────
def decide_dominant(e: dict[str, float]) -> Dominant:
    """프론트 constants.ts decideBranch 와 동일 로직 (포팅). dominant 라벨 일치 보장."""
    positivity = e["pos"] + e["calm"]
    total = positivity + e["ten"] + e["sad"] + e["emp"] + 0.001
    r_pos = positivity / total
    r_ten = e["ten"] / total
    r_sad = e["sad"] / total
    r_emp = e["emp"] / total
    if r_emp > 0.38:
        return "void"
    if r_sad > 0.34:
        return "wither"
    if r_ten > 0.34:
        return "tense"
    if r_pos > 0.5 and total > 55:
        return "bloom"
    return "calm"


# 아주 단순한 키워드 휴리스틱 (실서비스 아님 — 데모/계약 검증용)
_LEXICON: dict[EmoKey, tuple[str, ...]] = {
    "pos": ("행복", "기뻐", "신나", "설레", "좋았", "최고", "뿌듯", "사랑"),
    "calm": ("평온", "편안", "안정", "괜찮", "고요", "차분", "휴식", "쉬었"),
    "ten": ("긴장", "불안", "초조", "걱정", "조마", "떨려", "마감", "시험"),
    "sad": ("화가", "분노", "짜증", "억울", "열받", "싫어", "답답"),
    "emp": ("우울", "지쳐", "무기력", "외로", "공허", "슬퍼", "포기", "힘들"),
}
_CRISIS_TERMS = ("자해", "자살", "죽고", "죽고싶", "사라지고", "없어지고", "끝내고")


def heuristic_emotions(text: str) -> EmotionScores:
    scores = {"pos": 12, "calm": 10, "ten": 8, "sad": 6, "emp": 6}
    for key, terms in _LEXICON.items():
        for t in terms:
            if t in text:
                scores[key] += 22  # type: ignore[index]
    # 0~100 클램프
    return EmotionScores(**{k: max(0, min(100, v)) for k, v in scores.items()})


def heuristic_crisis(text: str) -> float:
    hits = sum(1 for t in _CRISIS_TERMS if t in text)
    return min(1.0, 0.55 + 0.2 * hits) if hits else 0.0


def heuristic_keywords(text: str) -> list[str]:
    found = [t for terms in _LEXICON.values() for t in terms if t in text]
    return (found[:3]) or ["기록"]


# 감정 분석 프롬프트 (BACKEND_AI_PLAN.md 4-1)
PROMPT_ANALYZE = (
    "너는 감정 분석기다. 사용자의 일기를 읽고 Russell 순환모형 5감정의 '비율'을 0~100으로 매겨라.\n"
    "- pos 고양(긍정·높은각성) / calm 평온(긍정·낮은각성) / ten 긴장(부정·높은각성)\n"
    "- sad 격앙(부정·높은각성) / emp 침체(부정·낮은각성)\n"
    "또한 핵심 키워드 3개, 위기신호 점수(crisis_score 0~1)를 산출하라.\n"
    "crisis_score는 자해·자살·심각한 절망 표현이 강할수록 1에 가깝게. (진단이 아니라 신호 강도)\n"
    'dominant 는 bloom|calm|tense|wither|void 중 하나.\n'
    '반드시 JSON만 출력: {{"pos":n,"calm":n,"ten":n,"sad":n,"emp":n,'
    '"dominant":"...","keywords":[...],"crisis_score":n}}\n'
    '일기: """{text}"""'
)


GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/"


def _get_llm():
    """공급자 자동 선택. Gemini 우선 → OpenAI → None.
    Gemini 는 OpenAI 호환 엔드포인트라 같은 SDK(base_url 만 교체)로 쓴다.
    반환: (client, model) 또는 None."""
    try:
        from openai import OpenAI
    except ImportError:
        print("openai SDK 미설치 — 휴리스틱 폴백")
        return None

    gemini_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if gemini_key:
        model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
        return OpenAI(api_key=gemini_key, base_url=GEMINI_BASE_URL), model

    openai_key = os.getenv("OPENAI_API_KEY")
    if openai_key:
        model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
        return OpenAI(api_key=openai_key), model

    return None


def analyze_with_llm(text: str) -> Optional[AnalyzeResponse]:
    """LLM(Gemini/OpenAI)으로 실제 분석. 키 없거나 실패하면 None → 휴리스틱 폴백."""
    import json

    if not text.strip():
        return None
    llm = _get_llm()
    if llm is None:
        return None
    client, model = llm

    try:
        resp = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": PROMPT_ANALYZE.format(text=text)}],
            response_format={"type": "json_object"},
            temperature=0.4,
        )
        data = json.loads(resp.choices[0].message.content or "{}")
    except Exception as e:  # 네트워크/파싱 등 모든 실패 → 폴백
        print(f"LLM analyze 실패, 휴리스틱 폴백: {e}")
        return None

    emo = {k: max(0, min(100, int(data.get(k, 0) or 0))) for k in ("pos", "calm", "ten", "sad", "emp")}
    dominant = data.get("dominant")
    if dominant not in ("bloom", "calm", "tense", "wither", "void"):
        dominant = decide_dominant({k: float(v) for k, v in emo.items()})
    keywords = [str(k) for k in (data.get("keywords") or [])][:3] or ["기록"]
    crisis = float(data.get("crisis_score", 0.0) or 0.0)
    return AnalyzeResponse(
        extracted_text=text,
        pos=emo["pos"], calm=emo["calm"], ten=emo["ten"], sad=emo["sad"], emp=emo["emp"],
        dominant=dominant,
        keywords=keywords,
        crisis_score=max(0.0, min(1.0, crisis)),
    )


# ─────────────────────────────────────────────────────────────────────────────
# 라우트
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/")
def read_root():
    return {"message": "Innerverse AI Server is running!", "version": app.version}


@app.get("/api/health")
def health():
    """진단용 — 어떤 AI 공급자가 활성인지, SDK/키 상태 확인."""
    has_gemini = bool(os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY"))
    has_openai = bool(os.getenv("OPENAI_API_KEY"))
    try:
        import openai  # noqa: F401

        sdk = True
    except ImportError:
        sdk = False
    if has_gemini and sdk:
        provider = "gemini"
    elif has_openai and sdk:
        provider = "openai"
    else:
        provider = "heuristic"
    return {
        "provider": provider,
        "gemini_key_loaded": has_gemini,
        "openai_key_loaded": has_openai,
        "openai_sdk_installed": sdk,
    }


@app.get("/api/_debug/llm")
def debug_llm():
    """실제 LLM 호출을 한 번 시도하고 결과/에러를 그대로 반환 (진단용)."""
    llm = _get_llm()
    if llm is None:
        return {"ok": False, "reason": "no provider — key 또는 openai SDK 없음"}
    client, model = llm
    try:
        resp = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": 'respond with json {"ok": true}'}],
            response_format={"type": "json_object"},
        )
        return {"ok": True, "model": model, "sample": resp.choices[0].message.content}
    except Exception as e:
        return {"ok": False, "model": model, "error": f"{type(e).__name__}: {e}"}


@app.post("/api/analyze", response_model=AnalyzeResponse)
async def analyze_diary(
    audio_file: UploadFile | None = File(None),
    text_data: str | None = Form(None),
):
    """일기(text/audio) → 5감정 + dominant + keywords + crisis_score.
    응답 규격 = 프론트 emotionStore / api-types.ts 와 1:1."""
    extracted_text = text_data or ""

    # 음성 → (Phase 4) Whisper STT. 현재는 임시 저장 후 플레이스홀더.
    if audio_file:
        file_path = f"temp_{audio_file.filename}"
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(audio_file.file, buffer)
        print(f"🎤 오디오 파일 저장: {file_path}")
        extracted_text = "[음성에서 변환된 텍스트 — Phase 4 Whisper 예정]"
        os.remove(file_path)

    if text_data:
        print(f"✍️ 텍스트 일기 수신: {text_data[:20]}...")

    # Phase 1: LLM 우선, 없으면 휴리스틱 폴백
    llm = analyze_with_llm(extracted_text)
    if llm is not None:
        return llm

    emo = heuristic_emotions(extracted_text)
    dominant = decide_dominant(emo.model_dump())
    return AnalyzeResponse(
        extracted_text=extracted_text,
        pos=emo.pos,
        calm=emo.calm,
        ten=emo.ten,
        sad=emo.sad,
        emp=emo.emp,
        dominant=dominant,
        keywords=heuristic_keywords(extracted_text),
        crisis_score=heuristic_crisis(extracted_text),
    )


@app.post("/api/momo/reply", response_model=MomoReplyResponse)
async def momo_reply(req: MomoReplyRequest):
    """모모 공감 답장. (Phase 2: BACKEND_AI_PLAN.md 4-2 프롬프트로 LLM 연결)
    ⚠️ 진단 금지. crisis_score>=0.6 이면 위로 후 부드럽게 escalate 제안."""
    crisis = heuristic_crisis(req.text)
    if crisis >= 0.6:
        return MomoReplyResponse(
            reply="많이 힘들었구나. 지금은 저보다 전문가의 도움이 필요한 순간 같아요. 비대면 상담을 연결해 드릴까요?",
            escalate=True,
        )
    return MomoReplyResponse(reply="그 마음 충분히 그럴 수 있어. 오늘은 작은 한 걸음만 같이 떠올려보자.", escalate=False)


@app.post("/api/crisis/check", response_model=CrisisCheckResponse)
async def crisis_check(req: CrisisCheckRequest):
    """위기 스크리닝 (트리거 신호일 뿐, 진단 아님). 연계는 항상 사용자 선택."""
    score = heuristic_crisis(req.text)
    return CrisisCheckResponse(
        risk_score=score,
        signal="high" if score >= 0.6 else ("low" if score > 0 else "none"),
        suggest_escalation=score >= 0.6,
    )


@app.post("/api/vision", response_model=VisionResponse)
async def vision(photo: UploadFile = File(...)):
    """멀티모달 사진 분석 (Phase 4: Vision 연결). 현재는 스텁."""
    return VisionResponse(labels=["(stub)"], scene="unknown", emotion_hint=None)


@app.get("/api/weekly/{uid}", response_model=WeeklyReviewResponse)
async def weekly_review(uid: str):
    """주간 리뷰 (Phase 4). 현재는 스텁."""
    return WeeklyReviewResponse(
        summary="이번 주 요약은 Phase 4에서 생성됩니다.",
        dominant="calm",
        calendar=[None, None, None, None, None, None, None],
        recommendations=["일기 꾸준히 쓰기"],
    )


@app.post("/api/insights")
async def insights():
    """집계·차분 프라이버시 적용 B2B 인사이트 (Phase 5). 개인 식별 불가. 현재는 스텁."""
    return {"status": "not_implemented", "phase": 5}
# end of Phase 0 stubs
