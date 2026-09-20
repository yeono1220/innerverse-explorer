// RAG 검색 — 현재 입력과 의미적으로 가까운 내 과거 일기 top-K를 가져와
// 모모 답장의 컨텍스트로 쓴다. (PPT 아키텍처 ②장기기억 검색)
// 키 있으면 pgvector 의미검색, 없으면 최근 일기로 폴백 → 데모는 키 상태 무관하게 동작.
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { embed } from "@/lib/api";
import { listDiaryEntries } from "@/services/diaryApi";

interface MatchRow {
  body: string | null;
  primary_label: string | null;
  date: string | null;
  similarity: number;
}

/** 프롬프트에 넣는 본문 발췌 길이. 3편 × 이 길이 ≈ 300토큰 내외. */
const EXCERPT = 140;
function excerpt(body: string | null | undefined): string {
  const t = (body ?? "").replace(/\s+/g, " ").trim();
  return t.length > EXCERPT ? t.slice(0, EXCERPT) + "…" : t;
}

export interface MemoryHit {
  snippet: string; // 프롬프트 주입용
  preview: string; // 화면 표시용
}

export async function ragContext(text: string, k = 3): Promise<MemoryHit[]> {
  if (!isSupabaseConfigured) return [];

  // 1) 의미검색 (pgvector)
  try {
    const vec = await embed(text);
    if (vec) {
      const { data } = await getSupabase().rpc("match_diaries", { query_embedding: vec, match_count: k });
      const rows = (data as MatchRow[] | null) ?? [];
      if (rows.length) {
        // 모델에 날짜·감정 + 본문 발췌를 함께 준다. 포인터만 주면 "지난주 그 일 어떻게 됐어?"에
        // 답하지 못한다(데모 핵심). 발췌 길이는 EXCERPT 로 제한.
        return rows.map((r) => ({
          snippet: `[${r.date ?? ""} · ${r.primary_label ?? ""}] ${excerpt(r.body)}`,
          preview: `${r.date ?? ""} · ${r.primary_label ?? ""}`,
        }));
      }
    }
  } catch {
    /* 폴백으로 */
  }

  // 2) 폴백 — 최근 일기 k개 (키/임베딩 없을 때)
  try {
    const recent = await listDiaryEntries();
    return recent.slice(0, k).map((d) => ({
      snippet: `[${d.date} · ${d.primary}] ${excerpt(d.body)}`,
      preview: `${d.date} · ${d.primary}`,
    }));
  } catch {
    return [];
  }
}
