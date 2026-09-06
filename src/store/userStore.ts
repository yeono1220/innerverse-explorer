// 사용자/아바타 상태. 첫 진입 시 localStorage에서 복원.
import { create } from "zustand";
import { invest, levelProgress, redeemDiscount, START_LEVEL, type LevelProgress } from "@/lib/level";
import type { Plan } from "@/lib/plan";

export type PlanetColor = "green" | "purple" | "blue" | "amber" | "love" | "void";

/** 획득한 별조각을 어디에 적립할지. 유저가 둘 중 하나를 고른다. */
export type MileageUse = "level" | "discount";

export const PLANET_COLORS: Record<PlanetColor, { hi: string; mid: string; lo: string; glow: string; label: string }> = {
  green: { hi: "#b8f0d0", mid: "#5fc88a", lo: "#1e6c3e", glow: "rgba(95,200,138,.55)", label: "초록빛" },
  purple: { hi: "#cdb8ff", mid: "#8b7ff0", lo: "#3a2d6e", glow: "rgba(139,127,240,.55)", label: "보랏빛" },
  blue: { hi: "#a9c8ff", mid: "#6f9ae8", lo: "#27406b", glow: "rgba(111,154,232,.55)", label: "푸른빛" },
  amber: { hi: "#f0c489", mid: "#d99a4e", lo: "#5e3b14", glow: "rgba(217,154,78,.55)", label: "호박빛" },
  love: { hi: "#f3a5cc", mid: "#e87fb8", lo: "#65274a", glow: "rgba(232,127,184,.55)", label: "분홍빛" },
  void: { hi: "#b0aac4", mid: "#8a82a0", lo: "#33304a", glow: "rgba(138,130,160,.45)", label: "잿빛" },
};

interface UserState extends Persisted {
  /** 레벨업 직후 축하 화면으로 보내기 위한 신호(비영속). 소비 후 clearLevelUp(). */
  pendingLevelUp: number | null;
  login: (name: string, email: string) => void;
  logout: () => void;
  /** 기기에 남은 프로필/성장 상태를 기본값으로 되돌린다(계정 전환·탈퇴용). */
  reset: () => void;
  setProfile: (name: string, color: PlanetColor) => void;
  setPlanetName: (name: string) => void;
  /** 퀘스트·출석 보상 지급. 선택한 사용처(mileageUse)에 따라 자동 적립. 오른 레벨 수 반환. */
  earnMileage: (n: number) => number;
  /** 구버전 별칭. 내부적으로 earnMileage와 동일. */
  earnStardust: (n: number) => void;
  /** 잔액에서 직접 성장에 투자. 오른 레벨 수 반환. */
  investMileage: (n: number) => number;
  /** 별조각 → 구독 할인 적립금 교환. 실제 소모된 별조각 반환. */
  redeemMileage: (n: number) => number;
  /** 인벤토리 구매 등 잔액 소모. 잔액이 모자라면 false. */
  spendMileage: (n: number) => boolean;
  setMileageUse: (use: MileageUse) => void;
  setPlan: (plan: Plan) => void;
  clearLevelUp: () => void;
  claimDailyReward: () => boolean; // 하루 1회만 수령(연속/리셋 관리); 이미 받았으면 false
  hydrate: (p: Partial<Persisted>) => void;
  /** 홈 스탯바용 진행도 */
  progress: () => LevelProgress;
}

const STORAGE_KEY = "innerverse.user";

