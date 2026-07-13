"""
감정 분석 결과의 '공통 계약(contract)'.

어떤 분석기(vLLM / Claude(Gemini) / dummy)가 오든, 또 vLLM 이 어느 provider
에서 돌든, 최종적으로 프론트엔드로 내려가는 JSON 은
항상 이 형태 → 프론트(Zustand store)가 백엔드 조합과 무관하게 동작.

원칙 2가지:
  1. 감정 라벨 → 색상 매핑은 여기서 '고정'. LLM 이 색을 만들지 않는다.
     LLM 은 label + value 만 만들고, 색은 서버가 채운다(attach_colors).
  2. LLM 에 강제할 JSON 스키마도 여기서 정의해 vLLM/Claude(Gemini) 가 공유한다.
"""

# 프론트 디자인에서 정한 감정 5종과 고정 색상
EMOTION_COLORS: dict[str, str] = {
    "pos": "hsl(45, 96%, 55%)",
    "sad": "hsl(217, 91%, 60%)",
    "ten": "hsl(348, 83%, 60%)",
    "emp": "hsl(258, 58%, 58%)",
    "calm": "hsl(187, 80%, 42%)",
}
EMOTION_LABELS: list[str] = list(EMOTION_COLORS.keys())

ANALYSIS_JSON_SCHEMA: dict = {
    "type": "object",
    "properties": {
        "emotions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "label": {"type": "string", "enum": EMOTION_LABELS},
                    "value": {"type": "integer", "minimum": 0, "maximum": 100},
                },
                "required": ["label", "value"],
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


# vLLM / Claude(Gemini) 공용 시스템 지시문
SYSTEM_PROMPT = (
    "너는 사용자의 일기 텍스트에서 감정과 인간관계를 분석하는 엔진이다.\n"
    f"감정은 반드시 다음 5종만 사용한다: {', '.join(EMOTION_LABELS)}.\n"
    "각 감정은 0~100 사이 정수 value 로 강도를 표현한다.\n"
    "일기에 등장하는 인물은 person(이름), relation(관계), "
    "status(관계 상태 한 줄), score(-100~100, 부정적일수록 음수)로 평가한다.\n"
    "반드시 지정된 JSON 스키마에 맞춰서만 답하고, 그 외 설명은 출력하지 않는다."
)
