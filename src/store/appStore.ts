// 친구/알림/퀘스트/출석/인벤토리/설정 목업 통합 store.
// 화면이 많으니 한 곳에서 관리. 실제 백엔드 없이 in-memory + 일부 영속화.
import { create } from "zustand";
import { todayStr, useUserStore } from "./userStore";

export interface Friend {
  id: string;
  name: string;
  planetColor: "green" | "purple" | "blue" | "amber" | "love" | "void";
  similarity: number; // 0~100
  code: string;
  lastEmotion: string;
}

export interface NotificationItem {
  id: string;
  type: "letter" | "attendance" | "friend" | "review";
  title: string;
  body: string;
  time: string; // 표시용
  unread: boolean;
}

export interface Quest {
  id: string;
  title: string;
  desc: string;
  reward: number;
  done: boolean;
}

export interface InventoryItem {
  id: string;
  name: string;
  emoji: string;
  category: "deco" | "weather" | "creature";
  owned: boolean;
  price: number;
}

interface Settings {
  notifPush: boolean;
  notifLetter: boolean;
  notifFriend: boolean;
  weekStart: "mon" | "sun";
  theme: "dark";
}

const FRIENDS: Friend[] = [
  { id: "f1", name: "소연", planetColor: "love", similarity: 78, code: "SOYEON-2210", lastEmotion: "차분" },
  { id: "f2", name: "지훈", planetColor: "blue", similarity: 64, code: "JIHUN-1099", lastEmotion: "긴장" },
  { id: "f3", name: "민서", planetColor: "amber", similarity: 52, code: "MINSEO-7341", lastEmotion: "기쁨" },
];

const NOTIFS: NotificationItem[] = [
  { id: "n1", type: "letter", title: "과거의 편지가 도착했어요", body: "3개월 전 오늘의 너에게.", time: "3분 전", unread: true },
  { id: "n2", type: "friend", title: "소연이 행성을 방문했어요", body: "감정 닮음 78%", time: "1시간 전", unread: true },
  { id: "n3", type: "attendance", title: "13일 연속 기록 중!", body: "내일도 함께해요 🌙", time: "오늘", unread: false },
  { id: "n4", type: "review", title: "이번 주 리뷰가 준비됐어요", body: "감정 풍경을 확인해보세요.", time: "어제", unread: false },
];

/** q2 달성 기준 — 사용자 발화 턴 수. MomoChat의 판정도 이 값을 쓴다. */
export const MOMO_QUEST_TURNS = 4;

const QUESTS: Quest[] = [
  { id: "q1", title: "오늘의 일기 작성", desc: "한 줄이라도 좋아요", reward: 4, done: false },
  { id: "q2", title: `모모와 ${MOMO_QUEST_TURNS}턴 대화하기`, desc: "마음을 풀어보세요", reward: 8, done: false },
  { id: "q3", title: "친구 행성 방문", desc: "감정 닮음 확인", reward: 6, done: false },
  { id: "q4", title: "컨디션 체크하기", desc: "수면과 마음 점수", reward: 5, done: false },
];

const INVENTORY: InventoryItem[] = [
  { id: "i1", name: "달 데코", emoji: "🌙", category: "deco", owned: false, price: 30 },
  { id: "i2", name: "별 스티커", emoji: "✨", category: "deco", owned: false, price: 20 },
  { id: "i3", name: "구름", emoji: "☁️", category: "weather", owned: false, price: 25 },
  { id: "i4", name: "번개", emoji: "⚡", category: "weather", owned: false, price: 45 },
  { id: "i5", name: "오로라", emoji: "🌈", category: "weather", owned: false, price: 80 },
  { id: "i6", name: "고래", emoji: "🐋", category: "creature", owned: false, price: 120 },
  { id: "i7", name: "여우", emoji: "🦊", category: "creature", owned: false, price: 60 },
  { id: "i8", name: "나무", emoji: "🌳", category: "deco", owned: false, price: 35 },
  { id: "i9", name: "꽃", emoji: "🌸", category: "deco", owned: false, price: 18 },
];

interface AppState {
  friends: Friend[];
  notifications: NotificationItem[];
  quests: Quest[];
  questsDate: string; // quests 완료 상태가 속한 로컬 날짜(YYYY-MM-DD)
  inventory: InventoryItem[];
  attendance: number[]; // 출석한 일자 인덱스 (0~13)
  condition: { score: number; sleep: number; tags: string[] };
  settings: Settings;
  markNotifsRead: () => void;
  toggleQuest: (id: string) => void;
  ensureQuestsForToday: () => void;
  completeQuest: (id: string) => void;
  buyItem: (id: string) => boolean;
  /** 레벨업 보상: 아직 없는 아이템 1종을 무료로 지급. 없으면 null. */
  grantLevelReward: () => InventoryItem | null;
  setCondition: (score: number, sleep: number, tags: string[]) => void;
  setSetting: <K extends keyof Settings>(k: K, v: Settings[K]) => void;
  addFriend: (code: string) => boolean;
}

