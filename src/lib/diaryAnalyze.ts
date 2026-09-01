// 일기 본문 → 감정 비중 · 키워드 추출.
// 작성(DiaryWrite)과 수정(DiaryEdit)이 같은 파이프라인을 쓰도록 한 곳에 모았다.
import { analyzeDiary } from "@/lib/api";
import type { EmotionLabel } from "@/store/diaryStore";

export interface Analysis {
  emotions: Array<{ label: EmotionLabel; pct: number }>;
  keywords: string[];
  primary: EmotionLabel;
}

const RULES: Array<[EmotionLabel, RegExp]> = [
  ["기쁨", /기쁘|행복|뿌듯|좋|감사|신나|설레|즐거/],
  ["사랑", /사랑|보고싶|애틋|따뜻|애정/],
  ["차분", /평온|편안|안정|차분|괜찮|담담|쉬|쉬엄/],
  ["슬픔", /슬프|우울|눈물|외로|지쳤|허전|아프/],
  ["분노", /화|짜증|답답|억울|열받|분노/],
  ["긴장", /불안|걱정|초조|긴장|무섭|두렵|떨려|회의/],
  ["공허", /공허|텅 빈|무기력|허무|아무것/],
];

/** 본문이 비었을 때 쓰는 표시용 문구 */
export const VOICE_ONLY_BODY = "음성으로 남긴 마음";

/** 목록/카드에 쓰는 미리보기 (본문 앞부분) */
export function makePreview(text: string): string {
  return (text.trim() || VOICE_ONLY_BODY).slice(0, 60);
}

/** 백엔드 없이 도는 규칙 기반 분석 (폴백 겸 오프라인 경로) */
export function analyzeLocal(text: string): Analysis {
  const scores: Record<EmotionLabel, number> = { 기쁨: 4, 차분: 4, 사랑: 2, 슬픔: 2, 분노: 1, 긴장: 2, 공허: 1 };
  RULES.forEach(([label, re]) => {
    const m = text.match(new RegExp(re, "g"));
    if (m) scores[label] += m.length * 8;
  });
  const total = Object.values(scores).reduce((s, v) => s + v, 0);
  const emotions = (Object.entries(scores) as Array<[EmotionLabel, number]>)
    .map(([label, v]) => ({ label, pct: Math.round((v / total) * 100) }))
    .filter((x) => x.pct >= 5)
    .sort((a, b) => b.pct - a.pct);
  const keywords = Array.from(text.matchAll(/[가-힣]{2,6}/g))
    .map((m) => m[0])
    .filter((w, i, a) => a.indexOf(w) === i)
    .slice(0, 4);
  return { emotions, keywords, primary: emotions[0]?.label ?? "차분" };
}

/**
 * 본문 분석. 백엔드(Gemini) 우선, 실패하거나 결과가 비면 규칙 기반으로 폴백.
 * 작성·수정 어느 쪽에서 불러도 같은 결과 형태를 돌려준다.
 */
export async function analyzeText(text: string): Promise<Analysis> {
  const input = text.trim() || "(음성 기록만)";
  try {
    const a = await analyzeDiary(input);
    if (a.emotions.length) return a as Analysis;
  } catch {
    /* 백엔드 실패 → 규칙 기반 */
  }
  return analyzeLocal(input);
}
