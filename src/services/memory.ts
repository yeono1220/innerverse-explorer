// 장기 기억 (PPT 4계층 ③사실·④성향 + 관계) — Supabase에 누적/갱신.
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { reflect as reflectApi } from "@/lib/api";
import { listDiaryEntries } from "@/services/diaryApi";

export interface FactRow {
  id: string;
  kind: string;
  key: string;
  value: string;
}
export interface RelationRow {
  id: string;
  name: string;
  relation: string;
  sentiment: string;
}
export interface Memory {
  factSummary: string;
  personaSummary: string;
  facts: FactRow[];
  relations: RelationRow[];
}

export async function getMemory(): Promise<Memory | null> {
  if (!isSupabaseConfigured) return null;
  const sb = getSupabase();
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return null;
  const [prof, facts, rels] = await Promise.all([
    sb.from("profiles").select("fact_summary,persona_summary").eq("id", u.user.id).maybeSingle(),
    sb.from("user_facts").select("id,kind,key,value").eq("user_id", u.user.id).order("updated_at", { ascending: false }),
    sb.from("relations").select("id,name,relation,sentiment").eq("user_id", u.user.id).order("last_mentioned", { ascending: false }),
  ]);
  return {
    factSummary: prof.data?.fact_summary ?? "",
    personaSummary: prof.data?.persona_summary ?? "",
    facts: (facts.data as FactRow[]) ?? [],
    relations: (rels.data as RelationRow[]) ?? [],
  };
}

/** 모모 프롬프트에 넣을 압축 프로필 한 줄. */
export function memoryPromptBlock(m: Memory | null): string {
  if (!m) return "";
  const parts: string[] = [];
  if (m.factSummary) parts.push(m.factSummary);
  if (m.personaSummary) parts.push(m.personaSummary);
  if (m.facts.length) parts.push("사실: " + m.facts.slice(0, 8).map((f) => `${f.key}=${f.value}`).join(", "));
  if (m.relations.length) parts.push("관계: " + m.relations.slice(0, 6).map((r) => `${r.name}(${r.relation})`).join(", "));
  return parts.join(" / ");
}

/** 최근 일기로 사실/성향/관계를 추출해 누적 갱신 (일기 저장 후 비동기 호출). */
export async function reflect(): Promise<void> {
  if (!isSupabaseConfigured) return;
  const sb = getSupabase();
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return;
  const uid = u.user.id;

  const recent = await listDiaryEntries();
  if (!recent.length) return;
  const cur = await getMemory();

  const r = await reflectApi({
    diaries: recent.slice(0, 10).map((d) => d.body),
    fact_summary: cur?.factSummary,
    persona_summary: cur?.personaSummary,
  });

  await sb.from("profiles").update({ fact_summary: r.fact_summary, persona_summary: r.persona_summary }).eq("id", uid);

  if (r.facts?.length) {
    await sb.from("user_facts").upsert(
      r.facts.map((f) => ({ user_id: uid, kind: f.kind, key: f.key, value: f.value, updated_at: new Date().toISOString() })),
      { onConflict: "user_id,key" },
    );
  }
  if (r.relations?.length) {
    await sb.from("relations").upsert(
      r.relations.map((x) => ({ user_id: uid, name: x.name, relation: x.relation, sentiment: x.sentiment, last_mentioned: new Date().toISOString() })),
      { onConflict: "user_id,name" },
    );
  }
  void refreshRelations();
}

/** 행성 주민 캐시 갱신 (순환 import 방지를 위해 동적 로드) */
async function refreshRelations() {
  try {
    const m = await import("@/store/relationsStore");
    m.useRelationsStore.getState().reset();
    await m.useRelationsStore.getState().load();
  } catch {
    /* ignore */
  }
}

export async function deleteFact(id: string): Promise<void> {
  await getSupabase().from("user_facts").delete().eq("id", id);
}
export async function deleteRelation(id: string): Promise<void> {
  await getSupabase().from("relations").delete().eq("id", id);
  void refreshRelations();
}
