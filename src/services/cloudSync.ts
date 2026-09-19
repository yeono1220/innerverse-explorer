// 계정 단위 클라우드 동기화 — 스토어 ↔ Supabase.
//
// 설계 원칙
//   · localStorage 는 "즉시/오프라인" 소스, DB 는 "계정/기기 간" 소스.
//   · 로그인 시엔 덮어쓰지 않고 병합한다. 비로그인으로 쌓은 것(행성·친구·아이템)이
//     로그인했다고 사라지면 안 되기 때문. 병합 규칙은 각 스토어의 hydrate* 에 있다.
//   · 이후의 변경은 스토어 구독으로 감지해 디바운스 후 upsert 한다.
//     (스토어는 Supabase 를 몰라도 되게 — 의존 방향을 여기 한 곳으로 모은다)
//   · 실패는 전부 조용히 삼킨다. 0014 마이그레이션 전이거나 네트워크가 끊겨도
//     앱은 localStorage 만으로 계속 동작해야 한다.
import {
  fetchAppState,
  fetchFriends,
  fetchNotifications,
  fetchPlanets,
  saveAppState,
  saveFriends,
  saveNotifications,
  savePlanets,
} from "./appStateApi";
import { fetchUserItems } from "./inventoryApi";
import { useAppStore } from "@/store/appStore";
import { useGalaxyStore } from "@/store/galaxyStore";
import { useUsageStore } from "@/store/usageStore";

/** 연타/렌더 폭주를 막는 공용 디바운스. 키별로 마지막 호출만 살아남는다. */
const timers = new Map<string, number>();
function debounce(key: string, fn: () => void, ms = 800) {
  const prev = timers.get(key);
  if (prev) window.clearTimeout(prev);
  timers.set(key, window.setTimeout(fn, ms));
}

const quiet = (p: Promise<unknown>) => void p.catch(() => undefined);

/** 로그인 직후 1회: DB → 스토어 병합. */
export async function hydrateFromCloud(): Promise<void> {
  const [state, planets, friends, notifs, items] = await Promise.all([
    fetchAppState().catch(() => null),
    fetchPlanets().catch(() => null),
    fetchFriends().catch(() => null),
    fetchNotifications().catch(() => null),
    fetchUserItems().catch(() => null),
  ]);

  const app = useAppStore.getState();

  if (items) app.hydrateInventory(items);

  if (friends?.length || notifs?.length) {
    app.hydrateApp({
      // 친구는 code 기준 합집합 (로컬에서 추가한 친구 보존)
      ...(friends?.length
        ? {
            friends: [
              ...friends,
              ...app.friends.filter((l) => !friends.some((d) => d.code === l.code)),
            ],
          }
        : {}),
      ...(notifs?.length ? { notifications: notifs } : {}),
    });
  }

  if (state) {
    // 위 hydrateApp 이후라 settings 스냅샷을 다시 읽는다.
    const cur = useAppStore.getState();
    cur.hydrateApp({
      ...(Array.isArray(state.attendance) && state.attendance.length
        ? { attendance: state.attendance }
        : {}),
      ...(state.condition_state && typeof state.condition_state.score === "number"
        ? {
            condition: {
              score: state.condition_state.score,
              sleep: state.condition_state.sleep ?? 7,
              tags: state.condition_state.tags ?? [],
            },
          }
        : {}),
      ...(state.settings && Object.keys(state.settings).length
        ? { settings: { ...cur.settings, ...state.settings } }
        : {}),
    });

    if (state.quests_date) cur.hydrateQuests(state.quests_date, state.quests_done ?? {});

    useUsageStore.getState().hydrate({
      day: state.usage_day,
      chatTurns: state.chat_turns ?? 0,
      week: state.usage_week,
      diaryCount: state.diary_count ?? 0,
    });
  }

  useGalaxyStore.getState().hydrate(planets ?? [], state?.galaxy_consumed ?? []);

  // 병합 결과를 곧바로 DB에 되밀어, 로컬에만 있던 것들이 서버에도 남게 한다.
  pushAppState();
  pushCollections();
}

/** user_app_state 한 행으로 모을 수 있는 상태 전부를 upsert. */
function pushAppState() {
  const a = useAppStore.getState();
  const u = useUsageStore.getState();
  const g = useGalaxyStore.getState();
  const done: Record<string, boolean> = {};
  a.quests.forEach((q) => (done[q.id] = q.done));
  quiet(
    saveAppState({
      quests_date: a.questsDate,
      quests_done: done,
      usage_day: u.day,
      chat_turns: u.chatTurns,
      usage_week: u.week,
      diary_count: u.diaryCount,
      attendance: a.attendance,
      condition_state: a.condition,
      settings: a.settings as unknown as Record<string, unknown>,
      galaxy_consumed: g.consumedIds,
    }),
  );
}

function pushCollections() {
  const a = useAppStore.getState();
  quiet(saveFriends(a.friends));
  quiet(saveNotifications(a.notifications));
  quiet(savePlanets(useGalaxyStore.getState().planets));
}

/**
 * 스토어 변경 → DB 반영 구독 시작. 반환값을 호출하면 구독 해제(로그아웃).
 * 아이템 구매(user_items)는 구매 시점에 appStore 가 직접 1건씩 기록하므로 여기서 제외.
 */
export function watchCloudSync(): () => void {
  const unsubs: Array<() => void> = [];

  unsubs.push(
    useAppStore.subscribe((s, prev) => {
      if (
        s.quests !== prev.quests ||
        s.questsDate !== prev.questsDate ||
        s.attendance !== prev.attendance ||
        s.condition !== prev.condition ||
        s.settings !== prev.settings
      ) {
        debounce("app-state", pushAppState);
      }
      if (s.friends !== prev.friends) debounce("friends", () => quiet(saveFriends(s.friends)));
      if (s.notifications !== prev.notifications) {
        debounce("notifs", () => quiet(saveNotifications(s.notifications)));
      }
    }),
  );

  unsubs.push(
    useUsageStore.subscribe((s, prev) => {
      if (s.chatTurns !== prev.chatTurns || s.diaryCount !== prev.diaryCount || s.day !== prev.day || s.week !== prev.week) {
        debounce("app-state", pushAppState);
      }
    }),
  );

  unsubs.push(
    useGalaxyStore.subscribe((s, prev) => {
      if (s.planets !== prev.planets) debounce("planets", () => quiet(savePlanets(s.planets)));
      if (s.consumedIds !== prev.consumedIds) debounce("app-state", pushAppState);
    }),
  );

  return () => {
    timers.forEach((t) => window.clearTimeout(t));
    timers.clear();
    unsubs.forEach((u) => u());
  };
}
