// Supabase 클라이언트 (lazy + env 가드)
// VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 없으면 앱은 정상 부팅(목업 모드), 쓸 때만 에러.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const env = (import.meta as unknown as { env?: Record<string, string> }).env ?? {};
const URL = env.VITE_SUPABASE_URL ?? "";
const ANON = env.VITE_SUPABASE_ANON_KEY ?? "";

export const isSupabaseConfigured = Boolean(URL && ANON);

console.log("Supabase configured:", isSupabaseConfigured, "URL:", URL, "ANON:", ANON);

let _client: SupabaseClient | null = null;

export function maybeSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (!_client) _client = createClient(URL, ANON);
  return _client;
}

export function getSupabase(): SupabaseClient {
  const c = maybeSupabase();
  if (!c) throw new Error("Supabase 미설정: .env 에 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 를 채워주세요.");
  return c;
}
