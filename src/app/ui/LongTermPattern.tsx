// 장기(월·분기) 감정 패턴 분석 — 구독 전용 섹션.
// 무료 플랜에서는 잠긴 미리보기와 안내만 보여준다.
import { useMemo } from "react";
import { Card } from "./primitives";
import { EmotionBar } from "./emotion";
import { PlanNotice } from "./PlanNotice";
import { weekSummary, type DiaryEntry, type EmotionLabel } from "@/store/diaryStore";

export function LongTermPattern({ entries, unlocked }: { entries: DiaryEntry[]; unlocked: boolean }) {
  // 최근 90일 = 분기 단위 감정 비중
  const quarter = useMemo(() => {
    const since = Date.now() - 90 * 86400000;
    const inRange = entries.filter((e) => {
      const t = e.date ? Date.parse(e.date) : NaN;
      return Number.isNaN(t) ? true : t >= since;
    });
    return weekSummary(inRange).slice(0, 4);
  }, [entries]);

  if (!unlocked) {
    return (
      <Card>
        <div className="iv-section-h">장기 감정 패턴</div>
        <div
          aria-hidden="true"
          style={{ filter: "blur(5px)", opacity: 0.45, pointerEvents: "none", display: "flex", flexDirection: "column", gap: 8 }}
        >
          {([["차분", 62], ["기쁨", 41], ["긴장", 27]] as Array<[EmotionLabel, number]>).map(([label, pct]) => (
            <EmotionBar key={label} label={label} pct={pct} />
          ))}
        </div>
        <div style={{ marginTop: 12 }}>
          <PlanNotice
            title="90일 흐름은 플러스에서 볼 수 있어요"
            body="무료 플랜은 이번 주 리뷰까지예요. 지난 주 일기는 원문 대신 감정 요약만 남아요."
          />
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="iv-section-h">장기 감정 패턴 · 최근 90일</div>
      {quarter.length === 0 ? (
        <div style={{ fontSize: 12.5, color: "var(--iv-txt3)" }}>기록이 더 쌓이면 분기 흐름을 보여드릴게요.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {quarter.map((q) => (
            <EmotionBar key={q.label} label={q.label} pct={q.pct} />
          ))}
        </div>
      )}
      <div style={{ fontSize: 11.5, color: "var(--iv-txt3)", marginTop: 10, lineHeight: 1.5 }}>
        기록 {entries.length}개를 기준으로 계산했어요. 플러스는 일기 원문이 그대로 보관돼요.
      </div>
    </Card>
  );
}
