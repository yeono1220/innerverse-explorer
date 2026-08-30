"""
감정 분석 결과의 '공통 계약(contract)' — 7감정 단일 소스(single source of truth).

어떤 분석기(vLLM / Claude / Gemini / dummy)가 오든, 또 vLLM 이 어느 provider
에서 돌든, 최종적으로 프론트엔드로 내려가는 감정 라벨은 항상 아래 7종이다.
프론트(diaryStore.EMOTION_COLORS / glass-momo constants)와 1:1로 맞춘다.

원칙 3가지:
  1. 감정 라벨 → 색상 매핑은 여기서 '고정'. LLM 은 label + pct 만 만들고 색은 서버가 채운다.
  2. LLM 에 강제할 JSON 스키마도 여기서 정의해 vLLM/Claude/Gemini 가 공유한다.
  3. 감정 축은 7종(기쁨/차분/사랑/슬픔/분노/긴장/공허)이 유일하다.
     3D 행성 '분기(branch)' 7종은 EMOTION_TO_BRANCH 로 감정에서 1:1 파생된다.
     (과거의 5감정 pos/calm/ten/sad/emp 축은 폐기 — 사랑/분노가 1등 시민이 됨)
"""

# ── 7감정 고정 색 (프론트 src/store/diaryStore.ts EMOTION_COLORS 와 1:1) ──
EMOTION_COLORS: dict[str, str] = {
    "기쁨": "#e8c45f",
    "차분": "#5fc88a",
    "사랑": "#e87fb8",
    "슬픔": "#6f9ae8",
    "분노": "#e8744e",
    "긴장": "#d99a4e",
    "공허": "#8a82a0",
}
EMOTION_LABELS: list[str] = list(EMOTION_COLORS.keys())

# 영문 슬러그 (CSS 변수 --iv-emo-* / 프론트 Emo7 타입과 1:1)
EMOTION_SLUG: dict[str, str] = {
    "기쁨": "joy",
    "차분": "calm",
    "사랑": "love",
    "슬픔": "sad",
    "분노": "anger",
    "긴장": "tension",
    "공허": "empty",
}

# 7감정 → 행성 분기(7종) 1:1 매핑.
# 프론트 src/glass-momo/constants.ts 의 BRANCH_OF 와 반드시 일치해야 한다.
EMOTION_TO_BRANCH: dict[str, str] = {
    "기쁨": "bloom",
    "차분": "calm",
    "사랑": "love",
    "슬픔": "wither",
    "분노": "rage",
    "긴장": "tense",
    "공허": "void",
}
# 행성 분기 7종 (dominant 값의 허용 집합)
BRANCHES: list[str] = ["bloom", "calm", "love", "wither", "rage", "tense", "void"]


def branch_of(primary: str | None) -> str:
    """대표 감정(primary) → 행성 분기. 알 수 없으면 평온(calm)."""
    return EMOTION_TO_BRANCH.get(primary or "", "calm")


# LLM 에 강제할 구조화 출력 스키마 (7감정 + 관계). B2B 인사이트/구조화 출력 공용.
ANALYSIS_JSON_SCHEMA: dict = {
    "type": "object",
    "properties": {
        "emotions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "label": {"type": "string", "enum": EMOTION_LABELS},
                    "pct": {"type": "integer", "minimum": 0, "maximum": 100},
                },
                "required": ["label", "pct"],
                "additionalProperties": False,
            },
        },
        "relationships": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "person": {"type": "string"},
                    "relation": {"type": "string"},
                    "status": {"type": "string"},
                    "score": {"type": "integer", "minimum": -100, "maximum": 100},
                },
                "required": ["person", "relation", "status", "score"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["emotions", "relationships"],
    "additionalProperties": False,
}


def attach_colors(analysis: dict) -> dict:
    """
    모든 분석기 결과가 반드시 거쳐 가는 공통 후처리.
    LLM 이 준 label 에 서버가 고정 색을 붙인다 → 조합과 무관하게 색 동일.
    """
    for emo in analysis.get("emotions", []):
        emo["color"] = EMOTION_COLORS.get(emo.get("label", ""), "hsl(0, 0%, 60%)")
    return analysis


# vLLM / Claude / Gemini 공용 시스템 지시문
SYSTEM_PROMPT = (
    "너는 사용자의 일기 텍스트에서 감정과 인간관계를 분석하는 엔진이다.\n"
    f"감정은 반드시 다음 7종만 사용한다: {', '.join(EMOTION_LABELS)}.\n"
    "각 감정은 0~100 사이 정수 pct 로 비중을 표현한다(합은 100 근처).\n"
    "일기에 등장하는 인물은 person(이름), relation(관계), "
    "status(관계 상태 한 줄), score(-100~100, 부정적일수록 음수)로 평가한다.\n"
    "반드시 지정된 JSON 스키마에 맞춰서만 답하고, 그 외 설명은 출력하지 않는다."
)