// 로컬 기준 오늘 날짜 (YYYY-MM-DD). UTC 변환으로 인한 날짜 밀림 방지.
export function todayStr(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** 로컬 기준 주 식별자(월요일 시작). 무료 플랜의 주간 한도/보관 기준. */
export function weekKey(dateStr: string = todayStr()): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = (dt.getUTCDay() + 6) % 7; // 월=0
  dt.setUTCDate(dt.getUTCDate() - dow);
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${mm}-${dd}`;
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
  /** 현재 레벨 구간에 투자된 별조각 */
  levelExp: number;
  streak: number;
  /** 별조각 잔액. 성장 투자·할인 교환·아이템 구매에 쓰인다. */
  stardust: number;
  /** 누적 획득 별조각 (통계용, 감소하지 않음) */
  mileageEarned: number;
  /** 획득 별조각 자동 적립처 */
  mileageUse: MileageUse;
  /** 교환해 둔 구독 할인 적립금(원) */
  discountWon: number;
  plan: Plan;
  planetColor: PlanetColor;
  planetName: string;
  planetCode: string;
  lastCheckIn: string | null;
}

export function generatePlanetCode(prefix = "IEUM") {
  const safePrefix = String(prefix ?? "IEUM")
    .trim()
    .replace(/[^A-Za-z0-9가-힣]/g, "")
    .slice(0, 12);

  const digits = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
  const normalized = safePrefix || "IEUM";
  return `${normalized.toUpperCase()}-${digits}`;
}

export const DEFAULT_USER: Persisted = {
  loggedIn: false,
  name: "IEUM",
  email: "",
  level: START_LEVEL,
  levelExp: 0,
  streak: 0,
  stardust: 0,
  mileageEarned: 0,
  mileageUse: "level",
  discountWon: 0,
  plan: "free",
  planetColor: "green",
  planetName: "이음의 행성",
  planetCode: generatePlanetCode("IEUM"),
  lastCheckIn: null,
};

/** 저장 스키마 버전. 목업 초기값(Lv.7/별조각 132)으로 저장된 옛 데이터를 1회 초기화한다. */
const SCHEMA_VERSION = 2;

function load(): Persisted {
  const def = { ...DEFAULT_USER };
  if (typeof window === "undefined") return def;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return def;
    const parsed = JSON.parse(raw) as Partial<Persisted> & { _v?: number };
    // v1(목업 레벨 7 고정) 데이터는 성장 기록이 없으므로 Lv.0부터 다시 시작.
    if ((parsed._v ?? 1) < SCHEMA_VERSION) {
      return { ...def, name: parsed.name ?? def.name, email: parsed.email ?? def.email, loggedIn: !!parsed.loggedIn, planetColor: parsed.planetColor ?? def.planetColor, planetName: parsed.planetName ?? def.planetName, planetCode: parsed.planetCode ?? def.planetCode };
    }
    const merged = { ...def, ...parsed };
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
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...s, _v: SCHEMA_VERSION }));
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
      levelExp: s.levelExp,
      streak: s.streak,
      stardust: s.stardust,
      mileageEarned: s.mileageEarned,
      mileageUse: s.mileageUse,
      discountWon: s.discountWon,
      plan: s.plan,
      planetColor: s.planetColor,
      planetName: s.planetName,
      planetCode: s.planetCode,
      lastCheckIn: s.lastCheckIn,
    });
  };

  // 잔액에서 n만큼 성장에 투자하고 레벨업 신호를 세팅. 오른 레벨 수 반환.
  const investNow = (n: number): number => {
    const s = get();
    const r = invest(s.level, s.levelExp, s.stardust, n);
    set({ level: r.level, levelExp: r.exp, stardust: r.balance });
    if (r.levelsGained > 0) set({ pendingLevelUp: r.level });
    persist();
    return r.levelsGained;
  };

  return {
    ...init,
    pendingLevelUp: null,
    login: (name, email) => {
      set({ loggedIn: true, name: name || init.name, email });
      persist();
    },
    logout: () => {
      set({ loggedIn: false });
      persist();
    },
    // 로그아웃과 달리 "이 기기에 남은 이전 사용자 흔적"까지 전부 지운다.
    reset: () => {
      if (typeof window !== "undefined") {
        try {
          window.localStorage.removeItem(STORAGE_KEY);
        } catch {
          /* ignore */
        }
      }
      set({ ...DEFAULT_USER, pendingLevelUp: null });
    },
    setProfile: (name, color) => {
      set({ name, planetColor: color, planetName: `${name}의 행성` });
      persist();
    },
    setPlanetName: (n) => {
      set({ planetName: n });
      persist();
    },
    earnMileage: (n) => {
      if (n <= 0) return 0;
      set({ stardust: get().stardust + n, mileageEarned: get().mileageEarned + n });
      persist();
      // "레벨업"을 고른 경우에만 즉시 성장에 투자. "할인"이면 잔액으로 모아둔다.
      return get().mileageUse === "level" ? investNow(n) : 0;
    },
    earnStardust: (n) => {
      get().earnMileage(n);
    },
    investMileage: (n) => investNow(n),
    redeemMileage: (n) => {
      const s = get();
      const r = redeemDiscount(s.stardust, s.discountWon, n);
      if (r.spent <= 0) return 0;
      set({ stardust: r.balance, discountWon: r.discountWon });
      persist();
      return r.spent;
    },
    spendMileage: (n) => {
      const s = get();
      if (n <= 0 || s.stardust < n) return false;
      set({ stardust: s.stardust - n });
      persist();
      return true;
    },
    setMileageUse: (use) => {
      set({ mileageUse: use });
      persist();
      // 레벨업으로 바꾸면 모아둔 잔액을 바로 성장에 반영.
      if (use === "level" && get().stardust > 0) investNow(get().stardust);
    },
    setPlan: (plan) => {
      set({ plan });
      persist();
    },
    clearLevelUp: () => set({ pendingLevelUp: null }),
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
      set({ streak: nextStreak, lastCheckIn: today });
      persist();
      get().earnMileage(reward);
      return true;
    },
    // Supabase 세션/프로필에서 받아온 값으로 채움 (로그인 복원)
    hydrate: (p) => {
      set({ ...p });
      persist();
    },
    progress: () => levelProgress(get().level, get().levelExp),
  };
});
