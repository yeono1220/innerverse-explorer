// FastAPI(AI 백엔드) 호출 — 일기 분석.
// 백엔드 /api/analyze 가 7라벨(diary) + 키워드 + crisis_score 를 반환한다.
import type { EmotionLabel } from "@/store/diaryStore";
import { SLUG_OF, type Emo7 } from "@/glass-momo/constants";

const API_BASE =
  (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_URL ?? "";

export interface DiaryAnalysis {
  emotions: Array<{ label: EmotionLabel; pct: number }>;
  keywords: string[];
  primary: EmotionLabel;
  crisis_score: number;
  emo7: Record<Emo7, number>; // 행성 반영용 7감정 (diary.emotions 에서 파생)
  dominant: string;
}

interface AnalyzeApiResponse {
  diary?: { emotions?: Array<{ label: string; pct: number }>; primary?: string };
  keywords?: string[];
  crisis_score?: number;
  dominant?: string;
}

/** 일기 텍스트(+선택 음성)를 백엔드로 보내 7라벨 감정 분석을 받는다. */
export async function analyzeDiary(text: string, audio?: Blob): Promise<DiaryAnalysis> {
  const fd = new FormData();
  fd.append("text_data", text);
  if (audio) fd.append("audio_file", audio, "diary.webm");

  const res = await fetch(`${API_BASE}/api/analyze`, { method: "POST", body: fd });
  if (!res.ok) throw new Error(`analyze ${res.status}`);
  const data = (await res.json()) as AnalyzeApiResponse;

  const emotions = (data.diary?.emotions ?? []).map((e) => ({
    label: e.label as EmotionLabel,
    pct: e.pct,
  }));
  // 7감정 → 행성 반영용 Record<Emo7,number> 파생 (한글 라벨 → 슬러그)
  const emo7: Record<Emo7, number> = {
    joy: 0, calm: 0, love: 0, sad: 0, anger: 0, tension: 0, empty: 0,
  };
  emotions.forEach((e) => {
    const k = SLUG_OF[e.label];
    if (k) emo7[k] = e.pct;
  });
  return {
    emotions,
    keywords: data.keywords ?? [],
    primary: (data.diary?.primary ?? "차분") as EmotionLabel,
    crisis_score: data.crisis_score ?? 0,
    emo7,
    dominant: data.dominant ?? "calm",
  };
}

/** RAG 임베딩 — 키 있으면 768차원 벡터, 없으면 null. */
export async function embed(text: string): Promise<number[] | null> {
  try {
    const res = await fetch(`${API_BASE}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { embedding?: number[] | null };
    return data.embedding ?? null;
  } catch {
    return null;
  }
}

/** 사진 → 장면/분위기 분석 (Gemini Vision). 일기 맥락 보강용. */
export async function analyzeVision(
  photo: File,
): Promise<{ labels: string[]; scene: string; emotion_hint: string | null }> {
  const fd = new FormData();
  fd.append("photo", photo);
  const res = await fetch(`${API_BASE}/api/vision`, { method: "POST", body: fd });
  if (!res.ok) throw new Error(`vision ${res.status}`);
  return (await res.json()) as { labels: string[]; scene: string; emotion_hint: string | null };
}

/** 모모 공감 답장 — 과거 일기 context(RAG) 주입 가능. */
export async function momoReply(input: {
  text: string;
  emotions?: Record<string, number>;
  context?: string[];
  history?: string[] ; profile?: string;
}): Promise<{ reply: string; escalate: boolean }> {
  const res = await fetch(`${API_BASE}/api/momo/reply`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`momo ${res.status}`);
  return (await res.json()) as { reply: string; escalate: boolean };
}

/** 이번 주 일기 → AI 회고 요약 + 추천. */
export async function weeklyReview(
  diaries: string[],
): Promise<{ summary: string; recommendations: string[] }> {
  const res = await fetch(`${API_BASE}/api/weekly`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ diaries }),
  });
  if (!res.ok) throw new Error(`weekly ${res.status}`);
  return res.json();
}

/** 장기기억 추출 — 최근 일기 → 사실/성향 요약 + 구조화 사실/관계 (PPT ③④). */
export async function reflect(input: {
  diaries: string[];
  fact_summary?: string;
  persona_summary?: string;
}): Promise<{
  fact_summary: string;
  persona_summary: string;
  facts: { kind: string; key: string; value: string }[];
  relations: { name: string; relation: string; sentiment: string }[];
}> {
  const res = await fetch(`${API_BASE}/api/reflect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`reflect ${res.status}`);
  return res.json();
}

/** 당일 모모 대화 → 1인칭 일기 자동생성. 실패 시 예외(호출부가 폴백). */
export async function chatToDiary(
  messages: Array<{ who?: string; role?: string; text?: string; content?: string }>,
): Promise<string> {
  const res = await fetch(`${API_BASE}/api/momo/diary`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
  });
  if (!res.ok) throw new Error(`chatToDiary ${res.status}`);
  const data = (await res.json()) as { diary?: string };
  return data.diary ?? "";
}
