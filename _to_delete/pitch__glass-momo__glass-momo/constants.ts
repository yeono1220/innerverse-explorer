// INNERVERSE - 글래스 모모 + 감정 진화 상수
// 5분기 행성 정의 (HTML 레퍼런스의 BRANCH 객체 1:1 이식)

export type EmoKey = "pos" | "calm" | "ten" | "sad" | "emp";
export type BranchKey = "bloom" | "calm" | "tense" | "wither" | "void";

export interface BranchDef {
  tint: number; // 유리 색
  soul: number; // 내부 영혼 코어 색
  nm: string; // 이름
  ds: string; // 설명
  lvl: string; // 레벨 배지 텍스트
}

// Russell 순환모형 기반 5감정 → 행성 분기.
// 고양(Elated)/평온(Serene)/긴장(Tense)/격앙(Agitated)/침체(Depressed).
export const BRANCH: Record<BranchKey, BranchDef> = {
  bloom: { tint: 0x3ec074, soul: 0x84e6ad, nm: "고양의 행성", ds: "긍정·높은 각성 — 접근과 성장의 에너지가 차올라요", lvl: "고양" },
  calm: { tint: 0x46a6e6, soul: 0x9fd4ff, nm: "평온의 행성", ds: "긍정·낮은 각성 — 회복과 안전감이 결정처럼 빛나요", lvl: "평온" },
  tense: { tint: 0xd99a4e, soul: 0xf0b46a, nm: "긴장의 행성", ds: "부정·높은 각성 — 위험을 대비하는 신호가 돋아요", lvl: "긴장" },
  wither: { tint: 0xe0574e, soul: 0xf2a59c, nm: "격앙의 행성", ds: "부정·높은 각성 — 장애물을 밀어내려는 격한 마음이 일렁여요", lvl: "격앙" },
  void: { tint: 0x9090c8, soul: 0xbcbcea, nm: "침체의 행성", ds: "부정·낮은 각성 — 상실 속에서 자원을 아끼며 가라앉아요", lvl: "침체" },
};

// 감정 버튼 → 파티클 색 (2색 그라데이션). 키 순서: 고양/평온/긴장/격앙/침체
export const COL: Record<EmoKey, [number, number]> = {
  pos: [0x3ec074, 0x84e6ad], // 고양 Elated
  calm: [0x46a6e6, 0x9fd4ff], // 평온 Serene
  ten: [0xd99a4e, 0xf0c489], // 긴장 Tense
  sad: [0xe0574e, 0xf2a59c], // 격앙 Agitated
  emp: [0x9090c8, 0xbcbcea], // 침체 Depressed
};

// 모모의 공감 대사 (각 감정의 적응적 기능을 긍정적으로 비춰줌)
export const LINES: Record<EmoKey, string> = {
  pos: "고양됐구나 ✨ 그 에너지로 한 걸음 더 나아가자",
  calm: "평온하구나 🌿 회복의 시간을 충분히 누려도 괜찮아",
  ten: "긴장됐겠다. 위험을 살피는 그 마음이 너를 지켜줘.",
  sad: "격한 마음이 솟았구나. 그 힘으로 벽을 넘어보자.",
  emp: "많이 가라앉았지… 지금은 힘을 아껴도 괜찮아.",
};

export const TALK_LINES = [
  "오늘 하루도 잘 버텼네 🌙",
  "무슨 생각해? 들어줄게.",
  "천천히, 떠오르는 대로.",
  "네 옆엔 내가 있어.",
];

// HTML 레퍼런스의 decideBranch 로직 1:1 이식
export function decideBranch(emo: Record<EmoKey, number>): {
  key: BranchKey;
  amount: number;
  positivity: number;
} {
  const positivity = emo.pos + emo.calm;
  const total = positivity + emo.ten + emo.sad + emo.emp + 0.001;
  const r = {
    pos: positivity / total,
    ten: emo.ten / total,
    sad: emo.sad / total,
    emp: emo.emp / total,
  };
  let key: BranchKey;
  if (r.emp > 0.38) key = "void";
  else if (r.sad > 0.34) key = "wither";
  else if (r.ten > 0.34) key = "tense";
  else if (r.pos > 0.5 && total > 55) key = "bloom";
  else key = "calm";
  return { key, amount: Math.min(1, total / 120), positivity: r.pos };
}
