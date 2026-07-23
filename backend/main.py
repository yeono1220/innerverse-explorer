"""
INNERVERSE 2.0 — AI Backend (FastAPI)

API 계약 = BACKEND_AI_PLAN.md 3절. 응답 규격은 프론트 `src/store/emotionStore.ts`
및 `src/lib/api-types.ts`와 1:1로 맞춰야 한다.

감정 축은 7종(기쁨/차분/사랑/슬픔/분노/긴장/공허)이 유일. schema.py 가 단일 소스.
행성 분기 7종(bloom/calm/love/wither/rage/tense/void)은 감정에서 1:1 파생(schema.branch_of).
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
토글 구조 (2축 독립) — config.py / providers.py / analyzers.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  축 1) ANALYZER_BACKEND : vllm | gemini | dummy   ('무엇으로' 분석)
  축 2) VLLM_PROVIDER    : modal | runpod | custom ('어디에' 서빙, vllm 일 때만)

  main.py 는 analyzers.build_analyzer() 로 얻은 analyzer 만 호출한다.
  실제 백엔드 분기·서버 위치 해석은 analyzers/providers 가 담당한다.
  분석 실패 시 settings.FALLBACK_TO_DUMMY 면 휴리스틱/더미로 폴백.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""
from __future__ import annotations

import asyncio

import os
import shutil
from typing import Literal, Optional
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from providers import build_provider
from analyzers import (
    PROMPT_MOMO_SYSTEM,
    Analyzer,
#    active_backend_name,
    build_analyzer,
)

app = FastAPI(title="Innerverse AI Backend", version="0.1.0")

# 🚨 CORS — 배포 시 CORS_ORIGINS 를 실제 프론트 도메인으로 좁힐 것 (config.py)
from config import settings
from schema import attach_colors, branch_of, BRANCHES, EMOTION_LABELS
from momo_metrics import log_session_summary  # 모모챗 성능 9지표 세션 요약

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─────────────────────────────────────────────────────────────────────────────
# 공통 타입
# ─────────────────────────────────────────────────────────────────────────────
# 행성 분기 7종 — schema.BRANCHES 와 1:1 (감정 primary 에서 파생)
Dominant = Literal["bloom", "calm", "love", "wither", "rage", "tense", "void"]


class EmotionScores(BaseModel):
    # 7감정 비중(선택 입력). 슬러그 키 = 프론트 Emo7 과 1:1.
    joy: int = Field(0, ge=0, le=100)      # 기쁨
    calm: int = Field(0, ge=0, le=100)     # 차분
    love: int = Field(0, ge=0, le=100)     # 사랑
    sad: int = Field(0, ge=0, le=100)      # 슬픔
    anger: int = Field(0, ge=0, le=100)    # 분노
    tension: int = Field(0, ge=0, le=100)  # 긴장
    empty: int = Field(0, ge=0, le=100)    # 공허


# 일기 화면용 7라벨 (기쁨/차분/사랑/슬픔/분노/긴장/공허) — 프론트 diaryStore.EmotionLabel 과 1:1
_DIARY_LABELS = ("기쁨", "차분", "사랑", "슬픔", "분노", "긴장", "공허")


class DiaryEmotion(BaseModel):
    label: str
    pct: int


class DiaryResult(BaseModel):
    emotions: list[DiaryEmotion]
    primary: str


class AnalyzeResponse(BaseModel):
    status: str = "success"
    extracted_text: str
    dominant: Dominant                 # 행성 분기(7종) — diary.primary 에서 파생
    keywords: list[str]
    crisis_score: float = Field(0.0, ge=0.0, le=1.0)
    diary: DiaryResult  # 앱 일기 화면용 7감정 결과 (단일 소스)

class MomoReplyRequest(BaseModel):
    text: str
    emotions: Optional[EmotionScores] = None
    history: list[str] = Field(default_factory=list)
    context: list[str] = Field(default_factory=list)  # RAG: 검색된 과거 일기 스니펫
    profile: str = ""  # ③④ 사실·성향 요약 (항상 주입되는 장기기억)
    isLinkAgreed : bool = False # 전문가 연계는 사용자가 동의 하에 진행
    session_id: Optional[str] = None  # 모모챗 세션 식별(성능 9지표 로깅용)


class EmbedRequest(BaseModel):
    text: str


class EmbedResponse(BaseModel):
    embedding: Optional[list[float]] = None
    dim: int = 0


# ── 장기기억 추출기 (③ 사실 / ④ 성향 / 관계) ──
class ReflectRequest(BaseModel):
    diaries: list[str] = Field(default_factory=list)
    fact_summary: Optional[str] = None
    persona_summary: Optional[str] = None


class ReflectFact(BaseModel):
    kind: str = "slow"
    key: str
    value: str


class ReflectRelation(BaseModel):
    name: str
    relation: str = ""
    sentiment: str = ""


class ReflectResponse(BaseModel):
    fact_summary: str = ""
    persona_summary: str = ""
    facts: list[ReflectFact] = Field(default_factory=list)
    relations: list[ReflectRelation] = Field(default_factory=list)


class WeeklyReq(BaseModel):
    diaries: list[str] = Field(default_factory=list)


class WeeklyAIResponse(BaseModel):
    summary: str = ""
    recommendations: list[str] = Field(default_factory=list)


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
    emotion_hint: Optional[str] = None   # 7감정 라벨 중 하나 또는 None


class WeeklyReviewResponse(BaseModel):
    summary: str
    dominant: Dominant
    calendar: list[Optional[Dominant]]  # 7일
    recommendations: list[str]


# diary Message draft test
class MomoDiaryMessage(BaseModel):
    who: Optional[str] = None
    when : Optional[str] = None
    how : Optional[str] = None
    what : Optional[str] = None
    where : Optional[str] = None
    why : Optional[str] = None
    text : Optional[str] = "" # 육하원칙 분석 실패시 text 뭉치로 반환
    role : Optional[str] = None # 사용자(id)
    content : Optional[str] = None # 텍스트 외의 데이터(음성, 사진)

class MomoDiaryRequest(BaseModel):
    messages: list[MomoDiaryMessage] = Field(default_factory=list)
    session_id: Optional[str] = None  # 모모챗 세션 식별(대화 마무리 요약용)

class MomoDiaryResponse(BaseModel):
    diary:str

# ─────────────────────────────────────────────────────────────────────────────
# 휴리스틱 (외부 백엔드 실패/미설정 시 폴백) — 계약을 항상 성립시키는 안전망
# ─────────────────────────────────────────────────────────────────────────────
def dominant_of(primary: str | None) -> Dominant:
    """대표 감정(primary) → 행성 분기(7종). schema.branch_of 단일 소스.
    반환값은 항상 BRANCHES(7) 중 하나이므로 Dominant 로 유효."""
    return branch_of(primary)  # type: ignore[return-value]


_CRISIS_TERMS = ("자해", "자살", "죽고", "죽고싶", "사라지고", "없어지고", "끝내고")


def heuristic_crisis(text: str) -> float:
    hits = sum(1 for t in _CRISIS_TERMS if t in text)
    return min(1.0, 0.55 + 0.2 * hits) if hits else 0.0


def heuristic_keywords(text: str) -> list[str]:
    """7감정 규칙(_DIARY_RULES)에서 매칭된 표현을 키워드로 (실서비스 아님 — 데모/폴백용)."""
    import re

    found: list[str] = []
    for _label, pat in _DIARY_RULES:
        for m in re.findall(pat, text):
            if m and m not in found:
                found.append(m)
    return found[:3] or ["기록"]


# 7라벨 휴리스틱 (프론트 DiaryWrite.analyze 규칙 포팅) — LLM 실패 시 폴백_
_DIARY_RULES: list[tuple[str, str]] = [
    ("기쁨", "기쁘|행복|뿌듯|좋|감사|신나|설레|즐거"),
    ("사랑", "사랑|보고싶|애틋|따뜻|애정"),
    ("차분", "평온|편안|안정|차분|괜찮|담담|쉬|쉬엄"),
    ("슬픔", "슬프|우울|눈물|외로|지쳤|허전|아프"),
    ("분노", "화|짜증|답답|억울|열받|분노"),
    ("긴장", "불안|걱정|초조|긴장|무섭|두렵|떨려|회의"),
    ("공허", "공허|텅 빈|무기력|허무|아무것"),
]

_DIARY_BASE: dict[str, int] = {"기쁨": 4, "차분": 4, "사랑": 2, "슬픔": 2, "분노": 1, "긴장": 2, "공허": 1}


def heuristic_diary(text: str) -> DiaryResult:
    import re

    scores = dict(_DIARY_BASE)
    for label, pat in _DIARY_RULES:
        m = re.findall(pat, text)
        if m:
            scores[label] += len(m) * 8
    total = sum(scores.values()) or 1
    ranked = sorted(
        ({"label": k, "pct": round(v / total * 100)} for k, v in scores.items()),
        key=lambda x: x["pct"],
        reverse=True,
    )
    emos = [DiaryEmotion(**x) for x in ranked if x["pct"] >= 5]
    primary = emos[0].label if emos else "차분"
    return DiaryResult(emotions=emos, primary=primary)


def normalize_diary(raw: dict, text: str) -> DiaryResult:
    """LLM이 준 diary를 검증/정리. 없거나 이상하면 휴리스틱 폴백."""
    items = (raw or {}).get("emotions") or []
    emos = []
    for x in items:
        label = str(x.get("label", "")).strip()
        if label in _DIARY_LABELS:
            emos.append(DiaryEmotion(label=label, pct=max(0, min(100, int(x.get("pct", 0) or 0)))))
    if not emos:
        return heuristic_diary(text)
    emos.sort(key=lambda e: e.pct, reverse=True)
    primary = str((raw or {}).get("primary") or "").strip()
    if primary not in _DIARY_LABELS:
        primary = emos[0].label
    return DiaryResult(emotions=emos, primary=primary)


def _analyze_from_data(data: dict, text: str) -> AnalyzeResponse:
    """analyzer 가 준 7감정 JSON dict → AnalyzeResponse (검증·클램프·폴백 포함).
    감정/대표감정은 diary(7)로 통일하고, 행성 분기(dominant)는 primary 에서 파생한다.
    (emotions/primary 는 최상위 키 — 7감정 계약)"""
    diary = normalize_diary(data, text)
    keywords = [str(k) for k in (data.get("keywords") or [])][:3] or ["기록"]
    crisis = float(data.get("crisis_score", 0.0) or 0.0)
    return AnalyzeResponse(
        extracted_text=text,
        dominant=dominant_of(diary.primary),
        keywords=keywords,
        crisis_score=max(0.0, min(1.0, crisis)),
        diary=diary,
    )

# ─────────────────────────────────────────────────────────────────────────────
# 임베딩 (RAG 장기기억) — 768차원 설정
# ─────────────────────────────────────────────────────────────────────────────
_embed_client_cache: Optional[tuple] = None
_embed_client_ready: bool = False

def get_client() -> Optional[tuple]:
    """
    임베딩 클라이언트 관문 — 설정이 갖춰졌을 때만 (client, model, dim) 반환.

    반환:
      (client, model, dim) — 임베딩 사용 가능. client 는 OpenAI 호환.
                             dim>0 : dimensions 파라미터 전송 가능(OpenAI 계열).
                             dim==0: 전송 금지(gemini/vllm 등 고정 차원 서버).
      None                 — 임베딩 미설정/불가. 호출부(embed_text)는 None 으로 폴백.

    설계:
      - EMBED_BASE_URL 과 EMBED_MODEL 둘 다 있어야 활성. 하나라도 비면 None.
        (임베딩은 감정분석과 별개 축 → EMBED_* 로만 켠다. 안 채우면 RAG 자동 OFF)
      - openai SDK 미설치·클라이언트 생성 실패도 None → 서버는 계속 뜬다.
      - 판정 결과를 캐시(성공/실패 모두)해 요청마다 재생성하지 않는다.
    """
    global _embed_client_cache, _embed_client_ready

    if _embed_client_ready:
        return _embed_client_cache

    _embed_client_ready = True  # 아래 초기화는 한 번만

    # 1) 설정 게이트 — 필수값 없으면 임베딩을 끈 것으로 간주
    if not settings.EMBED_BASE_URL or not settings.EMBED_MODEL:
        _embed_client_cache = None
        return None

    # 2) 클라이언트 생성 (lazy import — 부팅 시 openai 없어도 서버는 뜸)
    try:
        from openai import OpenAI

        client = OpenAI(
            base_url=settings.EMBED_BASE_URL,
            api_key=settings.EMBED_API_KEY or "not-needed",
            timeout=settings.REQUEST_TIMEOUT,
        )
    except Exception as e:  # ImportError 포함
        print(f"[embed] 클라이언트 생성 실패 → 임베딩 비활성: {e}")
        _embed_client_cache = None
        return None

    # 3) dim 정규화 — 음수 방지, 0 이면 'dimensions 미전송' 신호
    dim = settings.EMBED_DIM if settings.EMBED_DIM and settings.EMBED_DIM > 0 else 0

    _embed_client_cache = (client, settings.EMBED_MODEL, dim)
    print(f"[embed] 활성화: model={settings.EMBED_MODEL} dim={dim or '(고정)'}")
    return _embed_client_cache

def embed_text(text: str) -> Optional[list[float]]:
    """토글 임베딩 — get_client() 가 (client, model, dim) 반환. 없으면 None."""
    if not text.strip() or not settings.EMBED_BASE_URL or not settings.EMBED_MODEL:
        return None
    ec = get_client()
    if ec is None:
        return None
    client, model, dim = ec
    try:
        kwargs = {"model": model, "input": text}
        if dim:  # openai 계열만 dimensions 지원. vllm/gemini 는 고정.
            kwargs["dimensions"] = dim
        r = client.embeddings.create(**kwargs)
        return list(r.data[0].embedding)
    except Exception as e:
        # dimensions 미지원 서버(vllm 등)면 빼고 재시도
        if "dimensions" in str(e).lower():
            try:
                r = client.embeddings.create(model=model, input=text)
                return list(r.data[0].embedding)
            except Exception as e2:
                print(f"embed 재시도 실패: {e2}")
                return None
        print(f"embed 실패: {e}")
        return None

def _heuristic_analyze(text: str) -> AnalyzeResponse:
    """완전 폴백 — 외부 백엔드 없이 계약을 성립시킨다 (7감정)."""
    diary = heuristic_diary(text)
    return AnalyzeResponse(
        extracted_text=text,
        dominant=dominant_of(diary.primary),
        keywords=heuristic_keywords(text),
        crisis_score=heuristic_crisis(text),
        diary=diary,
    )


def _gen_text(system: str, user: str) -> Optional[str]:
    """analyzer.generate() 안전 래퍼 — 실패하면 None (호출부가 폴백 문구)."""
    analyzer: Analyzer = build_analyzer()
    try:
        out = analyzer.generate(system, user)
        return out.strip() if out else None
    except Exception as e:
        print(f"[main] generate 실패({analyzer.name}): {e}")
        return None


def _gen_text_momo(system: str, user: str, *, call_type: str,
                   session_id: Optional[str] = None) -> Optional[str]:
    """모모챗 전용 generate — vLLM 이면 스트리밍 계측(9지표 로깅) 경로, 그 외엔 일반 generate.
    성능 로깅은 '모모챗에서만' 하므로 여기서만 generate_logged 를 탄다."""
    analyzer: Analyzer = get_analyzer()
    if getattr(analyzer, "name", "") == "vllm" and hasattr(analyzer, "generate_logged"):
        try:
            out = analyzer.generate_logged(system, user, call_type=call_type, session_id=session_id)
            return out.strip() if out else None
        except Exception as e:
            print(f"[momo-metrics] 스트리밍 계측 실패 → 일반 generate 폴백: {e}")
    try:
        out = analyzer.generate(system, user)
        return out.strip() if out else None
    except Exception as e:
        print(f"[main] generate 실패({analyzer.name}): {e}")
        return None


# ─────────────────────────────────────────────────────────────────────────────
# 라우트
# ─────────────────────────────────────────────────────────────────────────────

# ── 분석기 지연 초기화 ──
# 시작 시 한 번만 생성해 재사용. 초기화가 실패해도 서버는 뜨게 하고 dummy 로 폴백 → 부분 장애가 전체 다운으로 안 번지게.
_analyzer: Analyzer | None = None

def get_analyzer() -> Analyzer:
    global _analyzer
    if _analyzer is None:
        try:
            _analyzer = build_analyzer()
        except Exception as e:
            print(f"[main] Analyzer 초기화 실패({e}) → dummy 로 폴백")
            from analyzers import DummyAnalyzer
            _analyzer = DummyAnalyzer()
    print(f"[main] Analyzer Loaded: {_analyzer.name}")
    return _analyzer

@app.get("/")
def read_root():
    return {"message": "Innerverse AI Server is running!",
            "analyzer": get_analyzer().name}
'''
@app.get("/health")
def health():
    a = get_analyzer()
    return {
        "status": "ok",
        "analyzer_backend": settings.ANALYZER_BACKEND,   # 축 1 (설정값)
        "active_analyzer": a.name,                        # 축 1 (실제 로드)
        # 축 2 는 vLLM 을 실제로 쓸 때만 의미. 그 외엔 None 으로 표시.
        "vllm_provider": getattr(a, "provider_name", None),
    }
'''
async def _run_analysis(text: str) -> dict:
    """
    분석기 호출 + 공통 후처리(색상) + 폴백을 한곳에서.
    동기 .analyze 를 스레드풀에서 돌려 async 라우터를 막지 않는다.
    """
    analyzer = get_analyzer()
    try:
        result = await asyncio.to_thread(analyzer.analyze, text)
    except Exception as e:
        print(f"[main] 분석 실패({analyzer.name}): {e}")
        if settings.FALLBACK_TO_DUMMY:
            result = analyzer.analyze(text)
        else:
            raise
    # 어떤 조합이든 반드시 이 후처리를 거쳐 색을 입힌다.
    return attach_colors(result)
'''
@app.get("/health")
def health():
    """진단용 — 현재 두 축 토글과 실제 활성 백엔드(폴백 반영)"""
    provider_name = None
    provider_url = None
    if settings.ANALYZER_BACKEND == "vllm":
        try:
            p = build_provider()
            provider_name = p.name
            provider_url = p.endpoint().base_url
        except Exception as e:
            provider_name = settings.VLLM_PROVIDER
            provider_url = f"(미해결: {e})"
    else : analyzer = get_analyzer()
    return {
        "status": "ok",
        "analyzer_backend": settings.ANALYZER_BACKEND,   # 설정값(축1)
        "active_analyzer": active_backend_name(),         # 실제 활성(폴백 반영)
        "vllm_provider": settings.VLLM_PROVIDER,           # 설정값(축2)
        "vllm_provider_resolved": provider_name,
        "vllm_base_url": provider_url,
        "vllm_model": settings.VLLM_MODEL or None,
        "fallback_to_dummy": settings.FALLBACK_TO_DUMMY,
    }
'''
@app.get("/health")
def health():
    """진단용 — 현재 두 축 토글과 실제 활성 백엔드(폴백 반영)"""
    global _analyzer
    _analyzer = get_analyzer()
    if _analyzer.name == "vllm":
        provider_name = _analyzer.name if not _analyzer else "dummy"
        provider_url = _analyzer.endpoint().base_url if not _analyzer else None

    return {
        "status": "ok",
        "analyzer_backend": settings.ANALYZER_BACKEND,   # 설정값
        "active_analyzer": _analyzer.name,         # 실제 활성(폴백 반영)
        "vllm_provider": settings.VLLM_PROVIDER,           # 설정값
        "vllm_provider_resolved": provider_name or None,
        "vllm_base_url": provider_url or None,
        "vllm_model": settings.VLLM_MODEL or None,
        "fallback_to_dummy": settings.FALLBACK_TO_DUMMY,
    }

@app.get("/api/_debug/analyze")
def debug_analyze(text: str = "오늘은 조금 지치고 불안했지만 그래도 버텼다."):
    """실제 analyzer.analyze() 를 한 번 호출해 원시 결과/에러를 그대로 반환 (진단용).
    현재 토글 경로를 그대로 탄다. 폴백 없이 raw 를 보고 싶을 때."""
    analyzer = build_analyzer()
    try:
        raw = analyzer.analyze(text)
        return {"ok": True, "backend": analyzer.name, "raw": raw}
    except Exception as e:
        return {"ok": False, "backend": analyzer.name, "error": f"{type(e).__name__}: {e}"}


@app.post("/api/analyze", response_model=AnalyzeResponse)
async def analyze_diary(
    audio_file: UploadFile | None = File(None),
    text_data: str | None = Form(None),
):
    """일기(text/audio) → 7감정 + dominant + keywords + crisis_score
    응답 규격 = 프론트 diaryStore(7감정) / lib/api.ts 와 1:1.
    analyzer.analyze() 우선, 실패 시 휴리스틱 폴백."""
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

    if not extracted_text.strip():
        return _heuristic_analyze(extracted_text)
    
    analyzer = build_analyzer()
    try:
        raw = await asyncio.to_thread(analyzer.analyze, extracted_text)
        # dummy 는 고정 안전값 → 휴리스틱으로 보강해서 실제 텍스트 반영
        if raw.get("_dummy"):
            return _heuristic_analyze(extracted_text)
        return _analyze_from_data(raw, extracted_text)
    except Exception as e:
        print(f"[main] analyze 실패({analyzer.name}) → 휴리스틱 폴백: {e}")
        if not settings.FALLBACK_TO_DUMMY:
            raise
        return _heuristic_analyze(extracted_text)


@app.post("/api/momo/reply", response_model=MomoReplyResponse)
async def momo_reply(req: MomoReplyRequest):
    """모모 공감 답장 — RAG(과거 일기 context) + 감정 주입 → analyzer.generate(); 실패 시 휴리스틱."""
    crisis = heuristic_crisis(req.text)
    escalate = crisis >= 0.6

    parts: list[str] = []
    if req.profile:
        parts.append(f"내가 아는 너(장기기억): {req.profile}")
    if req.context:
        parts.append("과거 기록(참고):\n" + "\n".join(f"- {c}" for c in req.context[:3]))
    if req.emotions:
        e = req.emotions
        parts.append(
            f"현재 감정비중 기쁨{e.joy}/차분{e.calm}/사랑{e.love}/슬픔{e.sad}/"
            f"분노{e.anger}/긴장{e.tension}/공허{e.empty}"
        )
    if req.history:
        parts.append("직전 대화:\n" + "\n".join(req.history[-6:]))
    parts.append(f"사용자: {req.text}")
    if escalate and req.isLinkAgreed:
        parts.append("(위기 신호 감지됨 — 위로 후 전문가 연계를 부드럽게 권할 것)")

    # reply = await asyncio.to_thread(_gen_text, PROMPT_MOMO_SYSTEM, "\n\n".join(parts))
    reply = await asyncio.to_thread(
        _gen_text_momo, PROMPT_MOMO_SYSTEM, "\n\n".join(parts),
        call_type="momo_reply", session_id=req.session_id,
    )
    if not reply:
        if escalate:
            reply = "많이 힘들었구나. 지금은 저보다 전문가의 도움이 필요한 순간 같아요. 비대면 상담을 연결해 드릴까요?"
        elif req.context:
            reply = "예전 기록을 보니 너 이런 결을 지나온 적 있어. 그때처럼 오늘도 한 걸음만 같이 가보자."
        else:
            reply = "그 마음 충분히 그럴 수 있어. 오늘은 작은 한 걸음만 같이 떠올려보자."
    return MomoReplyResponse(reply=reply.strip(), escalate=escalate)


PROMPT_MOMO_DIARY = (
    "너는 사용자의 하루 대화를 바탕으로 '1인칭 일기'를 써주는 도우미다.\n"
    "- 사용자(me) 발화를 중심으로 오늘 있었던 일과 감정을 '나는…' 1인칭으로.\n"
    "- 모모 말은 참고만 하고 그대로 옮기지 말 것. 2~4문장, 담백하게. 본문만."
)
@app.post("/api/momo/diary", response_model=MomoDiaryResponse)
async def momo_diary(req: MomoDiaryRequest):
    """당일 모모 대화 → 1인칭 일기 본문. 프론트 chatToDiary() 계약."""
    # def who(m): return "me" if (m.who or m.role or "").lower() in ("me", "user") else "momo"
    def who(m): return "me"
    def txt(m): return (m.text or m.content or "").strip()

    lines = [f"{who(m)}: {txt(m)}" for m in req.messages if txt(m)]
    if not lines:
        return MomoDiaryResponse(diary="")
    # body = await asyncio.to_thread(_gen_text, PROMPT_MOMO_DIARY, "\n".join(lines))
    body = await asyncio.to_thread(
        _gen_text_momo, PROMPT_MOMO_DIARY, "\n".join(lines),
        call_type="momo_diary", session_id=req.session_id,
    )
    if not body:  # LLM 실패 → 사용자 발화 이어붙이기 (프론트 폴백과 동일)
        body = " ".join(txt(m) for m in req.messages if who(m) == "me" and txt(m))
    # 대화 마무리 시점 — 이 세션의 턴 지표를 집계해 요약 출력(모모챗 전용, vLLM 일 때만 데이터 있음)
    log_session_summary(req.session_id)
    return MomoDiaryResponse(diary=body.strip())


@app.post("/api/embed", response_model=EmbedResponse)
def embed(req: EmbedRequest):
    """RAG 임베딩 — embed_text() 단일 경로 사용. 미설정/실패면 None(프론트 폴백 검색)."""
    v = embed_text(req.text)
    return EmbedResponse(embedding=v, dim=len(v) if v else 0)

PROMPT_REFLECT = (
    "너는 사용자의 장기 기억을 관리하는 분석기다. 최근 일기들과 기존 프로필을 보고 갱신하라.\n"
    "- fact_summary: 사용자에 대한 '사실'을 한 단락으로 누적 요약(직업·상황·핵심 관계 등). 기존 요약을 유지하며 갱신.\n"
    "- persona_summary: 반복되는 '성향·패턴'을 한 단락으로(예: 스트레스 받으면 자책, 칭찬받으면 회복 빠름, 월요일에 가라앉음).\n"
    "- facts: 새로 확인된 구조화 사실. kind는 permanent|slow|tracked 중 하나, key/value.\n"
    "- relations: 일기에 등장한 사람. name/relation/sentiment.\n"
    "근거가 약하면 비워라(지어내지 말 것).\n"
    '반드시 JSON만: {"fact_summary":"...","persona_summary":"...",'
    '"facts":[{"kind":"slow","key":"직업","value":"대학생"}],'
    '"relations":[{"name":"소연","relation":"친구","sentiment":"긍정"}]}'
)


@app.post("/api/reflect", response_model=ReflectResponse)
def reflect(req: ReflectRequest):
    """최근 일기 → 사실/성향 요약·구조화 사실·관계 추출
    analyzer.generate() 로 JSON 유도 후 파싱. 실패/미설정이면 기존 값 유지."""
    import json

    fallback = ReflectResponse(fact_summary=req.fact_summary or "", persona_summary=req.persona_summary or "")
    if not req.diaries:
        return fallback

    user = (
        f"기존 fact_summary: {req.fact_summary or '(없음)'}\n"
        f"기존 persona_summary: {req.persona_summary or '(없음)'}\n\n"
        "최근 일기:\n" + "\n".join(f"- {d}" for d in req.diaries[:10])
    )
    raw = _gen_text(PROMPT_REFLECT, user)
    if not raw:
        return fallback
    try:
        cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        d = json.loads(cleaned)
    except Exception as e:
        print(f"[main] reflect 파싱 실패: {e}")
        return fallback

    facts = []
    for f in d.get("facts") or []:
        if not f.get("key"):
            continue
        kind = str(f.get("kind", "slow"))
        if kind not in ("permanent", "slow", "tracked"):
            kind = "slow"
        facts.append(ReflectFact(kind=kind, key=str(f["key"]), value=str(f.get("value", ""))))
    rels = [
        ReflectRelation(name=str(r["name"]), relation=str(r.get("relation", "")), sentiment=str(r.get("sentiment", "")))
        for r in (d.get("relations") or [])
        if r.get("name")
    ]
    return ReflectResponse(
        fact_summary=str(d.get("fact_summary") or req.fact_summary or ""),
        persona_summary=str(d.get("persona_summary") or req.persona_summary or ""),
        facts=facts,
        relations=rels,
    )


@app.post("/api/crisis/check", response_model=CrisisCheckResponse)
async def crisis_check(req: CrisisCheckRequest):
    score = heuristic_crisis(req.text)
    return CrisisCheckResponse(
        risk_score=score,
        signal="high" if score >= 0.6 else ("low" if score > 0 else "none"),
        suggest_escalation=score >= 0.6,
    )


@app.post("/api/vision", response_model=VisionResponse)
async def vision(photo: UploadFile = File(...)):
    """멀티모달 사진 분석 — 사진 속 장면·분위기를 일기 맥락으로.
    analyzer.analyze_image() 사용. 백엔드가 vision 미지원이거나 실패하면 스탑."""
    import base64
    #import json

    analyzer = build_analyzer()
    try:
        data = await photo.read()
        b64 = base64.b64encode(data).decode()
        mime = photo.content_type or "image/jpeg"
        d = analyzer.analyze_image(mime, b64)
        eh = d.get("emotion_hint")
        if eh not in EMOTION_LABELS:   # 7감정 라벨 중 하나만 허용
            eh = None
        return VisionResponse(
            labels=[str(x) for x in (d.get("labels") or [])][:5] or ["사진"],
            scene=str(d.get("scene") or ""),
            emotion_hint=eh,
        )
    except NotImplementedError:
        return VisionResponse(labels=["사진"], scene="(분석 불가 — 비전 지원 백엔드 아님)", emotion_hint=None)
    except Exception as e:
        print(f"[main] vision 실패({analyzer.name}): {e}")
        return VisionResponse(labels=["사진"], scene="(분석 실패)", emotion_hint=None)


PROMPT_WEEKLY = (
    "너는 따뜻한 감정 회고 도우미다. 이번 주 일기들을 보고:\n"
    "- summary: 2~3문장으로 이번 주 마음 흐름을 따뜻하게 회고(판단·훈계 금지).\n"
    "- recommendations: 도움될 추천 3개(노래/장소/활동 등, 짧게).\n"
    '반드시 JSON만: {"summary":"...","recommendations":["...","...","..."]}'
)


@app.post("/api/weekly", response_model=WeeklyAIResponse)
def weekly(req: WeeklyReq):
    """이번 주 일기 → AI 회고 요약 + 추천. 미설정/일기 없으면 기본 문구."""
    import json

    fb = WeeklyAIResponse(
        summary="이번 주도 마음을 차곡차곡 기록했어요. 작은 순간들이 행성 위에 쌓이고 있어요 🌱",
        recommendations=["가벼운 산책 30분", "좋아하는 노래 한 곡", "오늘의 감정 한 줄 더"],
    )
    if not req.diaries:
        return fb

    user = "이번 주 일기:\n" + "\n".join(f"- {d}" for d in req.diaries[:10])
    raw = _gen_text(PROMPT_WEEKLY, user)
    if not raw:
        return fb
    try:
        cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        d = json.loads(cleaned)
    except Exception as e:
        print(f"[main] weekly 파싱 실패: {e}")
        return fb

    recs = [str(x) for x in (d.get("recommendations") or [])][:4]
    return WeeklyAIResponse(summary=str(d.get("summary") or fb.summary), recommendations=recs or fb.recommendations)


@app.get("/api/weekly/{uid}", response_model=WeeklyReviewResponse)
async def weekly_review(uid: str):
    """주간 리뷰 (집계형 스텁 — 실제 AI 요약은 POST /api/weekly 사용)."""
    return WeeklyReviewResponse(
        summary="POST /api/weekly 로 AI 요약을 생성하세요.",
        dominant="calm",
        calendar=[None, None, None, None, None, None, None],
        recommendations=["일기 꾸준히 쓰기"],
    )


@app.post("/api/insights")
async def insights(extracted_text: str = Form("")):
    """텍스트 → 분석기 결과(감정·관계) 반환.
    Phase 5 목표는 집계·차분 프라이버시 기반 B2B 인사이트(개인 식별 불가)이며, 현재는
    단일 텍스트 분석 결과를 그대로 내려주는 단계.
    """
    # 1. 분석: 텍스트를 분석기에 전달하고 결과(색 후처리 포함)를 받는다.
    analysis = await _run_analysis(extracted_text or "")

    # 2. 프론트엔드로 분석 결과(JSON) 반환.
    #    dummy 백엔드는 raw 형태(emotions/relationships 없음)를 주므로 .get 으로 방어.
    return {
        "status": "success",
        "extracted_text": extracted_text or "",
        "emotions": analysis.get("emotions", []),
        "relationships": analysis.get("relationships", []),
    }
