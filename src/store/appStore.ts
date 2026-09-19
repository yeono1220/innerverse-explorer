// 친구/알림/퀘스트/출석/인벤토리/설정 목업 통합 store.
// 화면이 많으니 한 곳에서 관리. 실제 백엔드 없이 in-memory + 일부 영속화.
import { create } from "zustand";
import { todayStr, useUserStore } from "./userStore";
import {
  normalizePlacement,
  randomPlacement,
  type ItemPlacement,
} from "@/planet-items/placement";
import { saveUserItem } from "@/services/inventoryApi";

export interface Friend {
  // id: string;
  // id 대신 code를 고유 식별자로 사용. 친구 추가 시 코드로 검색.
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
  { /*id: "f1",*/ name: "SOYEON", planetColor: "love", similarity: 78, code: "SOYEON-2210", lastEmotion: "차분" },
  { /*id: "f2",*/ name: "JIHUN", planetColor: "blue", similarity: 64, code: "JIHUN-1099", lastEmotion: "긴장" },
  { /*id: "f3",*/ name: "MINSEO", planetColor: "amber", similarity: 52, code: "MINSEO-7341", lastEmotion: "기쁨" },
];

const NOTIFS: NotificationItem[] = [
  { id: "n1", type: "letter", title: "과거의 편지가 도착했어요", body: "1주 전 오늘의 너에게.", time: "3분 전", unread: true },
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
  /** 구매/획득한 아이템이 행성 표면 어디에 놓였는지. 홈·글래스 행성이 함께 읽는다. */
  placements: ItemPlacement[];
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
  /** DB(user_items)에서 받아온 보유 목록으로 덮어쓴다. 로그인 복원용. */
  hydrateInventory: (placements: ItemPlacement[]) => void;
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

const INVENTORY_KEY = "innerverse.inventory";

// 보유 아이템과 설치 위치를 이 브라우저에 저장한다.
// (로그인 상태면 DB에도 남지만, 비로그인/목업 모드에서도 구매가 유지되도록)
function loadInventory(base: InventoryItem[]): {
  inventory: InventoryItem[];
  placements: ItemPlacement[];
} {
  if (typeof window === "undefined") return { inventory: base, placements: [] };
  try {
    const raw = window.localStorage.getItem(INVENTORY_KEY);
    if (!raw) return { inventory: base, placements: [] };
    const saved = JSON.parse(raw) as { placements?: unknown[] };
    const placements = (saved.placements ?? [])
      .map(normalizePlacement)
      .filter((p): p is ItemPlacement => !!p)
      // 카탈로그에 없는 옛 아이템 id는 버린다.
      .filter((p) => base.some((i) => i.id === p.itemId));
    const owned = new Set(placements.map((p) => p.itemId));
    return {
      inventory: base.map((i) => ({ ...i, owned: owned.has(i.id) })),
      placements,
    };
  } catch {
    return { inventory: base, placements: [] };
  }
}

function saveInventory(placements: ItemPlacement[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(INVENTORY_KEY, JSON.stringify({ placements }));
  } catch {
    /* ignore */
  }
}

const INIT_QUESTS = loadQuests(QUESTS);
const INIT_INVENTORY = loadInventory(INVENTORY);

/**
 * 아이템 1종을 보유 상태로 만들고 행성 표면 위 자리를 정한다.
 * 구매(buyItem)와 레벨업 보상(grantLevelReward)이 공유하는 단일 경로.
 */
function acquire(
  set: (partial: Partial<AppState>) => void,
  get: () => AppState,
  id: string,
) {
  if (get().placements.some((p) => p.itemId === id)) return;
  const placement = randomPlacement(id, get().placements);
  const placements = [...get().placements, placement];
  set({
    inventory: get().inventory.map((i) => (i.id === id ? { ...i, owned: true } : i)),
    placements,
  });
  saveInventory(placements);
  // 로그인 + Supabase 연결 상태에서만 실제로 기록된다(내부에서 가드).
  void saveUserItem(placement).catch(() => undefined);
}

export const useAppStore = create<AppState>((set, get) => ({
  friends: FRIENDS,
  notifications: NOTIFS,
  quests: INIT_QUESTS.quests,
  questsDate: INIT_QUESTS.questsDate,
  inventory: INIT_INVENTORY.inventory,
  placements: INIT_INVENTORY.placements,
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
  // 성공하면 그 자리에서 행성 위 랜덤 위치가 정해지고, 로컬(+로그인 시 DB)에 남는다.
  buyItem: (id) => {
    const item = get().inventory.find((i) => i.id === id);
    if (!item || item.owned) return false;
    if (!useUserStore.getState().spendMileage(item.price)) return false;
    acquire(set, get, id);
    return true;
  },
  grantLevelReward: () => {
    const locked = get().inventory.filter((i) => !i.owned);
    if (locked.length === 0) return null;
    const pick = locked[Math.floor(Math.random() * locked.length)];
    acquire(set, get, pick.id); // 보상도 구매와 똑같이 행성에 설치된다
    return { ...pick, owned: true };
  },
  // DB가 단일 출처. 로컬에만 있던 항목이 사라지지 않도록 합집합으로 합친다.
  hydrateInventory: (placements) => {
    const merged = [...placements];
    get().placements.forEach((local) => {
      if (!merged.some((p) => p.itemId === local.itemId)) merged.push(local);
    });
    const owned = new Set(merged.map((p) => p.itemId));
    set({
      placements: merged,
      inventory: get().inventory.map((i) => ({ ...i, owned: owned.has(i.id) })),
    });
    saveInventory(merged);
    // 로컬에만 있던 것들은 이번 기회에 DB로 밀어 올린다.
    merged
      .filter((p) => !placements.some((d) => d.itemId === p.itemId))
      .forEach((p) => void saveUserItem(p).catch(() => undefined));
  },
  setCondition: (score, sleep, tags) => {
    set({ condition: { score, sleep, tags } });
    get().completeQuest("q4"); // 컨디션 체크 -> 퀘스트 자동 달성
  },
  setSetting: (k, v) => set({ settings: { ...get().settings, [k]: v } }),
  addFriend: (code) => {
    const normalizedCode = code.trim().toUpperCase();
    if (!normalizedCode) return false;
    if (get().friends.some((friend) => friend.code.trim().toUpperCase() === normalizedCode)) return false;
    const name = normalizedCode.split(/[-_]/)[0]?.slice(0, 6) || "친구";
    const f: Friend = {
      // id: `f${Date.now()}`,
      name,
      planetColor: "purple",
      similarity: Math.floor(40 + Math.random() * 50),
      code: normalizedCode,
      lastEmotion: "차분",
    };
    set({ friends: [...get().friends, f] });
    return true;
  },
}));
