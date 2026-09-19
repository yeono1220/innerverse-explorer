// 익명(데모) 방문자의 첫 진입 시드 — supabase/migrations/0012_anon_demo_seed.sql 의 RPC 호출.
// RPC 는 익명 세션에만, 1회만 동작한다(실제 계정·재호출은 빈 배열). 삽입된 일기의
// 임베딩은 SQL 이 못 만드므로 여기서 /api/embed 로 채운다(백엔드 없으면 조용히 생략 →
// rag.ts 가 최근 일기로 폴백).
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { embed } from "@/lib/api";

interface SeededRow {
  entry_id: string;
  entry_body: string;
  entry_keywords: string[] | null;
}

// 부트스트랩이 세션 복원 + onAuthChange 로 두 번 들어와도 RPC 는 한 번만 나가게.
let inflight: Promise<boolean> | null = null;

/** 시드가 새로 들어갔으면 true. 이미 시드됐거나 실제 계정이면 false. */
export function seedDemoUniverseIfNeeded(): Promise<boolean> {
  if (!isSupabaseConfigured) return Promise.resolve(false);
  if (inflight) return inflight;
  inflight = (async () => {
    const sb = getSupabase();
    const { data, error } = await sb.rpc("seed_demo_universe");
    if (error) {
      // 0011 미적용/익명 로그인 꺼짐 등 — 앱은 빈 우주로 계속 동작한다.
      console.warn("[demoSeed] seed_demo_universe 실패:", error.message);
      return false;
    }
    const rows = (data as SeededRow[] | null) ?? [];
    if (!rows.length) return false;

    // RAG 임베딩은 비동기로 채운다. 실패해도 시드 자체는 유효.
    void Promise.all(
      rows.map((r) =>
        embed([r.entry_body, (r.entry_keywords ?? []).join(" ")].join(" "))
          .then((vec) => (vec ? sb.from("diary_entries").update({ embedding: vec }).eq("id", r.entry_id) : null))
          .catch(() => {}),
      ),
    );
    return true;
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}
