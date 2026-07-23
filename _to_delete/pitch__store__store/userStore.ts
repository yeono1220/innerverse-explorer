// 유저 상태 store — 연속 출석(streak) 등. 모모 성장 단계의 입력값.
import { create } from "zustand";

interface UserState {
  streak: number;
  setStreak: (n: number) => void;
  incStreak: () => void;
  resetStreak: () => void;
}

export const useUserStore = create<UserState>((set, get) => ({
  // 데모 기본값: 한 주를 다 채운 상태(광휘). 랜딩 미리보기에서 자유롭게 scrub 가능.
  streak: 7,
  setStreak: (n) => set({ streak: Math.max(0, Math.floor(n)) }),
  incStreak: () => set({ streak: get().streak + 1 }),
  resetStreak: () => set({ streak: 0 }),
}));
