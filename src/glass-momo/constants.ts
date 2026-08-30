// INNERVERSE - 글래스 모모 + 감정 진화 상수
// 7분기 행성 정의: 기쁨→bloom / 차분→calm / 사랑→love / 슬픔→wither /
//                  분노→rage / 긴장→tense / 공허→void
// 감정 라벨(한글)은 diaryStore.EmotionLabel 이 단일 소스, 여기선 슬러그(Emo7)로 다룬다.
import type { EmotionLabel } from "@/store/diaryStore";

// 7감정 슬러그 (CSS 변수 --iv-emo-* 및 백엔드 schema.EMOTION_SLUG 와 1:1)
export type Emo7 = "joy" | "calm" | "love" | "sad" | "anger" | "tension" | "empty";
// 행성 분기 7종 (백엔드 schema.BRANCHES 와 1:1)
export type BranchKey = "bloom" | "calm" | "love" | "wither" | "rage" | "tense" | "void";

export const EMO7: Emo7[] = ["joy", "calm", "love", "sad", "anger", "tension", "empty"];

// 슬러그 ↔ 한글 라벨
export const LABEL_OF: Record<Emo7, EmotionLabel> = {
  joy: "기쁨",
  calm: "차분",
  love: "사랑",
  sad: "슬픔",
  anger: "분노",
  tension: "긴장",
  empty: "공허",
};
export const SLUG_OF: Record<EmotionLabel, Emo7> = {
  기쁨: "joy",
  차분: "calm",
  사랑: "love",
  슬픔: "sad",
  분노: "anger",
  긴장: "tension",
  공허: "empty",
};

// 감정 → 행성 분기 1:1 (백엔드 schema.EMOTION_TO_BRANCH 와 일치)
export const BRANCH_OF: Record<Emo7, BranchKey> = {
  joy: "bloom",
  calm: "calm",
  love: "love",
  sad: "wither",
  anger: "rage",
  tension: "tense",
  empty: "void",
};

export interface BranchDef {
  tint: number; // 유리 색
  soul: number; // 내부 영혼 코어 색
  nm: string; // 이름
  ds: string; // 설명
  lvl: string; // 레벨 배지 텍스트
}

export const BRANCH: Record<BranchKey, BranchDef> = {
  bloom: { tint: 0x5fc88a, soul: 0x7fe0a8, nm: "만개의 행성", ds: "기쁨이 가득 쌓여 숲이 피어났어요", lvl: "만개" },
  calm: { tint: 0x6f9ae8, soul: 0x9ec8ff, nm: "평온의 행성", ds: "잔잔한 마음이 결정처럼 빛나요", lvl: "평온" },
  love: { tint: 0xe87fb8, soul: 0xf7b0d4, nm: "애정의 행성", ds: "따뜻한 사랑이 번져 꽃빛으로 물들어요", lvl: "애정" },
  wither: { tint: 0x8a6f6a, soul: 0xb08a82, nm: "시듦의 행성", ds: "슬픔이 쌓여 메말라가고 있어요", lvl: "시듦" },
  rage: { tint: 0xe8744e, soul: 0xf0946a, nm: "분노의 행성", ds: "뜨거운 마음이 붉게 타올라요", lvl: "분노" },
  tense: { tint: 0xd99a4e, soul: 0xf0b46a, nm: "긴장의 행성", ds: "날카로운 마음이 가시로 돋았어요", lvl: "긴장" },
  void: { tint: 0x8a82a0, soul: 0xb0aac4, nm: "공허의 행성", ds: "비어있는 마음, 파편만 떠다녀요", lvl: "공허" },
};

// 감정 버튼 → 파티클 색 (2색 그라데이션). diaryStore.EMOTION_COLORS(7) 기반.
export const COL: Record<Emo7, [number, number]> = {
  joy: [0xe8c45f, 0xf5e0a0],
  calm: [0x5fc88a, 0xa7e8c2],
  love: [0xe87fb8, 0xf7b8d8],
  sad: [0x6f9ae8, 0xa9c8ff],
  anger: [0xe8744e, 0xf0a488],
  tension: [0xd99a4e, 0xf0c489],
  empty: [0x8a82a0, 0xb0aac4],
};

// 모모의 공감 대사 (7감정)
export const LINES: Record<Emo7, string> = {
  joy: "기뻤구나, 그 마음 오래 머물길 ✨",
  calm: "잔잔한 하루였구나 🌿",
  love: "따뜻한 마음이 번졌구나 🌸",
  sad: "많이 무거웠지. 내가 곁에 있어.",
  anger: "화가 났구나. 그럴 만했어.",
  tension: "긴장됐겠다. 그래도 잘 해냈어.",
  empty: "텅 빈 느낌… 그래도 괜찮아.",
};

export const TALK_LINES = [
  "오늘 하루도 잘 버텼네 🌙",
  "무슨 생각해? 들어줄게.",
  "천천히, 떠오르는 대로.",
  "네 옆엔 내가 있어.",
];

// 긍정군(서로 감쇠 안 함) — feed 시 같은 군끼리는 유지, 다른 군만 감쇠
export const POSITIVE: Emo7[] = ["joy", "calm", "love"];

// 지배 감정(argmax) → 행성 분기. amount 는 누적 강도(정규화).
export function decideBranch(emo: Record<Emo7, number>): {
  key: BranchKey;
  amount: number;
  positivity: number;
} {
  let total = 0;
  let topK: Emo7 = "calm";
  let topV = -1;
  for (const k of EMO7) {
    const v = Math.max(0, emo[k] || 0);
    total += v;
    if (v > topV) {
      topV = v;
      topK = k;
    }
  }
  const key: BranchKey = total <= 0 ? "calm" : BRANCH_OF[topK];
  const positive = (emo.joy || 0) + (emo.calm || 0) + (emo.love || 0);
  return { key, amount: Math.min(1, total / 120), positivity: total > 0 ? positive / total : 0 };
}
