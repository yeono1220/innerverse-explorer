// 미래의 나에게 보내는 편지 영속화 서비스 (letters 테이블 ↔ /letter 화면).
//
// 보안 · 프라이버시
//   · 편지는 작성자 본인만 접근 가능. 다른 사용자는 못 본다.
//     Supabase 경로에서는 RLS(user_id = auth.uid())와 쿼리의 .eq("user_id", uid)로
//     이중 보장한다(supabase/migrations/0011_letters.sql). 프론트 필터에만 의존 X.
//   · 봉인 중(공개일 이전) 편지의 '본문'은 아예 select 하지 않는다 — 메타데이터만.
//
// 데모 · 목업 모드 (Supabase 미설정)
//   · 실제 계정이 없으므로 이 기기 localStorage("innerverse.letters")에 저장한다.
//     'innerverse.' 접두사라 로그아웃/계정전환 시 clearLocalUserData()가 함께 지운다.
import { isSupabaseConfigured, getSupabase } from "@/lib/supabase";

export interface Letter {
  id: string;
  body: string;
  revealAt: string; // YYYY-MM-DD (공개일)
  createdAt: string; // ISO (작성일 = 봉인일)
}

/** 봉인 중 편지: 본문 없이 열람 예정일만 노출 */
export type SealedLetter = Omit<Letter, "body">;

export interface MyLetters {
  revealed: Letter[]; // 공개일이 지난 편지 (본문 포함, 열람 가능)
  sealed: SealedLetter[]; // 아직 봉인 중 (본문 미포함)
}

interface LetterRow {
  id: string;
  body: string;
  reveal_at: string;
  created_at: string;
}

const LS_KEY = "innerverse.letters";

function rowToLetter(r: LetterRow): Letter {
  return { id: r.id, body: r.body, revealAt: r.reveal_at, createdAt: r.created_at };
}

// ── localStorage(데모) 헬퍼 ──
function lsRead(): Letter[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    const arr = raw ? (JSON.parse(raw) as Letter[]) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
function lsWrite(list: Letter[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

/** 편지 1건 저장 → 저장된 편지 반환 */
export async function saveLetter(input: { body: string; revealAt: string }): Promise<Letter> {
  const body = input.body.trim();
  if (!body) throw new Error("편지 내용을 입력해 주세요.");

  // 데모/목업: 이 기기에 저장
  if (!isSupabaseConfigured) {
    const letter: Letter = {
      id: `l${Date.now()}`,
      body,
      revealAt: input.revealAt,
      createdAt: new Date().toISOString(),
    };
    lsWrite([letter, ...lsRead()]);
    return letter;
  }

  // 로그인 사용자 소유로 DB 저장 (RLS가 타인 접근을 막는다)
  const sb = getSupabase();
  const { data: u } = await sb.auth.getUser();
  if (!u.user) throw new Error("로그인이 필요합니다.");
  const { data, error } = await sb
    .from("letters")
    .insert({ user_id: u.user.id, body, reveal_at: input.revealAt })
    .select("id, body, reveal_at, created_at")
    .single();
  if (error) throw error;
  return rowToLetter(data as LetterRow);
}

/**
 * 내 편지 목록. today(YYYY-MM-DD) 기준으로 공개/봉인을 나눈다.
 *  - revealed: reveal_at <= today (본문 포함)
 *  - sealed:   reveal_at >  today (본문 제외 — 열람 예정일만)
 */
export async function listMyLetters(today: string): Promise<MyLetters> {
  // 데모/목업: 이 기기 저장분을 날짜로 분리
  if (!isSupabaseConfigured) {
    const all = lsRead();
    const revealed = all
      .filter((l) => l.revealAt <= today)
      .sort((a, b) =>
        a.revealAt < b.revealAt ? 1 : a.revealAt > b.revealAt ? -1 : b.createdAt.localeCompare(a.createdAt),
      );
    const sealed: SealedLetter[] = all
      .filter((l) => l.revealAt > today)
      .sort((a, b) => (a.revealAt < b.revealAt ? -1 : a.revealAt > b.revealAt ? 1 : 0))
      .map((l) => ({ id: l.id, revealAt: l.revealAt, createdAt: l.createdAt }));
    return { revealed, sealed };
  }

  const sb = getSupabase();
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return { revealed: [], sealed: [] };
  const uid = u.user.id;

  // 공개일이 지난 편지: 본문까지. (요구사항 — 지난 편지는 모두 열람 가능)
  const revealedQ = await sb
    .from("letters")
    .select("id, body, reveal_at, created_at")
    .eq("user_id", uid)
    .lte("reveal_at", today)
    .order("reveal_at", { ascending: false })
    .order("created_at", { ascending: false });
  if (revealedQ.error) throw revealedQ.error;

  // 봉인 중 편지: 본문은 select 하지 않는다(클라이언트로 내려보내지 않음).
  const sealedQ = await sb
    .from("letters")
    .select("id, reveal_at, created_at")
    .eq("user_id", uid)
    .gt("reveal_at", today)
    .order("reveal_at", { ascending: true });
  if (sealedQ.error) throw sealedQ.error;

  return {
    revealed: ((revealedQ.data as LetterRow[]) ?? []).map(rowToLetter),
    sealed: ((sealedQ.data as Array<Omit<LetterRow, "body">>) ?? []).map((r) => ({
      id: r.id,
      revealAt: r.reveal_at,
      createdAt: r.created_at,
    })),
  };
}
