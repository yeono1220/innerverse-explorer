"""
Analyzer 계층 — 축 1: '무엇으로' 분석하는가.

이 레이어의 책임:
    사용자 텍스트를 받아 → 5감정/키워드/위기신호/7라벨 JSON 을 만든다.
    (반환 dict 규격은 main._analyze_from_data 가 AnalyzeResponse 로 검증)

설계 원칙:
    - OpenAI 클라이언트는 '지연 생성'(첫 호출 때). import 시점에 네트워크/키를 안 건드림.
    - analyze() 는 실패 시 예외를 던진다. 폴백(dummy) 여부는 팩토리/호출부가 결정.
      (settings.FALLBACK_TO_DUMMY)
    - 텍스트 생성(모모 답장)도 같은 백엔드로 통일 → generate() 제공.
주의(동기 클라이언트):
    명료함을 위해 동기 클라이언트를 쓴다. 트래픽이 늘면 Async 계열로 바꾸거나
    run_in_executor 로 감싼다 → main.py 는 이미 asyncio.to_thread 로 감싸둠.
"""
from __future__ import annotations

import abc
import json
from typing import Optional

from config import settings
# from schema import ANALYSIS_JSON_SCHEMA, SYSTEM_PROMPT
from providers import build_provider


# ─────────────────────────────────────────────────────────────
# 공통 프롬프트 (BACKEND_AI_PLAN.md 4-1 / 4-2)
#   analyze 프롬프트는 main.py 와 동일 규격. 한 곳에서 관리하려고 여기로 옮김.
# ─────────────────────────────────────────────────────────────
PROMPT_ANALYZE = (
    "너는 감정 분석기다. 사용자의 일기를 읽고 Russell 순환모형 5감정의 '비율'을 0~100으로 매겨라.\n"
    "- pos 고양(긍정·높은각성) / calm 평온(긍정·낮은각성) / ten 긴장(부정·높은각성)\n"
    "- sad 격앙(부정·높은각성) / emp 침체(부정·낮은각성)\n"
    "또한 핵심 키워드 3개, 위기신호 점수(crisis_score 0~1)를 산출하라.\n"
    "crisis_score는 자해·자살·심각한 절망 표현이 강할수록 1에 가깝게. (진단이 아니라 신호 강도)\n"
    "dominant 는 bloom|calm|tense|wither|void 중 하나.\n"
    "또한 일기 화면 표시용으로 7개 한국어 감정라벨(기쁨/차분/사랑/슬픔/분노/긴장/공허)의 비중(pct, 합 100 근처)을 "
    "비중 높은 순으로 매기고, 가장 강한 라벨을 primary로 정하라.\n"
    '반드시 JSON만 출력: {{"pos":n,"calm":n,"ten":n,"sad":n,"emp":n,'
    '"dominant":"...","keywords":[...],"crisis_score":n,'
    '"diary":{{"emotions":[{{"label":"기쁨","pct":n}}],"primary":"기쁨"}}}}\n'
    '일기: """{text}"""'
)

PROMPT_MOMO_SYSTEM = (
    "너는 '모모', 유리로 빚어진 다정한 AI 감정 동반자다.\n"
    "- 짧고(2~3문장) 따뜻하게. 판단·훈계·진단 금지.\n"
    "- CBT 톤: 감정을 인정 → 생각을 살짝 다시 보게 → 작은 한 걸음 제안.\n"
    "- 아래 '과거 기록'이 있으면 자연스럽게 인용해 '나를 기억하는' 느낌을 줘라 "
    "(예: 지난번 발표 때도 비슷했는데 잘 넘겼잖아).\n"
    "- 진단·의료행위 금지. 위기 신호가 강하면 위로 후 전문가 연계를 부드럽게 권한다."
)


def _strip_code_fence(s: str) -> str:
    """LLM 이 ```json ... ``` 로 감싸는 경우 제거."""
    s = s.strip()
    s = s.removeprefix("```json").removeprefix("```").removesuffix("```")
    return s.strip()

