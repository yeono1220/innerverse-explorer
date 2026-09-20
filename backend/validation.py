"""
입력 검증 계층 — LLM API 를 부르기 '전에' 파이썬 단에서 끝내는 일.

왜 필요한가?
    프론트에 길이 제한이 없다. history/context/diaries 는 무제한으로 들어온다.
    그대로 통과시키면 prefill 이 무제한 → TTFT 가 REQUEST_TIMEOUT(120s) 까지 늘어나고,
    사용자는 120초를 기다린 끝에 타임아웃을 본다. 여기서 막으면 대기 0초에
    원인이 분명한 422 가 나간다.

역할 :
    1) 정규화 — 유니코드/제어문자/공백을 한 가지 형태로 통일.
       같은 문장이 매번 다르게 토큰화되는 걸 막는다(캐시·비용 예측의 전제).
    2) 상한 — 넘으면 거절(422) + 안내문구. 조용히 자르지 않는다.
       사용자가 쓴 일기 뒷부분이 말없이 사라지는 게 더 나쁜 사고다.

── 한글 주의 (이 저장소에서 실측 확인) ──
    NFKC 는 한글 호환 자모(U+3130~U+318F)를 '조합용' 자모로 바꿔버린다.
        'ㅋㅋㅋ' → U+110F U+110F U+110F   (ᄏᄏᄏ — 깨져 보임)
        'ㅠㅠ'   → U+1172 U+1172          (ᅲᅲ)
        'ㄷㄷ'   → U+1103 U+1103          (ᄃᄃ)
    일기·채팅에서 가장 흔한 표현이라 그대로 쓰면 사고다.
    → 호환 자모 구간만 NFKC 에서 제외하고, 나머지 구간엔 정상 적용한다.
      나머지 구간에서 얻는 것:
        · macOS 발 NFD 한글('안녕' = 6 코드포인트) → 합성된 2 코드포인트로
        · 전각 영숫자 'ＡＢＣ１２３' → 'ABC123',  '５０％' → '50%',  '㈜' → '(주)'
      전부 토크나이저가 쪼개는 방식이 달라지는 지점이다.

── 보이지 않는 문자 ──
    ZWSP(U+200B)·BOM(U+FEFF)·양방향 제어문자는 제거한다.
    단 ZWJ(U+200D)와 이모지 변이 선택자(U+FE0F)는 남긴다 —
    지우면 가족 이모지(👨‍👩‍👧) 같은 조합이 낱개로 흩어진다.
"""
from __future__ import annotations

import re
import unicodedata
from typing import Annotated, Optional

from pydantic import BeforeValidator, Field

from config import settings

# ── 정규화 ────────────────────────────────────────────────────

# 한글 호환 자모 구간. 이 구간은 NFKC 를 건너뛴다(위 주석 참조).
_COMPAT_JAMO_RUN = re.compile(r"[㄰-㆏]+")

# 제어문자 + 보이지 않는 서식문자. \n \t 는 살리고, ZWJ/VS16 은 건드리지 않는다.
_INVISIBLE = re.compile(
    "[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F"  # C0 제어문자 (\n \t 제외)
    "​‎‏‪-‮⁦-⁩﻿]"  # ZWSP·양방향·BOM
)

_SPACES = re.compile(r"[ \t 　]+")  # 연속 공백 → 1칸
_BLANK_LINES = re.compile(r"\n{3,}")         # 빈 줄 3개 이상 → 2개


def _nfkc_keep_jamo(s: str) -> str:
    """호환 자모 구간만 원본 유지하고 나머지에 NFKC 적용."""
    parts: list[str] = []
    last = 0
    for m in _COMPAT_JAMO_RUN.finditer(s):
        parts.append(unicodedata.normalize("NFKC", s[last:m.start()]))
        parts.append(m.group(0))  # 'ㅋㅋㅋ' 그대로
        last = m.end()
    parts.append(unicodedata.normalize("NFKC", s[last:]))
    return "".join(parts)


def normalize_text(value):
    """문자열이면 정규화해서 돌려주고, 아니면 그대로 통과(타입 에러는 pydantic 이 낸다)."""
    if not isinstance(value, str):
        return value
    s = value.replace("\r\n", "\n").replace("\r", "\n")
    s = _nfkc_keep_jamo(s)
    s = _INVISIBLE.sub("", s)
    s = _SPACES.sub(" ", s)
    s = "\n".join(line.strip() for line in s.split("\n"))
    s = _BLANK_LINES.sub("\n\n", s)
    return s.strip()


