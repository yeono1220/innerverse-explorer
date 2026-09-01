// 프로필 서비스 (Supabase profiles ↔ userStore)
import { getSupabase } from "@/lib/supabase";
import type { MileageUse, PlanetColor } from "@/store/userStore";
import type { Plan } from "@/lib/plan";

export interface ProfileRow {
  id: string;
  email: string | null;
  nickname: string | null;
  planet_color: PlanetColor;
  planet_name: string | null;
  level: number;
  streak: number;
  stardust: number;
  // 0009 마이그레이션 이후에만 존재. 미적용 DB에서는 undefined로 들어온다.
  level_exp?: number | null;
  mileage_earned?: number | null;
  discount_won?: number | null;
  mileage_use?: MileageUse | null;
  plan?: Plan | null;
}

/** 성장/별조각 상태를 DB에 반영 (로그인 상태에서만). */
export interface ProgressPatch {
  level: number;
  level_exp: number;
  streak: number;
  stardust: number;
  mileage_earned: number;
  discount_won: number;
  mileage_use: MileageUse;
  plan: Plan;
}

export async function saveProgress(p: ProgressPatch): Promise<void> {
  const sb = getSupabase();
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return;
  const { error } = await sb
    .from("profiles")
    .upsert({ id: u.user.id, email: u.user.email, ...p }, { onConflict: "id" });
  if (error) throw error;
}

export async function getProfile(): Promise<ProfileRow | null> {
  const sb = getSupabase();
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return null;
  const { data, error } = await sb.from("profiles").select("*").eq("id", u.user.id).maybeSingle();
  if (error) throw error;
  return (data as ProfileRow) ?? null;
}

/** 닉네임/행성색 등 프로필 갱신 (없으면 생성). */
export async function saveProfile(p: {
  nickname?: string;
  planet_color?: PlanetColor;
  planet_name?: string;
}): Promise<void> {
  const sb = getSupabase();
  const { data: u } = await sb.auth.getUser();
  if (!u.user) throw new Error("로그인이 필요합니다.");
  const { error } = await sb
    .from("profiles")
    .upsert({ id: u.user.id, email: u.user.email, ...p }, { onConflict: "id" });
  if (error) throw error;
}
