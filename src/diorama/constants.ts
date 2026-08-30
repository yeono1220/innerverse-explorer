// 디오라마 — 행성 톤 프리셋 + 감정→구조물 매핑 (7감정)
import { SLUG_OF, type Emo7 } from "@/glass-momo/constants";
import type { EmotionLabel } from "@/store/diaryStore";

export interface PlanetTone {
  hi: string;
  mid: string;
  lo: string;
  glow: string;
  label: string;
}

export type ToneKey = "cosmic" | "dawn" | "forest" | "ocean" | "amber" | "void";

export const TONE_PRESETS: Record<ToneKey, PlanetTone> = {
  cosmic: { hi: "#cdb8ff", mid: "#8b7ff0", lo: "#3a2d6e", glow: "rgba(139,127,240,.6)", label: "코스믹" },
  dawn: { hi: "#ffd0b0", mid: "#e87a5d", lo: "#6b2540", glow: "rgba(232,122,93,.55)", label: "새벽" },
  forest: { hi: "#cdf0c0", mid: "#5fc88a", lo: "#1e4a36", glow: "rgba(95,200,138,.55)", label: "숲" },
  ocean: { hi: "#a9c8ff", mid: "#6f9ae8", lo: "#27406b", glow: "rgba(111,154,232,.55)", label: "바다" },
  amber: { hi: "#f0c489", mid: "#d99a4e", lo: "#5e3b14", glow: "rgba(217,154,78,.6)", label: "호박" },
  void: { hi: "#b0aac4", mid: "#6a6480", lo: "#1a172a", glow: "rgba(106,100,128,.45)", label: "잿빛" },
};

// 일기 감정 → 행성 위 구조물 1종 매핑.
// 사용자가 일기를 쓸 때마다 행성 어딘가에 작은 건축물이 자라남.
export type StructureType =
  | "flowerTree"   // 기쁨 — 줄기+잎+꽃 한 송이
  | "stoneStack"   // 차분 — 3단 돌탑
  | "heartBloom"   // 사랑 — 분홍 하트꽃잎 꽃송이
  | "gravestone"   // 슬픔 — 둥근 비석
  | "emberSpike"   // 분노 — 크게 터지는 폭죽
  | "clockTower"   // 긴장 — 시계탑
  | "emptyCage";   // 공허 — 빈 새장

export const EMOTION_TO_STRUCTURE: Record<Emo7, StructureType> = {
  joy: "flowerTree",
  calm: "stoneStack",
  love: "heartBloom",
  sad: "gravestone",
  anger: "emberSpike",
  tension: "clockTower",
  empty: "emptyCage",
};

// diaryStore의 한글 감정 라벨 → 감정 슬러그(Emo7). 구조물 선택 등에 사용.
export function emotionLabelToKey(label: string): Emo7 {
  return SLUG_OF[label as EmotionLabel] ?? "calm";
}

export const PLANET_RADIUS = 1.6;
