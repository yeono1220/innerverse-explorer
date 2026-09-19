// 인벤토리 서비스 (Supabase user_items ↔ appStore)
// Supabase 미설정이거나 비로그인이면 전부 no-op — 목업/로컬 모드가 그대로 동작한다.
import { maybeSupabase } from "@/lib/supabase";
import type { ItemPlacement } from "@/planet-items/placement";

interface UserItemRow {
  item_id: string;
  lat: number | null;
  lon: number | null;
  seed: number | null;
}

/** 내 보유 아이템 + 설치 위치. 미설정/비로그인/테이블 없음 → null. */
export async function fetchUserItems(): Promise<ItemPlacement[] | null> {
  const sb = maybeSupabase();
  if (!sb) return null;
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return null;
  const { data, error } = await sb
    .from("user_items")
    .select("item_id, lat, lon, seed")
    .eq("user_id", u.user.id)
    .order("created_at", { ascending: true });
  if (error) return null; // 0013 마이그레이션 전이면 테이블이 없다 — 로컬 상태 유지
  return (data as UserItemRow[]).map((r) => ({
    itemId: r.item_id,
    lat: r.lat ?? 0,
    lon: r.lon ?? 0,
    seed: r.seed ?? 0.5,
  }));
}

/** 구매 1건 저장. 실패해도 구매 자체는 로컬에서 이미 성립한다(조용히 무시). */
export async function saveUserItem(p: ItemPlacement): Promise<void> {
  const sb = maybeSupabase();
  if (!sb) return;
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return;
  await sb.from("user_items").upsert(
    {
      user_id: u.user.id,
      item_id: p.itemId,
      lat: p.lat,
      lon: p.lon,
      seed: p.seed,
    },
    { onConflict: "user_id,item_id" },
  );
}
