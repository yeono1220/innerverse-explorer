"""
Analyzer 계층 — 축 1: '무엇으로' 분석하는가.

이 레이어의 책임:
    사용자 텍스트를 받아 → 7감정/키워드/위기신호 JSON 을 만든다.
    (반환 dict 규격은 main._analyze_from_data 가 AnalyzeResponse 로 검증)
    감정 축은 7종(기쁨/차분/사랑/슬픔/분노/긴장/공허) 하나뿐. schema.py 가 단일 소스.

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
# 7감정 단일 축. 과거 5감정(pos/calm/ten/sad/emp) 비율 요구는 제거 —
# 5축은 서버가 7감정에서 파생하지 않고, 아예 폐기(행성 분기도 7종으로 확장됨).
PROMPT_ANALYZE = (
    "너는 감정 분석기다. 사용자의 일기를 읽고 아래 7가지 한국어 감정의 "
    "비중(pct, 0~100 정수, 합은 100 근처)을 매겨라.\n"
    "7감정: 기쁨 / 차분 / 사랑 / 슬픔 / 분노 / 긴장 / 공허.\n"
    "- 기쁨: 신남·뿌듯·행복 / 차분: 평온·안정·담담 / 사랑: 애정·따뜻함·그리움\n"
    "- 슬픔: 우울·눈물·외로움 / 분노: 화·짜증·억울 / 긴장: 불안·초조·걱정 / 공허: 무기력·허무·텅 빔\n"
    "비중이 높은 순으로 정렬하고, 가장 강한 감정을 primary 로 정하라.\n"
    "또한 핵심 키워드 3개, 위기신호 점수(crisis_score 0~1)를 산출하라.\n"
    "crisis_score 는 자해·자살·심각한 절망 표현이 강할수록 1에 가깝게. (진단이 아니라 신호 강도)\n"
    "슬픔·분노·긴장·공허가 높게 나오면 그 생각의 근거를 묻고 재구성을 도우며 "
    "실행 가능한 다음 행동을 제안하라.\n"
    '반드시 JSON만 출력: {{"emotions":[{{"label":"기쁨","pct":n}}],'
    '"primary":"기쁨","keywords":[...],"crisis_score":n}}\n'
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
# Gemini 구조화 출력용 스키마 - circular import 방지 위해 여기 정의 (7감정)

class _DiaryEmotion(BaseModel):
    label: str
    pct: int


class AnalyzeSchema(BaseModel):
    emotions: list[_DiaryEmotion]
    primary: str
    keywords: list[str]
    crisis_score: float

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
            # 토큰 수 넉넉히 - thinking + json 여유
            max_tokens=2048,
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
#    외부 키·서버 전혀 없이도 API 계약이 항상 성립하도록. (7감정 형태)
# ─────────────────────────────────────────────────────────────
class DummyAnalyzer(Analyzer):
    name = "dummy"

    def analyze(self, text: str) -> dict:
        return {
            "emotions": [
                {"label": "차분", "pct": 55},
                {"label": "기쁨", "pct": 25},
                {"label": "긴장", "pct": 20},
            ],
            "primary": "차분",
            "keywords": ["기록"],
            "crisis_score": 0.0,
            "_dummy": True,
        }

    def generate(self, system: str, user: str) -> str:
        return "그 마음 충분히 그럴 수 있어. 오늘은 작은 한 걸음만 같이 떠올려보자."


#   로그 데이터 ─ 비스트리밍 응답에서 얻는 지표(E2E/토큰/finish_reason) 한 줄 로깅.
#   이 함수는 analyze(JSON) 등 '비스트리밍' 경로 전용이라 TTFT/TPOT 를 재지 않는다.
#   모모챗 생성(momo_reply/momo_diary)은 momo_metrics.streaming_chat 가 '요청별' TTFT/TPOT 를 직접 측정한다.
def _log_vllm_metrics(*, call_type, model, temperature, json_mode, resp, e2e_s):
    u = getattr(resp, "usage", None)
    ptok = getattr(u, "prompt_tokens", None)
    ctok = getattr(u, "completion_tokens", None)
    fr = resp.choices[0].finish_reason if getattr(resp, "choices", None) else None
    e2e_tps = round(ctok / e2e_s, 2) if (ctok and e2e_s > 0) else None  # 참고용 (큐+prefill 섞임)
    print("[metrics] " + json.dumps({
        "ts": time.time(), "call_type": call_type, "model": model,
        "temperature": temperature, "json_mode": json_mode, "stream": False,
        "e2e_s": round(e2e_s, 4), "e2e_tps": e2e_tps,
        "prompt_tokens": ptok, "completion_tokens": ctok, "finish_reason": fr,
    }, ensure_ascii=False)) # 파이썬 객체를 JSON 형태로 변환


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
        # 로그 데이터 호출 직전 시각
        _t0 = time.perf_counter()
        resp = client.chat.completions.create(
            model=self._model,
            messages=[{"role": "user", "content": PROMPT_ANALYZE.format(text=text)}],
            response_format={"type": "json_object"},
            temperature=settings.ANALYZE_TEMPERATURE,
        )
        content = resp.choices[0].message.content or "{}"
        # 로그 데이터: E2E/토큰/finish_reason 기록 (호출·반환은 원본 그대로)
        _log_vllm_metrics(call_type="analyze", model=self._model,
                          temperature=settings.ANALYZE_TEMPERATURE, json_mode=True,
                          resp=resp, e2e_s=time.perf_counter() - _t0)
        return json.loads(_strip_code_fence(content))

    def generate(self, system: str, user: str) -> str:
        client = self._get_client()
        # 로그 데이터: 호출 직전 시각
        _t0 = time.perf_counter() # 시스템 시간 변경에 영향을 받지 않는 타이머

        resp = client.chat.completions.create(
            model=self._model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=settings.GEN_TEMPERATURE,
        )
        # 로그 데이터: E2E/토큰/finish_reason 기록
        _log_vllm_metrics(call_type="generate", model=self._model,
                          temperature=settings.GEN_TEMPERATURE, json_mode=False,
                          resp=resp, e2e_s=time.perf_counter() - _t0)

        return resp.choices[0].message.content or ""

    def generate_logged(self, system: str, user: str, *, call_type: str,
                        session_id: str | None = None) -> str:
        """모모챗 전용 — 스트리밍으로 호출하며 9지표(ttft/tpot/e2e/토큰 + vLLM /metrics)를 로깅.
        프론트 계약은 그대로(백엔드가 스트림을 다 받아 완성 텍스트를 반환). momo_metrics 로 위임."""
        from momo_metrics import streaming_chat
        client = self._get_client()
        text, _rec = streaming_chat(
            client,
            self._model,
            [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            settings.GEN_TEMPERATURE,
            self._endpoint.base_url,
            call_type=call_type,
            session_id=session_id,
        )
        return text

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
                                '"emotion_hint":"기쁨|차분|사랑|슬픔|분노|긴장|공허 중 하나 또는 null"}'
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
            # temperature is deprecated
            # temperature=temperature, 
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

'''
def active_backend_name() -> str:
    """실제로 활성화된 analyzer 이름 (폴백 반영). /health 표시용."""
    return build_analyzer().name
'''
