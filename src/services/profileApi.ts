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
  last_check_in?: string | null; // 0015. YYYY-MM-DD
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
  last_check_in: string | null;
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
  // upsert 가 아니라 update. profiles 행은 가입 트리거(0003/0013)와 시드 RPC 가 항상
  // 만들어 두고, upsert 는 INSERT 검사가 먼저 돌아 nickname NOT NULL 에 걸려
  // (익명 유저는 email 도 없음) 매번 조용히 실패했다 — 출석·레벨이 DB 에 안 남던 원인.
  const { data, error } = await sb.from("profiles").update(p).eq("id", u.user.id).select("id");
  if (error) throw error;
  if (!data?.length) {
    // 행이 정말 없을 때만 생성 (nickname 필수)
    const { error: e2 } = await sb
      .from("profiles")
      .insert({ id: u.user.id, email: u.user.email, nickname: "이음", planet_name: "이음의 행성", ...p });
    if (e2) throw e2;
  }
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
