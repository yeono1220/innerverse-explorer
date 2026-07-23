// 모모 대화 영속화 + 대화→당일 일기 자동생성·첨부 파이프라인
// 설계: 당일 데이터는 평문(모델 접근 가능), 과거는 봉인 대상(sealed) — 암호화 배선은 후속 슬라이스.
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { embed, chatToDiary } from "@/lib/api";
import { saveDiaryEntry } from "@/services/diaryApi";
import type { DiaryEntry } from "@/store/diaryStore";

export interface ChatTurn {
  who: "momo" | "me";
  text: string;
  emo?: string;
}

type DiaryMeta = Pick<DiaryEntry, "emotions" | "keywords" | "primary">;

const todayISO = () => new Date().toISOString().slice(0, 10);

/** 오늘 대화 턴을 momo_messages에 저장(평문=당일). 미설정/비로그인 시 조용히 스킵. */
export async function saveMomoTurns(turns: ChatTurn[]): Promise<void> {
  if (!isSupabaseConfigured || !turns.length) return;
  const sb = getSupabase();
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return;
  const uid = u.user.id;
  const rows = turns
    .filter((t) => t.text?.trim())
    .map((t) => ({
      user_id: uid,
      day: todayISO(),
      role: t.who === "me" ? "user" : "momo",
      content: t.text,
      emo: t.emo ?? null,
    }));
  if (rows.length) await sb.from("momo_messages").insert(rows);
}

/** 대화 → 1인칭 일기 본문 자동생성(백엔드). 실패 시 사용자 발화 이어붙이기. */
export async function generateDiaryFromChat(turns: ChatTurn[], sessionId?: string): Promise<string> {
  try {
    const body = await chatToDiary(turns.map((t) => ({ who: t.who, text: t.text })), sessionId);
    if (body?.trim()) return body.trim();
  } catch {
    /* 폴백으로 */
  }
  return turns
    .filter((t) => t.who === "me")
    .map((t) => t.text)
    .join(" ");
}

/** 당일 일기(미봉인)가 있으면 끝에 첨부+재임베딩, 없으면 새로 생성. Supabase 기준. */
export async function appendToTodayDiary(body: string, meta: DiaryMeta): Promise<DiaryEntry | null> {
  if (!isSupabaseConfigured || !body.trim()) return null;
  const sb = getSupabase();
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return null;
  const date = todayISO();

  const { data: existing } = await sb
    .from("diary_entries")
    .select("*")
    .eq("user_id", u.user.id)
    .eq("date", date)
    .eq("sealed", false)
    .order("created_at", { ascending: true })
    .limit(1);
  const cur = (existing as Array<Record<string, unknown>> | null)?.[0];

  if (cur) {
    const merged = `${(cur.body as string) ?? ""}\n\n${body}`.trim();
    const keywords = Array.from(
      new Set([...((cur.keywords as string[]) ?? []), ...meta.keywords]),
    ).slice(0, 6);
    await sb
      .from("diary_entries")
      .update({
        body: merged,
        preview: merged.slice(0, 60),
        emotions: meta.emotions,
        keywords,
        primary_label: meta.primary,
      })
      .eq("id", cur.id as string);
    void embed([merged, keywords.join(" ")].join(" "))
      .then((vec) => (vec ? sb.from("diary_entries").update({ embedding: vec }).eq("id", cur.id as string) : null))
      .catch(() => {});
    return {
      id: cur.id as string,
      date,
      preview: merged.slice(0, 60),
      body: merged,
      audioSec: 0,
      emotions: meta.emotions,
      keywords,
      primary: meta.primary,
    };
  }

  // 없으면 새 일기 (출처=momo_chat)
  const saved = await saveDiaryEntry({
    date,
    preview: body.slice(0, 60),
    body,
    audioSec: 0,
    emotions: meta.emotions,
    keywords: meta.keywords,
    primary: meta.primary,
  });
  try {
    await sb.from("diary_entries").update({ source: "momo_chat" }).eq("id", saved.id);
  } catch {
    /* source 표시는 선택 */
  }
  return saved;
}

/** 파이프라인: 턴 저장 → (본문 생성) → 당일 일기 첨부/생성 + 임베딩. */
export async function finalizeChatToDiary(
  turns: ChatTurn[],
  meta: DiaryMeta,
  bodyOverride?: string,
): Promise<{ body: string; entry: DiaryEntry | null }> {
  const body = bodyOverride ?? (await generateDiaryFromChat(turns));
  await saveMomoTurns(turns).catch(() => {});
  const entry = await appendToTodayDiary(body, meta).catch(() => null);
  return { body, entry };
}
