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

export const BRANCH: Record<BranchKey, BranchDef> = {
  bloom: { tint: 0x5fc88a, soul: 0x7fe0a8, nm: "만개의 행성", ds: "긍정이 가득 쌓여 숲이 피어났어요", lvl: "만개" },
  calm: { tint: 0x6f9ae8, soul: 0x9ec8ff, nm: "평온의 행성", ds: "잔잔한 마음이 결정처럼 빛나요", lvl: "평온" },
  tense: { tint: 0xd99a4e, soul: 0xf0b46a, nm: "긴장의 행성", ds: "날카로운 마음이 가시로 돋았어요", lvl: "긴장" },
  wither: { tint: 0x8a6f6a, soul: 0xb08a82, nm: "시듦의 행성", ds: "슬픔이 쌓여 메말라가고 있어요", lvl: "시듦" },
  void: { tint: 0x8a82a0, soul: 0xb0aac4, nm: "공허의 행성", ds: "비어있는 마음, 파편만 떠다녀요", lvl: "공허" },
};

// 감정 버튼 → 파티클 색 (2색 그라데이션)
export const COL: Record<EmoKey, [number, number]> = {
  pos: [0x5fc88a, 0xa7e8c2],
  calm: [0x6f9ae8, 0xa9c8ff],
  ten: [0xd99a4e, 0xf0c489],
  sad: [0x6f9ae8, 0x4a6fa8],
  emp: [0x8a82a0, 0xb0aac4],
};

// 모모의 공감 대사
export const LINES: Record<EmoKey, string> = {
  pos: "기뻤구나, 그 마음 오래 머물길 ✨",
  calm: "잔잔한 하루였구나 🌿",
  ten: "긴장됐겠다. 그래도 잘 해냈어.",
  sad: "많이 무거웠지. 내가 곁에 있어.",
  emp: "텅 빈 느낌… 그래도 괜찮아.",
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
