// 10 · 퀘스트 (일일 미션 + 별조각 보상)
import { useEffect } from "react";
import { StatusBar, AppBar, Body } from "../ui/layout";
import { Card, CapLabel } from "../ui/primitives";
import { useAppStore } from "@/store/appStore";

export default function Quest() {
  const quests = useAppStore((s) => s.quests);
  const ensureQuestsForToday = useAppStore((s) => s.ensureQuestsForToday);
  useEffect(() => {
    ensureQuestsForToday(); // 하루 지났으면 0/4로 리셋
  }, [ensureQuestsForToday]);
  const done = quests.filter((q) => q.done).length;

  return (
    <>
      <StatusBar />
      <AppBar back title="오늘의 퀘스트" />
      <Body>
        <div style={{ textAlign: "center" }}>
          <CapLabel>DAILY QUEST</CapLabel>
          <h2 style={{ fontSize: 22, fontWeight: 800, marginTop: 6 }}>
            {done}/{quests.length} 완료
          </h2>
          <p style={{ fontSize: 12, color: "var(--iv-txt2)", marginTop: 4 }}>완료할수록 행성이 더 풍성해져요</p>
        </div>

        <div
          style={{
            height: 8,
            borderRadius: 4,
            background: "rgba(255,255,255,.07)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${(done / quests.length) * 100}%`,
              height: "100%",
              background: "linear-gradient(135deg,#7c6fe8,#a394f7)",
              transition: "width .4s",
            }}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {quests.map((q) => (
            <Card key={q.id} size="sm">
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div
                  aria-label={q.done ? "완료됨" : "진행 중"}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    border: q.done ? "none" : "2px solid var(--iv-line)",
                    background: q.done ? "linear-gradient(135deg,#7c6fe8,#a394f7)" : "transparent",
                    color: "#fff",
                    fontSize: 14,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flex: "0 0 auto",
                  }}
                >
                  {q.done ? "✓" : ""}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: q.done ? "var(--iv-txt3)" : "var(--iv-txt)", textDecoration: q.done ? "line-through" : "none" }}>
                    {q.title}
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--iv-txt3)", marginTop: 2 }}>{q.desc}</div>
                </div>
                <div
                  style={{
                    fontSize: 11.5,
                    padding: "4px 9px",
                    borderRadius: 999,
                    background: "rgba(232,196,95,.18)",
                    color: "#e8c45f",
                    fontWeight: 700,
                  }}
                >
                  ✦ {q.reward}
                </div>
              </div>
            </Card>
          ))}
        </div>

        <Card variant="purple">
          <div style={{ fontSize: 13, lineHeight: 1.6 }}>
            일기 작성·모모 대화·친구 방문·컨디션 체크 같은 활동을 하면 자동으로 완료되고 별조각이 지급돼요. 매일 자정 초기화됩니다.
          </div>
        </Card>
      </Body>
    </>
  );
}
