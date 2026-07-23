// 13 · 은하수 뷰 (행성 컬렉션 씬 + 배경화면 모드 토글)
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { StatusBar, AppBar, Body } from "../ui/layout";
import { Card, Toggle, CapLabel } from "../ui/primitives";
import { Planet2D } from "../ui/planet";
import { useDiaryStore, EMOTION_COLORS } from "@/store/diaryStore";

function emotionToPlanetColor(e: string): "green" | "blue" | "amber" | "love" | "purple" | "void" {
  switch (e) {
    case "기쁨": return "amber";
    case "차분": return "green";
    case "사랑": return "love";
    case "슬픔": return "blue";
    case "분노": return "amber";
    case "긴장": return "amber";
    case "공허": return "void";
    default: return "purple";
  }
}

export default function Galaxy() {
  const nav = useNavigate();
  const entries = useDiaryStore((s) => s.entries);
  const [wallpaperMode, setWallpaperMode] = useState(false);

  return (
    <>
      <StatusBar />
      <AppBar back title="은하수" right={<div className="iv-cap" style={{ fontSize: 10 }}>{entries.length}개의 행성</div>} />
      <Body>
        <div
          style={{
            position: "relative",
            height: 360,
            borderRadius: 22,
            overflow: "hidden",
            background: wallpaperMode
              ? "radial-gradient(ellipse at center, #1a0e34 0%, #06040c 70%)"
              : "var(--iv-surf)",
            border: "1px solid var(--iv-line)",
          }}
        >
          <div className="iv-stars" />
          {entries.map((e, i) => {
            const x = 12 + (i % 4) * 24 + (Math.sin(i) * 6);
            const y = 12 + Math.floor(i / 4) * 28 + (Math.cos(i) * 4);
            const size = 50 + (i % 3) * 14;
            return (
              <button
                key={e.id}
                onClick={() => nav(`/diary/${e.id}`)}
                aria-label={`${e.primary} 행성`}
                style={{
                  position: "absolute",
                  top: `${y}%`,
                  left: `${x}%`,
                  background: "none",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  transform: "translate(-50%, -50%)",
                  animation: `iv-bob ${2 + (i % 4)}s ease-in-out infinite`,
                  animationDelay: `${i * 0.2}s`,
                }}
              >
                <Planet2D color={emotionToPlanetColor(e.primary)} size={size} />
              </button>
            );
          })}
          <style>{`@keyframes iv-bob { 0%,100% { transform: translate(-50%,-50%) translateY(0) } 50% { transform: translate(-50%,-50%) translateY(-6px) } }`}</style>
        </div>

        <Card size="sm">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div className="iv-card-title">배경화면 모드</div>
              <div className="iv-card-sub">UI 없이 행성만 보여요</div>
            </div>
            <Toggle on={wallpaperMode} onChange={setWallpaperMode} />
          </div>
        </Card>

        <Card>
          <div className="iv-section-h">감정 분포</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {(["기쁨", "차분", "사랑", "슬픔", "분노", "긴장", "공허"] as const).map((label) => {
              const n = entries.filter((e) => e.primary === label).length;
              return (
                <div
                  key={label}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "6px 11px",
                    borderRadius: 999,
                    background: "rgba(255,255,255,.04)",
                    border: "1px solid var(--iv-line)",
                    fontSize: 12,
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: EMOTION_COLORS[label],
                    }}
                  />
                  {label} {n}
                </div>
              );
            })}
          </div>
        </Card>
      </Body>
    </>
  );
}
