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

** 토글 구조 **
    gemini / claude : 호스팅 LLM (공통 _LLMAnalyzer 상속, _complete()만 구현)
    vllm            : 직접 서빙(OpenAI 호환)
    dummy           : 외부 호출 없는 고정 결과(기본/폴백)
"""
from __future__ import annotations

import abc
import time
import json
from typing import Optional

from config import settings
from providers import build_provider
from pydantic import BaseModel

# ── 공통 프롬프트 ──────────────────────────────────────────────
PROMPT_ANALYZE = (
    "너는 감정 분석기다. 사용자의 일기를 읽고 Russell 순환모형 5감정의 '비율'을 0~100으로 매겨라.\n"
    "- pos 고양(긍정·높은각성) / calm 평온(긍정·낮은각성) / ten 긴장(부정·높은각성)\n"
    "- sad 격앙(부정·높은각성) / emp 침체(부정·낮은각성)\n"
    "또한 핵심 키워드 3개, 위기신호 점수(crisis_score 0~1)를 산출하라.\n"
    "crisis_score는 자해·자살·심각한 절망 표현이 강할수록 1에 가깝게. (진단이 아니라 신호 강도)\n"
    "ten, sad, emp의 비율이 높게 나온 경우, 그 생각의 근거를 묻는다. 생각의 재구성을 돕고 실행 가능한 다음 행동을 제안해야한다.\n"
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
    "- 아래 '과거 기록'이 있으면 자연스럽게 인용해 '나를 기억하는' 느낌을 줘라.\n"
    "- 진단·의료행위 금지. 위기 신호가 강하면 위로 후 전문가 연계를 부드럽게 권한다."
)


def _strip_code_fence(s: str) -> str:
    """LLM 이 ```json ... ``` 로 감싸는 경우 제거."""
    s = s.strip()
    s = s.removeprefix("```json").removeprefix("```").removesuffix("```")
    return s.strip()

import re
# Gemini 구조화 출력용 스키마 - circular import 방지 위해 여기 정의

class _DiaryEmotion(BaseModel):
    label: str
    pct: int


class _DiaryResult(BaseModel):
    emotions: list[_DiaryEmotion]
    primary: str

class AnalyzeSchema(BaseModel):
    pos: int
    calm: int
    ten: int
    sad: int
    emp: int
    dominant: str
    keywords: list[str]
    crisis_score: float
    diary: _DiaryResult

def _parse_json_object(raw: str) -> dict:
    """LLM JSON 안전 파싱: 코드펜스 제거 + 바깥 {...} 블록만 추출."""
    s = _strip_code_fence(raw)
    if not s.lstrip().startswith("{"):
        m = re.search(r"\{.*\}", s, re.DOTALL)
        if m:
            s = m.group(0)
    return json.loads(s)

# ── 추상 베이스 ────────────────────────────────────────────────
class Analyzer(abc.ABC):
    name: str = "base"

    @abc.abstractmethod
    def analyze(self, text: str) -> dict:
        """텍스트 → 감정 JSON dict. 실패 시 예외를 던진다."""
        raise NotImplementedError

    @abc.abstractmethod
    def generate(self, system: str, user: str) -> str:
        """system+user → 텍스트 응답(모모 답장 등). 실패 시 예외."""
        raise NotImplementedError


# ── 호스팅 LLM 공통(gemini/claude) ────────────────────────────
#   analyze()=JSON 강제 / generate()=자유 텍스트 로직을 여기 한 곳에만 둔다.
#   서브클래스는 '전송 계층' _complete() 하나만 구현하면 됨 → 토글이 깔끔.
class _LLMAnalyzer(Analyzer):
    ANALYZE_SYSTEM = "너는 JSON만 출력하는 감정 분석기다. 코드펜스 없이 순수 JSON만."

    def analyze(self, text: str) -> dict:
        raw = self._complete(
            system=self.ANALYZE_SYSTEM,
            user=PROMPT_ANALYZE.format(text=text),
            # max_tokens=1024,
            max_tokens=2048,  # 토큰 수 넉넉히 - thinking + json 여유
            temperature=settings.ANALYZE_TEMPERATURE,
            json_mode=True,
            schema=AnalyzeSchema,
        )
        return _parse_json_object(raw)

    def generate(self, system: str, user: str) -> str:
        return self._complete(
            system=system, user=user,
            max_tokens=512, temperature=settings.GEN_TEMPERATURE,
            json_mode=False, schema=None,
        )

    def _complete(self, *, system: str, user: str, max_tokens: int,
                  temperature: float, json_mode: bool, schema=None) -> str:
        raise NotImplementedError
    '''
    # vision 은 선택 기능
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
        return {
            "pos": 12, "calm": 20, "ten": 8, "sad": 6, "emp": 6,
            "dominant": "calm",
            "keywords": ["기록"],
            "crisis_score": 0.0,
            "diary": {"emotions": [{"label": "calm", "pct": 100}], "primary": "calm"},
            "_dummy": True,
        }

    def generate(self, system: str, user: str) -> str:
        return "그 마음 충분히 그럴 수 있어. 오늘은 작은 한 걸음만 같이 떠올려보자."


# ── 2) VllmAnalyzer — OpenAI 호환 서버 ────────────────────────
class VllmAnalyzer(Analyzer):
    name = "vllm"

    def __init__(self) -> None:
        # 서빙 위치(Modal/RunPod/custom)에서 (base_url, api_key) 해결.
        # 여기서 endpoint() 를 호출해두면 설정 누락을 '생성 시점'에 빨리 알 수 있다(RuntimeError).
        self._provider = build_provider()
        self._endpoint = self._provider.endpoint()
        self._client = None  # 지연 생성

        if not settings.VLLM_MODEL:
            raise RuntimeError("VLLM_MODEL 이 비어 있습니다. 서빙 중인 모델명을 넣으세요.")
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

# ── 3) GeminiAnalyzer — google-genai (client.models.generate_content) ──
class GeminiAnalyzer(_LLMAnalyzer):
    name = "gemini"

    def __init__(self) -> None:
        if not settings.GEMINI_API_KEY:
            raise RuntimeError("GEMINI_API_KEY 가 비어 있습니다.")
        self._client = None
        self._model = settings.GEMINI_MODEL

    def _get_client(self):
        if self._client is None:
            try:
                from google import genai
                from google.genai import types
            except ImportError as e:
                raise RuntimeError("google-genai SDK 미설치 — `pip install google-genai`") from e
            self._client = genai.Client(
                api_key=settings.GEMINI_API_KEY,
                http_options=types.HttpOptions(timeout=int(settings.REQUEST_TIMEOUT * 1000)),  # ms
            )
        return self._client

    def _complete(self, *, system, user, max_tokens, temperature, json_mode, schema=None) -> str:
        from google.genai import types
        client = self._get_client()

        cfg = types.GenerateContentConfig(
            system_instruction=system,
            temperature=temperature,
            max_output_tokens=max_tokens,
            response_mime_type="application/json" if json_mode else "text/plain",
            response_schema=schema if json_mode else None,
            thinking_config=types.ThinkingConfig(thinking_level="low"),   # ← 반드시 중첩 (flat 금지)
        )

        last = None
        for attempt in range(4):
            try:
                resp = client.models.generate_content(model=self._model, contents=user, config=cfg)
                return resp.text or ""
            except Exception as e:
                last = e
                s = str(e)
                if any(k in s for k in ("503", "UNAVAILABLE", "429", "RESOURCE_EXHAUSTED", "overload")):
                    time.sleep(1.5 * (attempt + 1))  # 지수 백오프
                    continue
                raise
        raise last

# ── 4) ClaudeAnalyzer — anthropic (client.messages.create) ────
class ClaudeAnalyzer(_LLMAnalyzer):
    name = "claude"

    def __init__(self) -> None:
        if not settings.ANTHROPIC_API_KEY:
            raise RuntimeError("ANTHROPIC_API_KEY 가 비어 있습니다.")
        self._client = None
        self._model = settings.CLAUDE_MODEL

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

    def _complete(self, *, system, user, max_tokens, temperature, json_mode, schema=None) -> str:
        client = self._get_client()
        # Claude엔 json_object 강제 옵션이 없어 system 지시로 JSON 유도(+ _strip_code_fence 방어).
        sys_prompt = system + ("\n반드시 순수 JSON만 출력. 코드펜스·설명 금지." if json_mode else "")
        msg = client.messages.create(
            model=self._model, 
            max_tokens=max_tokens,
            temperature=temperature, 
            system=sys_prompt,
            messages=[{"role": "user", "content": user}],
        )
        return "".join(getattr(b, "text", "") for b in msg.content if getattr(b, "type", "") == "text")


# ── 팩토리 ────────────────────────────────────────────────────
_REGISTRY: dict[str, type[Analyzer]] = {
    "vllm": VllmAnalyzer,
    "gemini": GeminiAnalyzer,
    "claude": ClaudeAnalyzer,
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