# ── 안내문구 ──────────────────────────────────────────────────

def _subject_particle(word: str) -> str:
    """받침 유무에 따라 '이'/'가'. 안내문구가 어색하지 않도록."""
    if not word:
        return "가"
    last = word[-1]
    if "가" <= last <= "힣":
        return "이" if (ord(last) - 0xAC00) % 28 else "가"
    return "가"


# 필드명 → 사용자가 알아볼 수 있는 이름. 안내문구에 그대로 들어간다.
FIELD_LABELS: dict[str, str] = {
    "text": "대화 내용",       # 모모챗 발화
    "text_data": "일기 본문",
    "extracted_text": "일기 본문",
    "profile": "장기기억 요약",
    "history": "대화 기록",
    "context": "과거 일기 참고 조각",
    "diaries": "일기 목록",
    "messages": "대화 메시지",
    "session_id": "세션 식별자",
}


def too_long_message(field: str, limit: int | None, actual: int | None,
                     *, unit: str = "자") -> str:
    """상한 초과 안내문구. '몇 자를 줄여야 하는지'까지 알려준다."""
    label = FIELD_LABELS.get(field, field)
    head = f"{label}{_subject_particle(label)} 너무 깁니다."
    if limit is None:
        return f"{head} 더 짧게 작성해 주세요."
    if actual is None:
        return f"{head} 최대 {limit:,}{unit}까지 보낼 수 있어요. 더 짧게 작성해 주세요."
    over = max(0, actual - limit)
    return (
        f"{head} 현재 {actual:,}{unit} / 최대 {limit:,}{unit} — "
        f"{over:,}{unit} 정도 줄여서 다시 보내주세요."
    )


class InputTooLong(Exception):
    """Form 엔드포인트처럼 pydantic 모델을 안 거치는 경로용."""

    def __init__(self, field: str, limit: int, actual: int, unit: str = "자"):
        self.field = field
        self.limit = limit
        self.actual = actual
        self.unit = unit
        super().__init__(too_long_message(field, limit, actual, unit=unit))


def ensure_text(value: Optional[str], *, field: str,
                max_chars: int | None = None) -> str:
    """Form/쿼리 파라미터용 — 정규화 후 상한을 넘으면 InputTooLong.

    pydantic 모델(Annotated 타입)을 거치는 경로는 이걸 부를 필요가 없다.
    """
    limit = settings.MAX_DIARY_CHARS if max_chars is None else max_chars
    s = normalize_text(value or "")
    if len(s) > limit:
        raise InputTooLong(field, limit, len(s))
    return s


# ── 재사용 타입 ───────────────────────────────────────────────
# 정규화(BeforeValidator)가 먼저 돌고 그 다음 길이 검사가 돌기 때문에,
# 상한은 '정리된 뒤' 길이 기준이다. 공백만 잔뜩 넣어 우회할 수 없다.

def _bounded_str(limit: int):
    return Annotated[str, BeforeValidator(normalize_text), Field(max_length=limit)]


ChatText = _bounded_str(settings.MAX_CHAT_CHARS)         # 모모챗 발화 1건
DiaryText = _bounded_str(settings.MAX_DIARY_CHARS)       # 일기 본문 1건
ProfileText = _bounded_str(settings.MAX_PROFILE_CHARS)   # 장기기억 요약
Snippet = _bounded_str(settings.MAX_SNIPPET_CHARS)       # context(RAG 스니펫) 1건
HistoryLine = _bounded_str(settings.MAX_HISTORY_CHARS)   # history 1건 = "화자: 발화" 통째
ShortField = _bounded_str(settings.MAX_SHORT_CHARS)      # 육하원칙 조각, role 등
ShortId = _bounded_str(settings.MAX_ID_CHARS)            # session_id 등

HistoryList = Annotated[list[HistoryLine], Field(max_length=settings.MAX_HISTORY_ITEMS)]
ContextList = Annotated[list[Snippet], Field(max_length=settings.MAX_CONTEXT_ITEMS)]
DiaryList = Annotated[list[DiaryText], Field(max_length=settings.MAX_DIARIES_ITEMS)]
