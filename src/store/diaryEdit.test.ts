// 일기 수정: 본문을 고치면 감정·키워드가 다시 뽑히고, 삭제는 제공하지 않는다.
import { describe, it, expect, beforeEach } from "vitest";
import { useDiaryStore, type DiaryEntry } from "./diaryStore";
import { analyzeLocal, makePreview, VOICE_ONLY_BODY } from "@/lib/diaryAnalyze";

const BASE: DiaryEntry = {
  id: "t1",
  date: "2026-08-20",
  preview: "회의가 길어져서 답답하고 짜증이 났다",
  body: "회의가 길어져서 답답하고 짜증이 났다. 억울하기까지 했다.",
  audioSec: 0,
  emotions: [{ label: "분노", pct: 60 }],
  keywords: ["회의", "짜증"],
  primary: "분노",
};

beforeEach(() => {
  useDiaryStore.setState({ entries: [BASE] });
});

describe("일기 수정", () => {
  it("본문과 재분석 결과가 함께 반영된다", () => {
    const next = "친구에게 연락이 왔다. 따뜻하고 감사한 하루였다.";
    const a = analyzeLocal(next);
    const saved = useDiaryStore.getState().update("t1", {
      body: next,
      preview: makePreview(next),
      emotions: a.emotions,
      keywords: a.keywords,
      primary: a.primary,
    });
    expect(saved?.body).toBe(next);
    expect(saved?.primary).not.toBe("분노"); // 부정 → 긍정으로 다시 분류됨
    expect(saved?.keywords).not.toEqual(BASE.keywords);
    expect(useDiaryStore.getState().byId("t1")?.body).toBe(next);
  });

  it("id와 작성일은 유지된다", () => {
    const saved = useDiaryStore.getState().update("t1", { body: "다시 쓴 하루." });
    expect(saved?.id).toBe("t1");
    expect(saved?.date).toBe(BASE.date);
    expect(useDiaryStore.getState().entries).toHaveLength(1);
  });

  it("없는 id면 아무것도 바뀌지 않는다", () => {
    expect(useDiaryStore.getState().update("없음", { body: "x" })).toBeUndefined();
    expect(useDiaryStore.getState().byId("t1")?.body).toBe(BASE.body);
  });

  it("일기를 지우는 액션은 제공하지 않는다", () => {
    expect("remove" in useDiaryStore.getState()).toBe(false);
    expect("delete" in useDiaryStore.getState()).toBe(false);
  });
});

describe("재분석 파이프라인", () => {
  it("감정 비중은 내림차순이고 대표 감정과 일치한다", () => {
    const a = analyzeLocal("불안하고 걱정돼서 잠이 오지 않았다. 초조했다.");
    expect(a.primary).toBe("긴장");
    expect(a.emotions[0].label).toBe(a.primary);
    for (let i = 1; i < a.emotions.length; i += 1) {
      expect(a.emotions[i - 1].pct).toBeGreaterThanOrEqual(a.emotions[i].pct);
    }
  });

  it("키워드는 중복 없이 최대 4개", () => {
    const a = analyzeLocal("카페 카페 라떼 산책 친구 회의 저녁 노을");
    expect(a.keywords.length).toBeLessThanOrEqual(4);
    expect(new Set(a.keywords).size).toBe(a.keywords.length);
  });

  it("본문이 달라지면 분석 결과도 달라진다", () => {
    const before = analyzeLocal(BASE.body);
    const after = analyzeLocal("오랜만에 푹 자서 평온하고 편안했다.");
    expect(after.primary).not.toBe(before.primary);
  });

  it("빈 본문의 미리보기는 음성 기록 문구로 대체된다", () => {
    expect(makePreview("   ")).toBe(VOICE_ONLY_BODY);
    expect(makePreview("짧은 하루")).toBe("짧은 하루");
  });
});
