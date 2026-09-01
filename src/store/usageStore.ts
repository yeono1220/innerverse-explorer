// 무료 플랜 사용량 집계 (모모챗 턴 / 주간 일기 수).
// 날짜·주가 바뀌면 자동 리셋되고 localStorage에 영속된다.
import { create } from "zustand";
import { todayStr, weekKey, useUserStore } from "./userStore";
import { limitsFor, isUnlimited } from "@/lib/plan";

const KEY = "innerverse.usage";

interface Persisted {
  day: string;      // 채팅 카운터가 속한 로컬 날짜
  chatTurns: number;
  week: string;     // 일기 카운터가 속한 주(월요일 시작)
  diaryCount: number;
}

interface UsageState extends Persisted {
  /** 날짜/주가 바뀌었으면 카운터 리셋 */
  ensureFresh: () => void;
  /** 모모챗 한 턴을 더 쓸 수 있는지 */
  canChat: () => boolean;
  /** 오늘 남은 채팅 턴 (무제한이면 Infinity) */
  chatLeft: () => number;
  /** 채팅 한 턴 소모. 한도 초과면 false */
  consumeChatTurn: () => boolean;
  canWriteDiary: () => boolean;
  diaryLeft: () => number;
  consumeDiary: () => boolean;
  reset: () => void;
}

function load(): Persisted {
  const def: Persisted = { day: todayStr(), chatTurns: 0, week: weekKey(), diaryCount: 0 };
  if (typeof window === "undefined") return def;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return def;
    const p = { ...def, ...(JSON.parse(raw) as Partial<Persisted>) };
    if (p.day !== def.day) { p.day = def.day; p.chatTurns = 0; }
    if (p.week !== def.week) { p.week = def.week; p.diaryCount = 0; }
    return p;
  } catch {
    return def;
  }
}

function save(s: Persisted) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

function limits() {
  return limitsFor(useUserStore.getState().plan);
}

export const useUsageStore = create<UsageState>((set, get) => ({
  ...load(),
  ensureFresh: () => {
    const day = todayStr();
    const week = weekKey();
    const s = get();
    if (s.day === day && s.week === week) return;
    const next = {
      day,
      week,
      chatTurns: s.day === day ? s.chatTurns : 0,
      diaryCount: s.week === week ? s.diaryCount : 0,
    };
    set(next);
    save(next);
  },
  canChat: () => {
    get().ensureFresh();
    return get().chatTurns < limits().chatTurnsPerDay;
  },
  chatLeft: () => {
    get().ensureFresh();
    const max = limits().chatTurnsPerDay;
    return isUnlimited(max) ? Infinity : Math.max(0, max - get().chatTurns);
  },
  consumeChatTurn: () => {
    if (!get().canChat()) return false;
    const s = get();
    const next = { ...s, chatTurns: s.chatTurns + 1 };
    set({ chatTurns: next.chatTurns });
    save({ day: next.day, chatTurns: next.chatTurns, week: next.week, diaryCount: next.diaryCount });
    return true;
  },
  canWriteDiary: () => {
    get().ensureFresh();
    return get().diaryCount < limits().diaryPerWeek;
  },
  diaryLeft: () => {
    get().ensureFresh();
    const max = limits().diaryPerWeek;
    return isUnlimited(max) ? Infinity : Math.max(0, max - get().diaryCount);
  },
  consumeDiary: () => {
    if (!get().canWriteDiary()) return false;
    const s = get();
    const next = { ...s, diaryCount: s.diaryCount + 1 };
    set({ diaryCount: next.diaryCount });
    save({ day: next.day, chatTurns: next.chatTurns, week: next.week, diaryCount: next.diaryCount });
    return true;
  },
  reset: () => {
    const next: Persisted = { day: todayStr(), chatTurns: 0, week: weekKey(), diaryCount: 0 };
    set(next);
    save(next);
  },
}));
