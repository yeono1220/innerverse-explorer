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
  claimDailyReward: (amount: number) => boolean; // 하루 1회만 수령; 이미 받았으면 false
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
    return { ...def, ...JSON.parse(raw) };
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
    // 하루 1회 출석 보상. 오늘 이미 받았으면 아무것도 안 하고 false 반환.
    claimDailyReward: (amount) => {
      const today = todayStr();
      if (get().lastCheckIn === today) return false;
      set({ stardust: get().stardust + amount, lastCheckIn: today });
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
