// 06 · 일주일 리뷰 — 감정 풍경 + 감정 위아래(밸런스) 그래프 + AI 회고 요약
import { useEffect, useMemo, useState } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, ReferenceLine, Tooltip } from "recharts";
import { StatusBar, AppBar, Body } from "../ui/layout";
import { Card, CapLabel } from "../ui/primitives";
import { EmotionBar, EmotionDot } from "../ui/emotion";
import { useDiaryStore, weekSummary, type DiaryEntry } from "@/store/diaryStore";
import { weeklyReview } from "@/lib/api";
import { useUserStore } from "@/store/userStore";
import { limitsFor } from "@/lib/plan";
import { LongTermPattern } from "../ui/LongTermPattern";

const POS = ["기쁨", "차분", "사랑"];

// 하루 감정 밸런스: 긍정(+) − 부정(−), -100~100
function entryValence(e: DiaryEntry): number {
  let v = 0;
  e.emotions.forEach((x) => {
    v += POS.includes(x.label) ? x.pct : -x.pct;
  });
  return Math.max(-100, Math.min(100, Math.round(v)));
}

export default function WeeklyReview() {
  const entries = useDiaryStore((s) => s.entries);
  const plan = useUserStore((s) => s.plan);
  const limits = limitsFor(plan);
  useEffect(() => {
    void useDiaryStore.getState().loadFromDb();
  }, []);
  const week = entries.slice(0, 7);
  const sum = weekSummary(week);
  const dominant = sum[0];

  const valenceData = useMemo(
    () => week.slice().reverse().map((e) => ({ day: (e.date ?? "").slice(5).replace("-", "/"), v: entryValence(e) })),
    [week],
  );

  const [ai, setAi] = useState<{ summary: string; recommendations: string[] } | null>(null);
  useEffect(() => {
    if (!week.length) return;
    weeklyReview(week.map((e) => e.body))
      .then(setAi)
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries.length]);

  return (
    <>
      <StatusBar />
      <AppBar title="이번 주 리뷰" />
      <Body tabbed>
        <div style={{ textAlign: "center" }}>
          <CapLabel>WEEKLY LANDSCAPE</CapLabel>
          <h2 style={{ fontSize: 22, fontWeight: 800, marginTop: 6 }}>
            이번 주는{" "}
            <span
              style={{
                color: dominant
                  ? `var(--iv-emo-${dominant.label === "차분" ? "calm" : dominant.label === "기쁨" ? "joy" : dominant.label === "사랑" ? "love" : dominant.label === "슬픔" ? "sad" : dominant.label === "긴장" ? "tension" : dominant.label === "분노" ? "anger" : "empty"})`
                  : "var(--iv-purple2)",
              }}
            >
              {dominant?.label ?? "차분"}
            </span>
            의 결
          </h2>
          <p style={{ fontSize: 12.5, color: "var(--iv-txt2)", marginTop: 8, lineHeight: 1.6 }}>
            총 {week.length}개의 기록 · 평균 감정 풍성도 {Math.min(100, week.length * 14)}%
          </p>
        </div>

        <Card>
          <div className="iv-section-h">감정 흐름 (위 = 긍정 / 아래 = 부정)</div>
          {valenceData.length >= 2 ? (
            <div style={{ width: "100%", height: 150 }}>
              <ResponsiveContainer>
                <LineChart data={valenceData} margin={{ top: 8, right: 10, bottom: 0, left: -24 }}>
                  <ReferenceLine y={0} stroke="rgba(255,255,255,.22)" strokeDasharray="3 3" />
                  <XAxis dataKey="day" tick={{ fontSize: 10, fill: "var(--iv-txt3)" }} axisLine={false} tickLine={false} />
                  <YAxis domain={[-100, 100]} hide />
                  <Tooltip
                    contentStyle={{ background: "#12121c", border: "1px solid rgba(255,255,255,.12)", borderRadius: 10, fontSize: 12 }}
                    labelStyle={{ color: "#9b95ad" }}
                    formatter={(v: number) => [`${v > 0 ? "+" : ""}${v}`, "밸런스"]}
                  />
                  <Line type="monotone" dataKey="v" stroke="#a394f7" strokeWidth={2.5} dot={{ r: 3, fill: "#a394f7" }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p style={{ fontSize: 12.5, color: "var(--iv-txt3)" }}>기록이 2개 이상 쌓이면 감정 흐름 그래프가 그려져요.</p>
          )}
        </Card>

        <Card>
          <div className="iv-section-h">감정 풍경 바</div>
          <div style={{ display: "flex", height: 16, borderRadius: 8, overflow: "hidden", background: "rgba(255,255,255,.06)" }}>
            {sum.map((s) => (
              <div
                key={s.label}
                title={`${s.label} ${s.pct}%`}
                style={{
                  width: `${s.pct}%`,
                  background: `var(--iv-emo-${
                    s.label === "차분" ? "calm" : s.label === "기쁨" ? "joy" : s.label === "사랑" ? "love" : s.label === "슬픔" ? "sad" : s.label === "긴장" ? "tension" : s.label === "분노" ? "anger" : "empty"
                  })`,
                }}
              />
            ))}
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
            {sum.map((s) => (
              <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--iv-txt2)" }}>
                <EmotionDot label={s.label} />
                {s.label} {s.pct}%
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <div className="iv-section-h">상위 감정 비중</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {sum.slice(0, 5).map((s) => (
              <EmotionBar key={s.label} label={s.label} pct={s.pct} />
            ))}
          </div>
        </Card>

        <Card>
          <div className="iv-section-h">이번 주, 너에게 어울리는 것</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(ai?.recommendations?.length ? ai.recommendations : ["가벼운 산책 30분", "좋아하는 노래 한 곡", "오늘의 감정 한 줄 더"]).map((r, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  padding: "10px 12px",
                  background: "rgba(255,255,255,.04)",
                  border: "1px solid var(--iv-line)",
                  borderRadius: 12,
                }}
              >
                <span style={{ fontSize: 10, padding: "3px 7px", borderRadius: 999, background: "rgba(163,148,247,.18)", color: "var(--iv-purple2)", fontWeight: 700 }}>
                  추천
                </span>
                <div style={{ fontSize: 13 }}>{r}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card variant="purple">
          <div style={{ fontSize: 13.5, lineHeight: 1.6 }}>
            {ai?.summary ?? "이번 주도 마음을 차곡차곡 기록했어요. 작은 순간들이 행성 위에 쌓이고 있어요 🌱"} 
          </div>
          <div style={{ fontSize: 13, marginLeft: "auto", justifyContent: "space-between" }}>
            — 모모 ✨
          </div>
        </Card>

        {/* 장기 패턴 분석 — 구독 전용 */}
        <LongTermPattern entries={entries} unlocked={limits.longTermAnalysis} />
      </Body>
    </>
  );
}