# 추상 베이스
class Analyzer(abc.ABC):
    name: str = "base"

    @abc.abstractmethod
    def analyze(self, text: str) -> dict:
        """텍스트 → 감정 JSON dict. 실패 시 예외를 던진다."""
        raise NotImplementedError

    @abc.abstractmethod
    def generate(self, system: str, user: str) -> str:
        """system+user → 텍스트 응답(모모 답장 등). 실패 시 예외"""
        raise NotImplementedError
    '''
    # vision 은 선택 기능. 지원 안 하면 NotImplementedError.
    def analyze_image(self, mime: str, b64: str) -> dict:
        raise NotImplementedError(f"{self.name} 백엔드는 vision 미지원")
    '''

# ─────────────────────────────────────────────────────────────
# 1) DummyAnalyzer — 외부 호출 없음 (기본값 / 폴백)
#    외부 키·서버 전혀 없이도 API 계약이 항상 성립하도록.
# ─────────────────────────────────────────────────────────────
class DummyAnalyzer(Analyzer):
    name = "dummy"

    def analyze(self, text: str) -> dict:
        # main.py 의 휴리스틱과 겹치지 않게, 여기선 '고정 안전값'만 준다.
        # 실제 감정 추정은 호출부(main)가 heuristic 으로 보강/대체
        return {
            "pos": 12, "calm": 20, "ten": 8, "sad": 6, "emp": 6,
            "dominant": "calm",
            "keywords": ["기록"],
            "crisis_score": 0.0,
            "diary": {"emotions": [{"label": "calm", "pct": 100}], "primary": "calm"},
            "_dummy": True,
        }
    
    def generate(self, system: str, user: str) -> str:
        # 더미 답장 — 실제 문구는 main 이 상황(context/위기)에 맞게 대체 가능.
        return "그 마음 충분히 그럴 수 있어. 오늘은 작은 한 걸음만 같이 떠올려보자."


# 2) VllmAnalyzer — providers로 얻은 OpenAI 호환 서버 호출
class VllmAnalyzer(Analyzer):
    name = "vllm"

    def __init__(self) -> None:
        # 서빙 위치(Modal/RunPod/custom)에서 (base_url, api_key) 해결.
        # 여기서 endpoint() 를 호출해두면 설정 누락을 '생성 시점'에 빨리 알 수 있다(RuntimeError).
        self._provider = build_provider()
        self._endpoint = self._provider.endpoint()
        self._client = None  # 지연 생성

        if not settings.VLLM_MODEL:
            raise RuntimeError(
                "VLLM_MODEL 이 비어 있습니다. 서빙 중인 모델명을 넣으세요 "
            )
        self._model = settings.VLLM_MODEL

    def _get_client(self):
        if self._client is None:
            try:
                from openai import OpenAI
            except ImportError as e:
                raise RuntimeError("openai SDK 미설치 — `pip install openai`") from e
            self._client = OpenAI(
                base_url=self._endpoint.base_url,
                api_key=self._endpoint.api_key,
                timeout=settings.REQUEST_TIMEOUT,  # 서버리스 콜드스타트 대비
            )
        return self._client

    def analyze(self, text: str) -> dict:
        client = self._get_client()
        resp = client.chat.completions.create(
            model=self._model,
            messages=[{"role": "user", "content": PROMPT_ANALYZE.format(text=text)}],
            response_format={"type": "json_object"},
            temperature=settings.ANALYZE_TEMPERATURE,
        )
        content = resp.choices[0].message.content or "{}"
        return json.loads(_strip_code_fence(content))

    def generate(self, system: str, user: str) -> str:
        client = self._get_client()
        resp = client.chat.completions.create(
            model=self._model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=settings.GEN_TEMPERATURE,
        )
        return resp.choices[0].message.content or ""
