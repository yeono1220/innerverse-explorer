// 앱 상태 서비스 (Supabase ↔ appStore / usageStore / galaxyStore)
//
// 모든 함수는 "Supabase 미설정이거나 비로그인"이면 조용히 no-op / null 을 돌려준다.
// 덕분에 목업·데모 모드에서는 기존처럼 localStorage 만으로 동작한다.
import { maybeSupabase } from "@/lib/supabase";
import type { Friend, NotificationItem } from "@/store/appStore";
import type { EmotionPlanet } from "@/store/galaxyStore";

/** 현재 로그인 사용자 id. 없으면 null. */
async function uid(): Promise<string | null> {
  const sb = maybeSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getUser();
  return data.user?.id ?? null;
}

// ── 단일 행 상태 (user_app_state) ────────────────────────────
export interface AppStateRow {
  quests_date: string | null;
  quests_done: Record<string, boolean>;
  usage_day: string | null;
  chat_turns: number;
  usage_week: string | null;
  diary_count: number;
  attendance: number[];
  condition_state: { score?: number; sleep?: number; tags?: string[] };
  settings: Record<string, unknown>;
  galaxy_consumed: string[];
}

export async function fetchAppState(): Promise<AppStateRow | null> {
  const sb = maybeSupabase();
  const id = await uid();
  if (!sb || !id) return null;
  const { data, error } = await sb
    .from("user_app_state")
    .select("*")
    .eq("user_id", id)
    .maybeSingle();
  if (error || !data) return null; // 0014 미적용이면 테이블이 없다 — 로컬 유지
  return data as AppStateRow;
}

/** 부분 갱신. 넘긴 컬럼만 덮어쓴다. */
export async function saveAppState(patch: Partial<AppStateRow>): Promise<void> {
  const sb = maybeSupabase();
  const id = await uid();
  if (!sb || !id) return;
  await sb
    .from("user_app_state")
    .upsert({ user_id: id, ...patch, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
}

// ── 감정 행성 (galaxy_planets) ───────────────────────────────
export async function fetchPlanets(): Promise<EmotionPlanet[] | null> {
  const sb = maybeSupabase();
  const id = await uid();
  if (!sb || !id) return null;
  const { data, error } = await sb
    .from("galaxy_planets")
    .select("*")
    .eq("user_id", id)
    .order("created_at", { ascending: true });
  if (error || !data) return null;
  return (data as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id),
    createdAt: String(r.created_at ?? new Date().toISOString()),
    startDate: String(r.start_date ?? ""),
    endDate: String(r.end_date ?? ""),
    dominant: r.dominant,
    color: r.color,
    breakdown: (r.breakdown ?? []) as EmotionPlanet["breakdown"],
    keywords: (r.keywords ?? []) as string[],
    summary: String(r.summary ?? ""),
    entries: (r.entries ?? []) as EmotionPlanet["entries"],
  })) as EmotionPlanet[];
}

export async function savePlanets(planets: EmotionPlanet[]): Promise<void> {
  const sb = maybeSupabase();
  const id = await uid();
  if (!sb || !id || planets.length === 0) return;
  await sb.from("galaxy_planets").upsert(
    planets.map((p) => ({
      user_id: id,
      id: p.id,
      created_at: p.createdAt,
      start_date: p.startDate,
      end_date: p.endDate,
      dominant: p.dominant,
      color: p.color,
      breakdown: p.breakdown,
      keywords: p.keywords,
      summary: p.summary,
      entries: p.entries,
    })),
    { onConflict: "user_id,id" },
  );
}

// ── 친구 (user_friends) ──────────────────────────────────────
export async function fetchFriends(): Promise<Friend[] | null> {
  const sb = maybeSupabase();
  const id = await uid();
  if (!sb || !id) return null;
  const { data, error } = await sb
    .from("user_friends")
    .select("*")
    .eq("user_id", id)
    .order("created_at", { ascending: true });
  if (error || !data) return null;
  return (data as Array<Record<string, unknown>>).map((r) => ({
    code: String(r.code),
    name: String(r.name ?? ""),
    planetColor: (r.planet_color ?? "purple") as Friend["planetColor"],
    similarity: Number(r.similarity ?? 0),
    lastEmotion: String(r.last_emotion ?? ""),
  }));
}

export async function saveFriends(friends: Friend[]): Promise<void> {
  const sb = maybeSupabase();
  const id = await uid();
  if (!sb || !id || friends.length === 0) return;
  await sb.from("user_friends").upsert(
    friends.map((f) => ({
      user_id: id,
      code: f.code,
      name: f.name,
      planet_color: f.planetColor,
      similarity: f.similarity,
      last_emotion: f.lastEmotion,
    })),
    { onConflict: "user_id,code" },
  );
}

// ── 알림 (user_notifications) ────────────────────────────────
export async function fetchNotifications(): Promise<NotificationItem[] | null> {
  const sb = maybeSupabase();
  const id = await uid();
  if (!sb || !id) return null;
  const { data, error } = await sb
    .from("user_notifications")
    .select("*")
    .eq("user_id", id)
    .order("created_at", { ascending: false });
  if (error || !data) return null;
  return (data as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id),
    type: (r.type ?? "review") as NotificationItem["type"],
    title: String(r.title ?? ""),
    body: String(r.body ?? ""),
    time: String(r.time_label ?? ""),
    unread: !!r.unread,
  }));
}

export async function saveNotifications(items: NotificationItem[]): Promise<void> {
  const sb = maybeSupabase();
  const id = await uid();
  if (!sb || !id || items.length === 0) return;
  await sb.from("user_notifications").upsert(
    items.map((n) => ({
      user_id: id,
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      time_label: n.time,
      unread: n.unread,
    })),
    { onConflict: "user_id,id" },
  );
}
