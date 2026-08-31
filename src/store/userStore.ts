// 사용자/아바타 상태 (목업). 첫 진입 시 localStorage에서 복원.
import { create } from "zustand";

export type PlanetColor = "green" | "purple" | "blue" | "amber" | "love" | "void";

export const PLANET_COLORS: Record<PlanetColor, { hi: string; mid: string; lo: string; glow: string; label: string }> = {
  green: { hi: "#b8f0d0", mid: "#5fc88a", lo: "#1e6c3e", glow: "rgba(95,200,138,.55)", label: "초록빛" },
  purple: { hi: "#cdb8ff", mid: "#8b7ff0", lo: "#3a2d6e", glow: "rgba(139,127,240,.55)", label: "보랏빛" },
  blue: { hi: "#a9c8ff", mid: "#6f9ae8", lo: "#27406b", glow: "rgba(111,154,232,.55)", label: "푸른빛" },
  amber: { hi: "#f0c489", mid: "#d99a4e", lo: "#5e3b14", glow: "rgba(217,154,78,.55)", label: "호박빛" },
  love: { hi: "#f3a5cc", mid: "#e87fb8", lo: "#65274a", glow: "rgba(232,127,184,.55)", label: "분홍빛" },
  void: { hi: "#b0aac4", mid: "#8a82a0", lo: "#33304a", glow: "rgba(138,130,160,.45)", label: "잿빛" },
};

interface UserState {
  loggedIn: boolean;
  name: string;
  email: string;
  level: number;
  streak: number;
  stardust: number;
  planetColor: PlanetColor;
  planetName: string;
  planetCode: string;
  lastCheckIn: string | null; // 마지막 출석 보상 수령 날짜 (YYYY-MM-DD, 로컬)
  login: (name: string, email: string) => void;
  logout: () => void;
  setProfile: (name: string, color: PlanetColor) => void;
  setPlanetName: (name: string) => void;
  earnStardust: (n: number) => void;
  claimDailyReward: () => boolean; // 하루 1회만 수령(연속/리셋 관리); 이미 받았으면 false
  hydrate: (p: Partial<Persisted>) => void;
}

const STORAGE_KEY = "innerverse.user";

// 로컬 기준 오늘 날짜 (YYYY-MM-DD). UTC 변환으로 인한 날짜 밀림 방지.
export function todayStr(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

// 14일 출석 보상 테이블 (연속 1~14일차). 화면과 store가 공유하는 단일 출처.
export const REWARDS = [3, 3, 5, 5, 8, 8, 10, 10, 12, 12, 15, 15, 20, 30];

// 두 YYYY-MM-DD(로컬) 날짜 사이의 정수 일수 차이. UTC 자정 기준이라 DST 영향 없음.
export function dayDiff(fromStr: string, toStr: string): number {
  const [fy, fm, fd] = fromStr.split("-").map(Number);
  const [ty, tm, td] = toStr.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000);
}

interface Persisted {
  loggedIn: boolean;
  name: string;
  email: string;
  level: number;
  streak: number;
  stardust: number;
  planetColor: PlanetColor;
  planetName: string;
  planetCode: string;
  lastCheckIn: string | null;
}

function load(): Persisted {
  const def: Persisted = {
    loggedIn: false,
    name: "이음",
    email: "",
    level: 7,
    streak: 23,
    stardust: 132,
    planetColor: "green",
    planetName: "이음의 행성",
    planetCode: "IEUM-3847",
    lastCheckIn: null,
  };
  if (typeof window === "undefined") return def;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return def;
    const merged = { ...def, ...JSON.parse(raw) };
    // 마이그레이션: 과거 버전 버그로 lastCheckIn은 있는데 streak이 0인 불일치 →
    // 오늘 다시 첫 출석할 수 있도록 lastCheckIn 초기화.
    if (merged.lastCheckIn && merged.streak < 1) merged.lastCheckIn = null;
    return merged;
  } catch {
    return def;
  }
}

function save(s: Persisted) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export const useUserStore = create<UserState>((set, get) => {
  const init = load();
  const persist = () => {
    const s = get();
    save({
      loggedIn: s.loggedIn,
      name: s.name,
      email: s.email,
      level: s.level,
      streak: s.streak,
      stardust: s.stardust,
      planetColor: s.planetColor,
      planetName: s.planetName,
      planetCode: s.planetCode,
      lastCheckIn: s.lastCheckIn,
    });
  };
  return {
    ...init,
    login: (name, email) => {
      set({ loggedIn: true, name: name || init.name, email });
      persist();
    },
    logout: () => {
      set({ loggedIn: false });
      persist();
    },
    setProfile: (name, color) => {
      set({ name, planetColor: color, planetName: `${name}의 행성` });
      persist();
    },
    setPlanetName: (n) => {
      set({ planetName: n });
      persist();
    },
    earnStardust: (n) => {
      set({ stardust: get().stardust + n });
      persist();
    },
    // 하루 1회 출석 보상 + 연속(스트릭) 관리.
    // - 오늘 이미 받았으면 false.
    // - 어제 출석했으면 스트릭 +1 (14 넘으면 새 주기 1일차로 순환).
    // - 하루라도 걸렀거나 첫 출석이면 오늘을 "1일차"로 리셋.
    claimDailyReward: () => {
      const today = todayStr();
      const s = get();
      if (s.lastCheckIn === today) return false; // 오늘은 이미 수령함
      const gap = s.lastCheckIn ? dayDiff(s.lastCheckIn, today) : Infinity;
      const continues = gap === 1 && s.streak >= 1; // 어제 출석 → 연속 유지
      const nextStreak = continues ? (s.streak >= 14 ? 1 : s.streak + 1) : 1;
      const reward = REWARDS[Math.min(nextStreak - 1, REWARDS.length - 1)] ?? 5;
      set({ streak: nextStreak, lastCheckIn: today, stardust: s.stardust + reward });
      persist();
      return true;
    },
    // Supabase 세션/프로필에서 받아온 값으로 채움 (로그인 복원)
    hydrate: (p) => {
      set({ ...p });
      persist();
    },
  };
});
