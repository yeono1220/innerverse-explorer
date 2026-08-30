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
        // 과거 raw 차단: 모델엔 원문 대신 '날짜·감정' 포인터만. 과거 내용은 요약(③④)으로만 참조.
        return rows.map((r) => ({
          snippet: `${r.date ?? ""}에 '${r.primary_label ?? ""}' 감정의 기록이 있었어`,
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
      // 과거 raw 차단: 원문 미포함(날짜·감정 포인터만)
      snippet: `${d.date}에 '${d.primary}' 감정의 기록이 있었어`,
      preview: `${d.date} · ${d.primary}`,
    }));
  } catch {
    return [];
  }
}
