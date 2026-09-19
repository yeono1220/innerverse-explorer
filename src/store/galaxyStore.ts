// 감정 행성(선택 생성) store — /galaxy 에 표시.
//
// 규칙
//   · 일기(미소비분)가 7개 모이면 /diary 에서 팝업을 띄우고, '예'를 고를 때만
//     그 7개를 요약한 "감정 행성" 1개를 만든다. 자동 생성은 하지 않는다.
//   · 행성 색은 그 7일 중 '가장 강한 감정'의 색.
//   · 행성은 생성 시점의 요약/스냅샷을 자체적으로 담는다 → 원본 일기가 사라져도
//     (데모 모드는 새로고침 시 일기가 리셋됨) 행성 상세는 그대로 볼 수 있다.
//
// 영속화: localStorage("innerverse.galaxy"). 'innerverse.' 접두사라
//   계정전환/로그아웃 시 clearLocalUserData()가 함께 정리한다.
import { create } from "zustand";
import type { DiaryEntry, EmotionLabel } from "./diaryStore";
import type { PlanetColor } from "./userStore";

/** 며칠치 일기가 모이면 행성 하나를 만들지 (배치 단위) */
export const PLANET_BATCH = 7;

export interface EmotionPlanet {
  id: string;
  createdAt: string; // ISO (행성 생성 시각)
  startDate: string; // YYYY-MM-DD (7개 중 가장 이른 날)
  endDate: string; // YYYY-MM-DD (가장 늦은 날)
  dominant: EmotionLabel; // 가장 강한 감정
  color: PlanetColor; // dominant 로부터 정해진 행성 색
  breakdown: Array<{ label: EmotionLabel; pct: number }>; // 감정 비중(합 100 근사)
  keywords: string[]; // 상위 키워드
  summary: string; // 한 줄 요약
  entries: Array<{ id: string; date: string; preview: string; primary: EmotionLabel }>; // 7개 스냅샷
}

const EMOTION_TO_PLANET: Record<EmotionLabel, PlanetColor> = {
  기쁨: "amber",
  차분: "green",
  사랑: "love",
  슬픔: "blue",
  분노: "amber",
  긴장: "amber",
  공허: "void",
};

export function emotionToPlanetColor(e: EmotionLabel): PlanetColor {
  return EMOTION_TO_PLANET[e] ?? "purple";
}

/** "YYYY-MM-DD" → "M월 D일" */
export function fmtShort(d: string): string {
  const dt = new Date(`${d}T00:00:00`);
  return `${dt.getMonth() + 1}월 ${dt.getDate()}일`;
}

const emptyTotals = (): Record<EmotionLabel, number> => ({
  기쁨: 0, 차분: 0, 사랑: 0, 슬픔: 0, 분노: 0, 긴장: 0, 공허: 0,
});

/** 7개 일기 → 행성 요약(id/createdAt 제외). '가장 강한 감정'과 색을 계산한다. */
export function summarizeEntries(seven: DiaryEntry[]): Omit<EmotionPlanet, "id" | "createdAt"> {
  const totals = emptyTotals();
  seven.forEach((e) => {
    if (e.emotions?.length) e.emotions.forEach((x) => (totals[x.label] += x.pct));
    else totals[e.primary] += 100; // emotions 비면 primary로 대체
  });
  const sum = Object.values(totals).reduce((a, b) => a + b, 0) || 1;
  const breakdown = (Object.entries(totals) as Array<[EmotionLabel, number]>)
    .filter(([, v]) => v > 0)
    .map(([label, v]) => ({ label, pct: Math.round((v / sum) * 100) }))
    .sort((a, b) => b.pct - a.pct);
  const dominant = breakdown[0]?.label ?? seven[0]?.primary ?? "차분";

  const kw = new Map<string, number>();
  seven.forEach((e) => e.keywords?.forEach((k) => kw.set(k, (kw.get(k) ?? 0) + 1)));
  const keywords = [...kw.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k]) => k);

  const dates = seven.map((e) => e.date).filter(Boolean).sort();
  const startDate = dates[0] ?? "";
  const endDate = dates[dates.length - 1] ?? "";

  const kwLine = keywords.length ? ` ${keywords.slice(0, 3).map((k) => `#${k}`).join(" ")}` : "";
  const summary = `${fmtShort(startDate)}~${fmtShort(endDate)}, 주로 '${dominant}'한 결의 7일이었어요.${kwLine}`;

  const entries = seven
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map((e) => ({ id: e.id, date: e.date, preview: e.preview, primary: e.primary }));

  return { startDate, endDate, dominant, color: emotionToPlanetColor(dominant), breakdown, keywords, summary, entries };
}

// ── localStorage 영속화 ──
const LS_KEY = "innerverse.galaxy";
interface Persisted {
  planets: EmotionPlanet[];
  consumedIds: string[];
}

function load(): Persisted {
  if (typeof window === "undefined") return { planets: [], consumedIds: [] };
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Persisted;
      return {
        planets: Array.isArray(p.planets) ? p.planets : [],
        consumedIds: Array.isArray(p.consumedIds) ? p.consumedIds : [],
      };
    }
  } catch {
    /* ignore */
  }
  return { planets: [], consumedIds: [] };
}
function save(planets: EmotionPlanet[], consumedIds: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify({ planets, consumedIds }));
  } catch {
    /* ignore */
  }
}

interface GalaxyState {
  planets: EmotionPlanet[];
  /** 이미 행성으로 소비된 일기 id (다음 7개 카운트에서 제외) */
  consumedIds: string[];
  /** 마지막으로 '나중에'를 누른 시점의 미소비 개수 (세션 한정 — 재알림 억제용) */
  dismissedAt: number | null;
  /** 7개 일기로 행성 1개 생성 → 그 7개를 소비 처리 */
  addPlanet: (seven: DiaryEntry[]) => EmotionPlanet;
  dismiss: (count: number) => void;
  /** DB에서 받아온 행성/소비 일기로 복원. 로컬에만 있던 것은 살려서 합집합. */
  hydrate: (planets: EmotionPlanet[], consumedIds: string[]) => void;
  reset: () => void;
}

const INIT = load();

export const useGalaxyStore = create<GalaxyState>((set, get) => ({
  planets: INIT.planets,
  consumedIds: INIT.consumedIds,
  dismissedAt: null,
  addPlanet: (seven) => {
    const planet: EmotionPlanet = {
      ...summarizeEntries(seven),
      id: `pl${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    const planets = [...get().planets, planet];
    const consumedIds = [...get().consumedIds, ...seven.map((e) => e.id)];
    set({ planets, consumedIds, dismissedAt: null }); // 새 행성 후엔 재알림 허용
    save(planets, consumedIds);
    return planet;
  },
  dismiss: (count) => set({ dismissedAt: count }),
  hydrate: (planets, consumedIds) => {
    // 행성은 id 기준 합집합 — 오프라인에서 만든 행성이 사라지면 안 된다.
    const merged = [...planets];
    get().planets.forEach((local) => {
      if (!merged.some((x) => x.id === local.id)) merged.push(local);
    });
    merged.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
    // 소비된 일기 id도 합집합 — 한쪽에서만 소비됐다고 다시 세면 중복 행성이 생긴다.
    const consumed = [...new Set([...consumedIds, ...get().consumedIds])];
    set({ planets: merged, consumedIds: consumed });
    save(merged, consumed);
  },
  reset: () => {
    set({ planets: [], consumedIds: [], dismissedAt: null });
    save([], []);
  },
}));
