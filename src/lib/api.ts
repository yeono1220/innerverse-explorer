// FastAPI(AI 백엔드) 호출 — 일기 분석.
// 백엔드 /api/analyze 가 7라벨(diary) + 키워드 + crisis_score 를 반환한다.
import type { EmotionLabel } from "@/store/diaryStore";
import { SLUG_OF, type Emo7 } from "@/glass-momo/constants";
import { getSession } from "@/services/auth";

const API_BASE =
  (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_URL ?? "";

/**
 * 서버 입력 검증 실패(422).
 * 백엔드(validation.py)가 내려주는 message 는 사용자에게 그대로 보여줄 수 있는
 * 안내문구다 — 화면에서 이 값을 직접 쓰면 된다.
 * 이걸 일반 Error 로 뭉개면 "백엔드가 죽었다"와 구분이 안 돼서
 * 폴백 답장만 나가고 원인이 사용자에게도 개발자에게도 안 보인다.
 */
export class InputRejectedError extends Error {
  readonly code: string;
  readonly field?: string;
  readonly limit?: number;
  readonly actual?: number;
  readonly unit?: string;

  constructor(body: Record<string, unknown> | null, fallback: string) {
    super(typeof body?.message === "string" ? body.message : fallback);
    this.name = "InputRejectedError";
    this.code = typeof body?.code === "string" ? body.code : "invalid_input";
    this.field = typeof body?.field === "string" ? body.field : undefined;
    this.limit = typeof body?.limit === "number" ? body.limit : undefined;
    this.actual = typeof body?.actual === "number" ? body.actual : undefined;
    this.unit = typeof body?.unit === "string" ? body.unit : undefined;
  }

  /** 길이 초과인가 (그 외 422 는 형식 오류) */
  get isTooLong(): boolean {
    return this.code === "input_too_long";
  }
}

/**
 * 지금은 줄이 꽉 차서 못 받는 상태(503).
 * 장애가 아니라 '혼잡'이다 — message 는 사용자에게 그대로 보여줄 포근한 안내문구.
 */
export class ServiceBusyError extends Error {
  readonly code = "llm_busy";
  constructor(message: string) {
    super(message);
    this.name = "ServiceBusyError";
  }
}

/** !res.ok 를 던지기 — 422(입력 거절)와 503(혼잡)을 갈라낸다. */
async function raiseHttpError(res: Response, label: string): Promise<never> {
  if (res.status === 422) {
    const body = await res.json().catch(() => null);
    throw new InputRejectedError(body, `${label} ${res.status}`);
  }
  if (res.status === 503) {
    const body = await res.json().catch(() => null);
    const msg = body?.detail?.message;
    throw new ServiceBusyError(
      typeof msg === "string" ? msg : "지금은 조금 붐벼요. 잠시 뒤에 다시 대화할까요?",
    );
  }
  throw new Error(`${label} ${res.status}`);
}

/** 모델이 쓴 해석 — 결과 화면 '모모의 해석'. 휴리스틱 폴백이면 없음. */
export interface DiaryInsight {
  reason: string;
  reframe: string;
  next_step: string;
}

export interface DiaryAnalysis {
  emotions: Array<{ label: EmotionLabel; pct: number }>;
  keywords: string[];
  primary: EmotionLabel;
  insight?: DiaryInsight;
  crisis_score: number;
  emo7: Record<Emo7, number>; // 행성 반영용 7감정 (diary.emotions 에서 파생)
  dominant: string;
}

interface AnalyzeApiResponse {
  diary?: { emotions?: Array<{ label: string; pct: number }>; primary?: string };
  keywords?: string[];
  crisis_score?: number;
  dominant?: string;
  insight?: { reason?: string; reframe?: string; next_step?: string } | null;
}

/** 일기 텍스트(+선택 음성)를 백엔드로 보내 7라벨 감정 분석을 받는다. */
export async function analyzeDiary(text: string, audio?: Blob): Promise<DiaryAnalysis> {
  const fd = new FormData();
  fd.append("text_data", text);
  if (audio) fd.append("audio_file", audio, "diary.webm");

  const res = await fetch(`${API_BASE}/api/analyze`, {
    method: "POST",
    body: fd,
    headers: { ...(await authHeaders()) },
  });
  if (!res.ok) await raiseHttpError(res, "analyze");
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
    ...(data.insight && (data.insight.reason || data.insight.reframe || data.insight.next_step)
      ? {
          insight: {
            reason: data.insight.reason ?? "",
            reframe: data.insight.reframe ?? "",
            next_step: data.insight.next_step ?? "",
          },
        }
      : {}),
  };
}

