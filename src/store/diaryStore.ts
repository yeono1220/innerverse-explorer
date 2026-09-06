// 일기 상태 + write/save 액션.
// 로그인 모드에서는 반드시 "내 계정의 DB 일기"만 담는다(초기값 빈 배열).
// 목업 데이터는 Supabase 미설정(데모/피치) 모드에서만 씨앗으로 쓴다.
import { create } from "zustand";
import { useAppStore } from "./appStore";
import { isSupabaseConfigured } from "@/lib/supabase";

export type EmotionLabel = "기쁨" | "차분" | "사랑" | "슬픔" | "분노" | "긴장" | "공허";

export const EMOTION_COLORS: Record<EmotionLabel, string> = {
  기쁨: "#e8c45f",
  차분: "#5fc88a",
  사랑: "#e87fb8",
  슬픔: "#6f9ae8",
  분노: "#e8744e",
  긴장: "#d99a4e",
  공허: "#8a82a0",
};

export interface DiaryEntry {
  id: string;
  date: string; // ISO
  preview: string;
  body: string;
  audioSec: number; // 0 if none
  emotions: Array<{ label: EmotionLabel; pct: number }>;
  keywords: string[];
  primary: EmotionLabel;
}

const today = new Date();
function dayOffset(n: number): string {
  const d = new Date(today);
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

/** 데모(Supabase 미설정) 전용 예시 일기. 로그인 모드에서는 절대 쓰이지 않는다. */
const DEMO_ENTRIES: DiaryEntry[] = [
  {
    id: "d1",
    date: dayOffset(0),
    preview: "오랜만에 푹 잤더니 머리가 맑아진 느낌. 점심에 좋아하는 카페에 들렀다.",
    body: "오랜만에 푹 잤더니 머리가 맑아진 느낌. 점심에 좋아하는 카페에 들렀고, 라떼 한 잔에 하루 종일 떠다니던 생각들이 잠시 가라앉았다. 작은 것에 감사하기로 했다.",
    audioSec: 52,
    emotions: [
      { label: "차분", pct: 48 },
      { label: "기쁨", pct: 32 },
      { label: "사랑", pct: 12 },
      { label: "긴장", pct: 8 },
    ],
    keywords: ["카페", "라떼", "감사", "휴식"],
    primary: "차분",
  },
  {
    id: "d2",
    date: dayOffset(1),
    preview: "회의가 길어졌고, 결과는 좋았는데 몸이 무거웠다.",
    body: "회의가 길어졌고, 결과는 좋았는데 몸이 무거웠다. 누군가에게 잘 보이려고 너무 힘준 것 같다. 다음 번엔 좀 더 편하게 가자.",
    audioSec: 0,
    emotions: [
      { label: "긴장", pct: 42 },
      { label: "기쁨", pct: 28 },
      { label: "차분", pct: 18 },
      { label: "슬픔", pct: 12 },
    ],
    keywords: ["회의", "성과", "피로", "긴장"],
    primary: "긴장",
  },
  {
    id: "d3",
    date: dayOffset(2),
    preview: "친구한테 오랜만에 연락이 왔다. 별 거 아닌 안부였는데 따뜻했다.",
    body: "친구한테 오랜만에 연락이 왔다. 별 거 아닌 안부였는데 따뜻했다. 사람이 사람을 구한다는 말이 무슨 뜻인지 조금 알 것 같았다.",
    audioSec: 28,
    emotions: [
      { label: "사랑", pct: 44 },
      { label: "차분", pct: 36 },
      { label: "기쁨", pct: 14 },
      { label: "슬픔", pct: 6 },
    ],
    keywords: ["친구", "연락", "안부", "따뜻함"],
    primary: "사랑",
  },
  {
    id: "d4",
    date: dayOffset(4),
    preview: "비가 왔다. 우산을 안 가져갔는데 그게 그렇게 슬프지 않았다.",
    body: "비가 왔다. 우산을 안 가져갔는데 그게 그렇게 슬프지 않았다. 그냥 천천히 걸었다.",
    audioSec: 0,
    emotions: [
      { label: "차분", pct: 52 },
      { label: "슬픔", pct: 28 },
      { label: "공허", pct: 12 },
      { label: "기쁨", pct: 8 },
    ],
    keywords: ["비", "산책", "느림"],
    primary: "차분",
  },
  {
    id: "d5",
    date: dayOffset(6),
    preview: "아무 일도 일어나지 않은 하루.",
    body: "아무 일도 일어나지 않은 하루. 그게 이상하게 무서웠다.",
    audioSec: 12,
    emotions: [
      { label: "공허", pct: 56 },
      { label: "슬픔", pct: 22 },
      { label: "차분", pct: 16 },
      { label: "긴장", pct: 6 },
    ],
    keywords: ["공허", "정적"],
    primary: "공허",
  },
];

interface DiaryState {
  entries: DiaryEntry[];
  add: (entry: Omit<DiaryEntry, "id">) => DiaryEntry;
  /**
   * 기존 일기 수정. 본문을 고치면 재분석한 emotions/keywords/primary를 함께 넘긴다.
   * 작성일(date)과 id는 유지되고, 퀘스트 보상은 다시 지급되지 않는다.
   * (일기 삭제는 의도적으로 제공하지 않는다)
   */
  update: (id: string, patch: Partial<Omit<DiaryEntry, "id" | "date">>) => DiaryEntry | undefined;
  byId: (id: string) => DiaryEntry | undefined;
  setEntries: (entries: DiaryEntry[]) => void;
  loadFromDb: () => Promise<void>;
  /** 로그아웃/계정 전환 시 화면에 남은 이전 사용자 일기를 비운다. */
  reset: () => void;
}

export const useDiaryStore = create<DiaryState>((set, get) => ({
  // 로그인 모드: 빈 배열에서 시작해 loadFromDb() 로 내 일기만 채운다.
  entries: isSupabaseConfigured ? [] : DEMO_ENTRIES,
  add: (e) => {
    const entry: DiaryEntry = { ...e, id: `d${Date.now()}` };
    set({ entries: [entry, ...get().entries] });
    useAppStore.getState().completeQuest("q1"); // 일기 작성 -> 퀘스트 자동 달성
    return entry;
  },
  update: (id, patch) => {
    const cur = get().entries.find((e) => e.id === id);
    if (!cur) return undefined;
    const next: DiaryEntry = { ...cur, ...patch };
    set({ entries: get().entries.map((e) => (e.id === id ? next : e)) });
    return next;
  },
  byId: (id) => get().entries.find((e) => e.id === id),
  setEntries: (entries) => set({ entries }),
  // 로그인 시 DB에서 "내" 일기 불러오기.
  // 0건이어도 그대로 반영해야 한다 — 예전엔 rows.length 가 0이면 건너뛰어서
  // 신규 계정이 앞 사용자/목업 일기를 그대로 물려받는 버그가 있었다.
  loadFromDb: async () => {
    if (!isSupabaseConfigured) return;
    try {
      const { listDiaryEntries } = await import("@/services/diaryApi");
      set({ entries: await listDiaryEntries() });
    } catch {
      // 조회 실패 시에도 남의 일기가 보이면 안 되므로 비운다.
      set({ entries: [] });
    }
  },
  reset: () => set({ entries: isSupabaseConfigured ? [] : DEMO_ENTRIES }),
}));

// 주간 요약 헬퍼
export function weekSummary(entries: DiaryEntry[]) {
  const totals: Record<EmotionLabel, number> = {
    기쁨: 0, 차분: 0, 사랑: 0, 슬픔: 0, 분노: 0, 긴장: 0, 공허: 0,
  };
  entries.forEach((e) => e.emotions.forEach((x) => (totals[x.label] += x.pct)));
  const sorted = (Object.entries(totals) as Array<[EmotionLabel, number]>)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);
  return sorted.map(([k, v]) => ({ label: k, pct: Math.round((v / (sorted.reduce((s, x) => s + x[1], 0) || 1)) * 100) }));
}