''' 멀티 모달로 확장
    def analyze_image(self, mime: str, b64: str) -> dict:
        """vLLM 이 VLM(멀티모달)로 떠 있을 때만 동작.
        일반 텍스트 모델이면 서버가 에러 → 호출부가 스탑 처리."""
        client = self._get_client()
        resp = client.chat.completions.create(
            model=self._model,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": (
                                "이 사진을 보고 일기 맥락용으로 JSON만 출력해라. "
                                '{"labels":[핵심 사물/장면 3~5개 한국어], '
                                '"scene":"한 줄 분위기 묘사(한국어)", '
                                '"emotion_hint":"pos|calm|tense|emp|sad 중 하나 또는 null"}'
                            ),
                        },
                        {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}},
                    ],
                }
            ],
            response_format={"type": "json_object"},
            temperature=0.3,
        )
        content = resp.choices[0].message.content or "{}"
        return json.loads(_strip_code_fence(content))
'''

# ─────────────────────────────────────────────────────────────
# 3) GeminiAnalyzer — 외부 api 호출
#    chat.completions 가 아니라 messages 라 별도 처리.
# ─────────────────────────────────────────────────────────────
class GeminiAnalyzer(Analyzer):
    name = "gemini"

    def __init__(self) -> None:
        if not settings.GEMINI_API_KEY:
            raise RuntimeError("GEMINI_API_KEY 가 비어 있습니다.")
        self._client = None
        self._model = settings.GEMINI_MODEL

    def _get_client(self):
        if self._client is None:
            try:
                import anthropic
            except ImportError as e:
                raise RuntimeError("anthropic SDK 미설치 — `pip install anthropic`") from e
            self._client = anthropic.Anthropic(
                api_key=settings.ANTHROPIC_API_KEY,
                timeout=settings.REQUEST_TIMEOUT,
            )
        return self._client

    def _messages(self, system: str, user: str, max_tokens: int) -> str:
        client = self._get_client()
        msg = client.messages.create(
            model=self._model,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
        return "".join(getattr(b, "text", "") for b in msg.content)
    
    def analyze(self, text: str) -> dict:
        raw = self._messages(
            system="너는 JSON만 출력하는 감정 분석기다. 코드펜스 없이 순수 JSON만.",
            user=PROMPT_ANALYZE.format(text=text),
            max_tokens=800,
        )
        return json.loads(_strip_code_fence(raw))

    def generate(self, system: str, user: str) -> str:
        return self._messages(system=system, user=user, max_tokens=400)

# ─────────────────────────────────────────────────────────────
# 팩토리 — ANALYZER_BACKEND 를 보고 analyzer 를 '지연 생성'
#  생성 실패(키/URL 누락 등) 시 FALLBACK_TO_DUMMY 면 Dummy 로.
# ─────────────────────────────────────────────────────────────
_REGISTRY: dict[str, type[Analyzer]] = {
    "vllm": VllmAnalyzer,
    "gemini": GeminiAnalyzer,
    "dummy": DummyAnalyzer,
}

# 프로세스 1개당 analyzer 1개 캐시 (매 요청 재생성 방지)
_CACHE: dict[str, Analyzer] = {}


def _create(backend: str) -> Analyzer:
    cls = _REGISTRY.get(backend)
    if cls is None:
        print(f"[analyzers] 알 수 없는 ANALYZER_BACKEND='{backend}', dummy 로 대체")
        return DummyAnalyzer()
    return cls()


def build_analyzer(backend: Optional[str] = None) -> Analyzer:
    """
    현재 설정(또는 인자)에 맞는 analyzer 반환.
    - 생성 자체가 실패하면(키/URL/모델 누락) settings.FALLBACK_TO_DUMMY 에 따라
      Dummy 로 떨어지거나 예외를 그대로 올린다.
    - 같은 backend 는 캐시해서 재사용.
    """
    key = (backend or settings.ANALYZER_BACKEND).lower()
    if key in _CACHE:
        return _CACHE[key]

    try:
        analyzer = _create(key)
    except Exception as e:
        if settings.FALLBACK_TO_DUMMY:
            print(f"[analyzers] '{key}' 생성 실패 → dummy 폴백: {e}")
            analyzer = DummyAnalyzer()
        else:
            raise

    _CACHE[key] = analyzer
    return analyzer


def reset_cache() -> None:
    """테스트/설정 변경 후 캐시 비우기."""
    _CACHE.clear()


def active_backend_name() -> str:
    """실제로 활성화된 analyzer 이름 (폴백 반영). /health 표시용."""
    return build_analyzer().name