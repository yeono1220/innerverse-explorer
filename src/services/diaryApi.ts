// 일기 영속화 서비스 (Supabase diary_entries ↔ diaryStore.DiaryEntry)
import { getSupabase } from "@/lib/supabase";
import { embed } from "@/lib/api";
import type { DiaryEntry } from "@/store/diaryStore";

interface DiaryRow {
  id: string;
  date: string;
  preview: string;
  body: string;
  audio_sec: number;
  emotions: DiaryEntry["emotions"];
  keywords: string[];
  primary_label: string;
  created_at: string;
}

function rowToEntry(r: DiaryRow): DiaryEntry {
  return {
    id: r.id,
    date: r.date ?? r.created_at?.slice(0, 10),
    preview: r.preview,
    body: r.body,
    audioSec: r.audio_sec ?? 0,
    emotions: r.emotions ?? [],
    keywords: r.keywords ?? [],
    primary: (r.primary_label as DiaryEntry["primary"]) ?? "차분",
  };
}

/** 일기 1건 DB 저장 → 저장된 엔트리(id 포함) 반환 */
export async function saveDiaryEntry(e: Omit<DiaryEntry, "id">): Promise<DiaryEntry> {
  const sb = getSupabase();
  const { data: u } = await sb.auth.getUser();
  if (!u.user) throw new Error("로그인이 필요합니다.");
  const { data, error } = await sb
    .from("diary_entries")
    .insert({
      user_id: u.user.id,
      date: e.date,
      preview: e.preview,
      body: e.body,
      audio_sec: e.audioSec,
      emotions: e.emotions,
      keywords: e.keywords,
      primary_label: e.primary,
    })
    .select("*")
    .single();
  if (error) throw error;
  const saved = rowToEntry(data as DiaryRow);
  // RAG: 임베딩 생성해 비동기 저장 (키 없으면 null → 스킵)
  void embed([saved.body, saved.keywords.join(" ")].join(" "))
    .then((vec) => {
      if (vec) return sb.from("diary_entries").update({ embedding: vec }).eq("id", saved.id);
    })
    .catch(() => {});
  return saved;
}

/**
 * 기존 일기 1건 수정. 본문이 바뀌었으면 임베딩도 다시 만들어 덮어쓴다.
 * Supabase 미설정/비로그인이면 아무것도 하지 않고 null (로컬 수정은 그대로 유지).
 */
export async function updateDiaryEntry(
  id: string,
  e: Pick<DiaryEntry, "preview" | "body" | "emotions" | "keywords" | "primary">,
): Promise<DiaryEntry | null> {
  const { isSupabaseConfigured } = await import("@/lib/supabase");
  if (!isSupabaseConfigured) return null;
  const sb = getSupabase();
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return null;
  const { data, error } = await sb
    .from("diary_entries")
    .update({
      preview: e.preview,
      body: e.body,
      emotions: e.emotions,
      keywords: e.keywords,
      primary_label: e.primary,
    })
    .eq("id", id)
    .eq("user_id", u.user.id) // 남의 일기는 못 고치게
    .select("*")
    .single();
  if (error) throw error;
  const saved = rowToEntry(data as DiaryRow);
  // 본문이 바뀌었으니 RAG 임베딩도 갱신 (실패해도 무시)
  void embed([saved.body, saved.keywords.join(" ")].join(" "))
    .then((vec) => {
      if (vec) return sb.from("diary_entries").update({ embedding: vec }).eq("id", saved.id);
    })
    .catch(() => {});
  return saved;
}

/**
 * 이미 저장된 일기면 그대로 반환, 아니면 DB에 1건 저장.
 * (모모챗 → 일기 자동생성 경로에서 중복 insert를 막기 위한 멱등 저장)
 * Supabase 미설정/비로그인 시 null.
 */
export async function ensureDiarySaved(e: Omit<DiaryEntry, "id">): Promise<DiaryEntry | null> {
  const { isSupabaseConfigured } = await import("@/lib/supabase");
  if (!isSupabaseConfigured || !e.body.trim()) return null;
  const sb = getSupabase();
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return null;
  const { data: existing } = await sb
    .from("diary_entries")
    .select("*")
    .eq("user_id", u.user.id)
    .eq("date", e.date)
    .eq("body", e.body)
    .limit(1);
  const cur = (existing as DiaryRow[] | null)?.[0];
  if (cur) return rowToEntry(cur);
  return saveDiaryEntry(e);
}

/** 내 일기 목록 (최신순) */
export async function listDiaryEntries(): Promise<DiaryEntry[]> {
  const sb = getSupabase();
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return [];
  const { data, error } = await sb
    .from("diary_entries")
    .select("*")
    .eq("user_id", u.user.id)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data as DiaryRow[]) ?? []).map(rowToEntry);
}