/** RAG 임베딩 — 키 있으면 768차원 벡터, 없으면 null. */
export async function embed(text: string): Promise<number[] | null> {
  try {
    const res = await fetch(`${API_BASE}/api/embed`, {
      method: "POST",
      headers: { ...(await authHeaders()), "Content-Type": "application/json" },
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
  const res = await fetch(`${API_BASE}/api/vision`, { method: "POST", body: fd, headers: { ...(await authHeaders()) } });
  if (!res.ok) throw new Error(`vision ${res.status}`);
  return (await res.json()) as { labels: string[]; scene: string; emotion_hint: string | null };
}

/** 모모 공감 답장 — 과거 일기 context(RAG) 주입 가능. */
export async function momoReply(input: {
  text: string;
  emotions?: Record<string, number>;
  context?: string[];
  history?: string[] ; profile?: string;
  session_id?: string; // 모모챗 세션 식별(성능 9지표 로깅용)
}): Promise<{ reply: string; escalate: boolean }> {
  const res = await fetch(`${API_BASE}/api/momo/reply`, {
    method: "POST",
    headers: { ...(await authHeaders()), "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) await raiseHttpError(res, "momo");
  return (await res.json()) as { reply: string; escalate: boolean };
}

/** 모모 공감 답장(스트리밍). onDelta 가 조각이 올 때마다 호출된다. */
function stripMomoSpeakerPrefix(text: string): string {
  return text.replace(/^\s*(?:모모|momo)\s*:\s*/i, "");
}

export async function momoReplyStream(
  input: {
    text: string; emotions?: Record<string, number>; context?: string[];
    history?: string[]; profile?: string; session_id?: string;
  },
  onDelta: (textSoFar: string) => void,
  /**
   * 내 앞에 대기자가 있어 '예약'된 순간 한 번 호출된다.
   * 사용자는 아무것도 다시 누르지 않는다 — 차례가 오면 onDelta 가 알아서 이어진다.
   */
  onQueued?: (info: { position: number; message: string }) => void,
): Promise<{ reply: string; escalate: boolean }> {
  const res = await fetch(`${API_BASE}/api/momo/reply/stream`, {
    method: "POST",
    headers: { ...(await authHeaders()), "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) await raiseHttpError(res, "momo");
  if (!res.body) throw new Error("momo: 응답 본문이 비어 있음");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let reply = "";
  let escalate = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true }); // 한글 깨짐 방지

    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";          // 잘린 마지막 조각은 다음 루프로 넘김
    for (const part of parts) {
      if (!part.startsWith("data: ")) continue;
      const ev = JSON.parse(part.slice(6));
      if (ev.type === "meta") escalate = ev.escalate;
      // 줄을 섰다 — 기다리는 동안 보여줄 안내. 연결은 그대로 열려 있다.
      if (ev.type === "queued") onQueued?.({ position: ev.position, message: ev.message });
      // 제한 시간 안에 차례가 안 왔다 — 스트림은 여기서 정상 종료된다.
      if (ev.type === "busy") throw new ServiceBusyError(ev.message);
      if (ev.type === "delta") {
        reply += ev.text;
        onDelta(stripMomoSpeakerPrefix(reply));
      }
      if (ev.type === "error") throw new Error("momo stream error");
    }
  }
  return { reply: stripMomoSpeakerPrefix(reply), escalate };
}

/** 이번 주 일기 → AI 회고 요약 + 추천. */
export async function weeklyReview(
  diaries: string[],
): Promise<{ summary: string; recommendations: string[] }> {
  const res = await fetch(`${API_BASE}/api/weekly`, {
    method: "POST",
    headers: { ...(await authHeaders()), "Content-Type": "application/json" },
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
    headers: { ...(await authHeaders()), "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`reflect ${res.status}`);
  return res.json();
}

/** 당일 모모 대화 → 1인칭 일기 자동생성. 실패 시 예외(호출부가 폴백). */
export async function chatToDiary(
  messages: Array<{ who?: string; role?: string; text?: string; content?: string }>,
  sessionId?: string,
): Promise<string> {
  const res = await fetch(`${API_BASE}/api/momo/diary`, {
    method: "POST",
    headers: { ...(await authHeaders()), "Content-Type": "application/json" },
    body: JSON.stringify({ messages, session_id: sessionId }),
  });
  if (!res.ok) throw new Error(`chatToDiary ${res.status}`);
  const data = (await res.json()) as { diary?: string };
  return data.diary ?? "";
}
async function authHeaders(): Promise<Record<string, string>> {
  const s = await getSession();
  return s?.access_token ? { Authorization: `Bearer ${s.access_token}` } : {};
}