const QUEST_KEY = "innerverse.quests";

// 퀘스트 완료 상태를 로컬 날짜와 함께 저장(하루 단위). 같은 날이면 새로고침해도 유지.
function loadQuests(base: Quest[]): { quests: Quest[]; questsDate: string } {
  const today = todayStr();
  if (typeof window === "undefined") return { quests: base, questsDate: today };
  try {
    const raw = window.localStorage.getItem(QUEST_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as { questsDate: string; done: Record<string, boolean> };
      if (saved.questsDate === today) {
        return { quests: base.map((q) => ({ ...q, done: !!saved.done?.[q.id] })), questsDate: today };
      }
    }
  } catch {
    /* ignore */
  }
  return { quests: base.map((q) => ({ ...q, done: false })), questsDate: today };
}

function saveQuests(quests: Quest[], questsDate: string) {
  if (typeof window === "undefined") return;
  try {
    const done: Record<string, boolean> = {};
    quests.forEach((q) => (done[q.id] = q.done));
    window.localStorage.setItem(QUEST_KEY, JSON.stringify({ questsDate, done }));
  } catch {
    /* ignore */
  }
}

const INIT_QUESTS = loadQuests(QUESTS);

export const useAppStore = create<AppState>((set, get) => ({
  friends: FRIENDS,
  notifications: NOTIFS,
  quests: INIT_QUESTS.quests,
  questsDate: INIT_QUESTS.questsDate,
  inventory: INVENTORY,
  attendance: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], // 13일 연속
  condition: { score: 72, sleep: 7, tags: ["피곤", "차분"] },
  settings: { notifPush: true, notifLetter: true, notifFriend: true, weekStart: "mon", theme: "dark" },
  markNotifsRead: () => set({ notifications: get().notifications.map((n) => ({ ...n, unread: false })) }),
  toggleQuest: (id) => {
    get().ensureQuestsForToday(); // 날짜가 바뀌었으면 먼저 리셋
    const quests = get().quests.map((q) => (q.id === id ? { ...q, done: !q.done } : q));
    set({ quests });
    saveQuests(quests, get().questsDate);
  },
  // 하루가 지나면(로컬 날짜 변경) 퀘스트 완료 상태를 0/4로 리셋. 같은 날이면 그대로 유지.
  ensureQuestsForToday: () => {
    if (get().questsDate === todayStr()) return;
    const today = todayStr();
    const quests = get().quests.map((q) => ({ ...q, done: false }));
    set({ quests, questsDate: today });
    saveQuests(quests, today);
  },
  // 시스템이 활동을 감지해 자동으로 퀘스트 완료 + 별조각 보상 (하루 1회, 중복 방지).
  completeQuest: (id) => {
    get().ensureQuestsForToday();
    const q = get().quests.find((x) => x.id === id);
    if (!q || q.done) return; // 없거나 이미 완료면 무시(중복 보상 방지)
    const quests = get().quests.map((x) => (x.id === id ? { ...x, done: true } : x));
    set({ quests });
    saveQuests(quests, get().questsDate);
    useUserStore.getState().earnMileage(q.reward);
  },
  // 별조각 잔액에서 실제로 차감한다. 잔액이 모자라면 구매 실패.
  buyItem: (id) => {
    const item = get().inventory.find((i) => i.id === id);
    if (!item || item.owned) return false;
    if (!useUserStore.getState().spendMileage(item.price)) return false;
    set({ inventory: get().inventory.map((i) => (i.id === id ? { ...i, owned: true } : i)) });
    return true;
  },
  grantLevelReward: () => {
    const locked = get().inventory.filter((i) => !i.owned);
    if (locked.length === 0) return null;
    const pick = locked[Math.floor(Math.random() * locked.length)];
    set({ inventory: get().inventory.map((i) => (i.id === pick.id ? { ...i, owned: true } : i)) });
    return { ...pick, owned: true };
  },
  setCondition: (score, sleep, tags) => {
    set({ condition: { score, sleep, tags } });
    get().completeQuest("q4"); // 컨디션 체크 -> 퀘스트 자동 달성
  },
  setSetting: (k, v) => set({ settings: { ...get().settings, [k]: v } }),
  addFriend: (code) => {
    if (!code.trim()) return false;
    const name = code.split(/[-_]/)[0]?.slice(0, 6) || "친구";
    const f: Friend = {
      id: `f${Date.now()}`,
      name,
      planetColor: "purple",
      similarity: Math.floor(40 + Math.random() * 50),
      code,
      lastEmotion: "차분",
    };
    set({ friends: [...get().friends, f] });
    return true;
  },
}));
