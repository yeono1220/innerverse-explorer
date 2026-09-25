// 07 · 감정 분석 결과 (분석 후 바로 노출)
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { StatusBar, AppBar, Body } from "../ui/layout";
import { Card, Button, CapLabel } from "../ui/primitives";
import { Planet2D } from "../ui/planet";
import { EmotionBar, EmotionTag } from "../ui/emotion";
import { InsightCard } from "../ui/InsightCard";
import { ShareCardButton } from "../ui/ShareCardButton";
import { useDiaryStore } from "@/store/diaryStore";
import { useUserStore } from "@/store/userStore";

export default function EmotionResult() {
  const nav = useNavigate();
  const { id } = useParams();
  const entry = useDiaryStore((s) => (id ? s.byId(id) : undefined));
  const planetColor = useUserStore((s) => s.planetColor);
  const [phase, setPhase] = useState<"loading" | "result">("loading");

  useEffect(() => {
    const t = window.setTimeout(() => setPhase("result"), 1400);
    return () => window.clearTimeout(t);
  }, []);

  if (!entry) {
    return (
      <>
        <StatusBar />
        <AppBar back title="분석 결과" />
        <Body>
          <div style={{ textAlign: "center", color: "var(--iv-txt2)", padding: 40 }}>일기를 찾을 수 없어요.</div>
        </Body>
      </>
    );
  }

  return (
    <>
      <StatusBar />
      <AppBar title="감정 분석" />
      <Body>
        {phase === "loading" ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 22 }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                border: "3px solid rgba(255,255,255,.15)",
                borderTopColor: "var(--iv-purple2)",
                animation: "iv-spin 1s linear infinite",
              }}
            />
            <div style={{ fontSize: 12, letterSpacing: ".2em", color: "var(--iv-txt3)" }}>
              내면 파장을 분석하고 있어요…
            </div>
            <style>{`@keyframes iv-spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "10px 0" }}>
              <CapLabel>EMOTION ANALYSIS</CapLabel>
              <Planet2D color={planetColor} size={140} withMomo />
              <EmotionTag label={entry.primary} />
            </div>

            <Card>
              <div className="iv-section-h">감정 비중</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                {entry.emotions.map((e) => (
                  <EmotionBar key={e.label} label={e.label} pct={e.pct} />
                ))}
              </div>
            </Card>

            <Card>
              <div className="iv-section-h">키워드</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {entry.keywords.map((k) => (
                  <span
                    key={k}
                    style={{
                      fontSize: 12,
                      padding: "5px 11px",
                      borderRadius: 999,
                      background: "var(--iv-surf2)",
                      color: "var(--iv-txt)",
                      fontWeight: 600,
                    }}
                  >
                    #{k}
                  </span>
                ))}
              </div>
            </Card>

            {entry.insight ? (
              <InsightCard insight={entry.insight} />
            ) : (
              <Card variant="purple">
                <div style={{ fontSize: 13.5, lineHeight: 1.6 }}>
                  오늘은 ‘{entry.primary}’의 결이 도드라졌어요. 행성 표면이 살짝 다르게 빛나기 시작했어요.
                </div>
              </Card>
            )}

            <div style={{ marginTop: 8 }}>
              <ShareCardButton entry={entry} />
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <Button variant="ghost" block onClick={() => nav(`/diary/${entry.id}`, { replace: true })}>
                일기 보기
              </Button>
              <Button block onClick={() => nav("/home", { replace: true })}>
                홈으로
              </Button>
            </div>
          </>
        )}
      </Body>
    </>
  );
}
