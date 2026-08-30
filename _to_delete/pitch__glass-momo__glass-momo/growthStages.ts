// 모모 7일 성장 단계 — 3D 캐릭터와 미리보기 화면이 공유하는 단일 진실.
// 색/사이즈/장식 모두 stage(1~7)로 결정. 시각 변화가 단계별로 누적됨.
import { create } from "zustand";
import { useUserStore } from "@/pitch/store/userStore";

export type GrowthStage = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface StageSpec {
  stage: GrowthStage;
  day: string;          // "DAY 1"
  name: string;         // "씨앗"
  caption: string;      // 한 줄 설명
  bodyScale: number;    // 본체 sphere 반경 배율 (기본 0.13)
  bodyEmissive: number; // 본체 발광 강도
  coreScale: number;    // 영혼 코어 배율 (기본 0.06)
  showEyes: boolean;    // 눈 표시 여부
  showCheeks: boolean;  // 뺨 홍조
  showArms: boolean;    // 팔 (작은 구체)
  showSprout: boolean;  // 머리 새싹
  showPetals: boolean;  // 꽃잎 머리띠 (4개)
  showHalo: boolean;    // 후광 토러스
  showCrown: boolean;   // 별 왕관 (3개)
  showCape: boolean;    // 망토 (콘)
  showAura: boolean;    // 바깥 오라 쉘
  auraSize: number;     // 오라 셸 배율 (>1)
  swatch: string;       // 미리보기 칩 색
}

export const STAGES: Record<GrowthStage, StageSpec> = {
  1: {
    stage: 1, day: "DAY 1", name: "씨앗",
    caption: "처음 마음이 깨어나는 순간",
    bodyScale: 0.55, bodyEmissive: 0.05, coreScale: 0.85,
    showEyes: false, showCheeks: false, showArms: false,
    showSprout: false, showPetals: false, showHalo: false,
    showCrown: false, showCape: false, showAura: false, auraSize: 1.0,
    swatch: "#7a6fd6",
  },
  2: {
    stage: 2, day: "DAY 2", name: "새싹",
    caption: "마음 위로 작은 떡잎이 올라와요",
    bodyScale: 0.7, bodyEmissive: 0.1, coreScale: 0.75,
    showEyes: true, showCheeks: false, showArms: false,
    showSprout: true, showPetals: false, showHalo: false,
    showCrown: false, showCape: false, showAura: false, auraSize: 1.0,
    swatch: "#8fd6a6",
  },
  3: {
    stage: 3, day: "DAY 3", name: "꽃봉오리",
    caption: "감정이 모여 부드러운 형태가 돼요",
    bodyScale: 0.85, bodyEmissive: 0.16, coreScale: 0.65,
    showEyes: true, showCheeks: true, showArms: true,
    showSprout: true, showPetals: false, showHalo: false,
    showCrown: false, showCape: false, showAura: false, auraSize: 1.0,
    swatch: "#e8a8c6",
  },
  4: {
    stage: 4, day: "DAY 4", name: "개화",
    caption: "꽃잎이 펼쳐지며 색이 진해져요",
    bodyScale: 0.95, bodyEmissive: 0.22, coreScale: 0.6,
    showEyes: true, showCheeks: true, showArms: true,
    showSprout: false, showPetals: true, showHalo: false,
    showCrown: false, showCape: false, showAura: false, auraSize: 1.0,
    swatch: "#f3b8d8",
  },
  5: {
    stage: 5, day: "DAY 5", name: "발광",
    caption: "마음 둘레로 첫 후광이 돌아요",
    bodyScale: 1.0, bodyEmissive: 0.32, coreScale: 0.6,
    showEyes: true, showCheeks: true, showArms: true,
    showSprout: false, showPetals: true, showHalo: true,
    showCrown: false, showCape: false, showAura: true, auraSize: 1.7,
    swatch: "#cdb8ff",
  },
  6: {
    stage: 6, day: "DAY 6", name: "별관(冠)",
    caption: "별 세 개가 머리 위에 깃들어요",
    bodyScale: 1.05, bodyEmissive: 0.4, coreScale: 0.58,
    showEyes: true, showCheeks: true, showArms: true,
    showSprout: false, showPetals: true, showHalo: true,
    showCrown: true, showCape: true, showAura: true, auraSize: 1.85,
    swatch: "#ffd58a",
  },
  7: {
    stage: 7, day: "DAY 7", name: "광휘",
    caption: "한 주를 다 쌓아낸 가장 빛나는 모모",
    bodyScale: 1.15, bodyEmissive: 0.55, coreScale: 0.55,
    showEyes: true, showCheeks: true, showArms: true,
    showSprout: false, showPetals: true, showHalo: true,
    showCrown: true, showCape: true, showAura: true, auraSize: 2.05,
    swatch: "#fff1a8",
  },
};

export const STAGE_LIST: StageSpec[] = [1, 2, 3, 4, 5, 6, 7].map(
  (n) => STAGES[n as GrowthStage],
);

// streak → 단계. 첫 주는 매일 1~7로 자라고, 그 이후로는 광휘 유지.
export function streakToStage(streak: number): GrowthStage {
  if (streak <= 0) return 1;
  return Math.min(7, streak) as GrowthStage;
}

// 미리보기 화면에서 "scrub" 가능한 오버라이드. null이면 streak 기반.
export interface GrowthPreviewState {
  preview: GrowthStage | null;
  setPreview: (s: GrowthStage | null) => void;
}

export const useGrowthPreview = create<GrowthPreviewState>((set) => ({
  preview: null,
  setPreview: (s) => set({ preview: s }),
}));

// 현재 화면에 표시할 단계 — preview가 있으면 그 값, 아니면 streak 기반.
export function useCurrentStage(): GrowthStage {
  const streak = useUserStore((s) => s.streak);
  const preview = useGrowthPreview((s) => s.preview);
  return preview ?? streakToStage(streak);
}
