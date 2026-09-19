// 13 · 은하수 뷰 — '선택적으로 생성된' 감정 행성만 표시.
// (기존: 일기 1개당 행성 1개 → 수정: 7일 일기를 요약한 행성만, 클릭 시 요약 확인)
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { StatusBar, AppBar, Body } from "../ui/layout";
import { Card, Toggle } from "../ui/primitives";
import { Planet2D } from "../ui/planet";
import { EmotionTag } from "../ui/emotion";
import { useDiaryStore, EMOTION_COLORS } from "@/store/diaryStore";
import { useGalaxyStore, fmtShort, type EmotionPlanet } from "@/store/galaxyStore";

export default function Galaxy() {
  const nav = useNavigate();
  const entries = useDiaryStore((s) => s.entries);
  const planets = useGalaxyStore((s) => s.planets);
  const [wallpaperMode, setWallpaperMode] = useState(false);
  const [selected, setSelected] = useState<EmotionPlanet | null>(null);

  return (
    <>
      <StatusBar />
      <AppBar
        back
        title="은하수"
        right={<div className="iv-cap" style={{ fontSize: 10 }}>{planets.length}개의 행성</div>}
      />
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

          {planets.length === 0 ? (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                padding: 24,
                textAlign: "center",
                color: "var(--iv-txt3)",
                fontSize: 12.5,
                lineHeight: 1.7,
              }}
            >
              <div style={{ fontSize: 30, opacity: 0.7 }}>🌌</div>
              아직 감정 행성이 없어요.
              <br />
              일기 7개가 모이면 새 행성을 만들 수 있어요.
            </div>
          ) : (
            planets.map((p, i) => {
              const cols = 3;
              const x = 22 + (i % cols) * 28 + Math.sin(i * 1.7) * 5;
              const y = 24 + Math.floor(i / cols) * 24 + Math.cos(i * 1.3) * 5;
              const size = 54 + (i % 3) * 12;
              return (
                <button
                  key={p.id}
                  onClick={() => setSelected(p)}
                  aria-label={`${p.dominant} 감정 행성 (${fmtShort(p.startDate)}~${fmtShort(p.endDate)})`}
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
                  <Planet2D color={p.color} size={size} />
                </button>
              );
            })
          )}
          <style>{`@keyframes iv-bob { 0%,100% { transform: translate(-50%,-50%) translateY(0) } 50% { transform: translate(-50%,-50%) translateY(-6px) } }`}</style>
        </div>

        {!wallpaperMode && (
          <div style={{ fontSize: 11.5, color: "var(--iv-txt3)", textAlign: "center", marginTop: -4 }}>
            행성을 누르면 그 7일의 감정 요약을 볼 수 있어요.
          </div>
        )}

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
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: EMOTION_COLORS[label] }} />
                  {label} {n}
                </div>
              );
            })}
          </div>
        </Card>
      </Body>

      {/* 행성 상세 — 그 7일의 감정 요약 */}
      {selected && (
        <div
          onClick={() => setSelected(null)}
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 60,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            background: "rgba(6,4,12,.62)",
            backdropFilter: "blur(3px)",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            style={{
              width: "100%",
              maxWidth: 320,
              maxHeight: "82%",
              overflowY: "auto",
              padding: "20px 18px",
              borderRadius: 22,
              background: "var(--iv-surf2)",
              border: "1px solid var(--iv-line)",
              boxShadow: "0 24px 60px -20px rgba(0,0,0,.7)",
            }}
          >
            <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
              <Planet2D color={selected.color} size={66} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: "var(--iv-txt3)", fontWeight: 600 }}>
                  {fmtShort(selected.startDate)} ~ {fmtShort(selected.endDate)}
                </div>
                <div style={{ fontSize: 16, fontWeight: 800, marginTop: 2 }}>
                  ‘{selected.dominant}’의 행성
                </div>
                <div style={{ fontSize: 11.5, color: "var(--iv-txt3)", marginTop: 2 }}>
                  7일의 마음을 모았어요
                </div>
              </div>
            </div>

            <div style={{ fontSize: 12.5, lineHeight: 1.7, color: "var(--iv-txt)", marginTop: 14 }}>
              {selected.summary}
            </div>

            {selected.breakdown.length > 0 && (
              <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                <div className="iv-section-h" style={{ fontSize: 12 }}>감정 비중</div>
                {selected.breakdown.slice(0, 5).map((b) => (
                  <div key={b.label} className="iv-emobar">
                    <span className="iv-emobar-label">{b.label}</span>
                    <div className="iv-emobar-track">
                      <div className="iv-emobar-fill" style={{ width: `${b.pct}%`, background: EMOTION_COLORS[b.label] }} />
                    </div>
                    <span className="iv-emobar-val">{b.pct}%</span>
                  </div>
                ))}
              </div>
            )}

            {selected.keywords.length > 0 && (
              <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: 6 }}>
                {selected.keywords.map((k) => (
                  <span
                    key={k}
                    style={{
                      fontSize: 11,
                      padding: "4px 10px",
                      borderRadius: 999,
                      background: "rgba(163,148,247,.14)",
                      color: "var(--iv-purple2)",
                      fontWeight: 600,
                    }}
                  >
                    #{k}
                  </span>
                ))}
              </div>
            )}

            <div style={{ marginTop: 16 }}>
              <div className="iv-section-h" style={{ fontSize: 12, marginBottom: 8 }}>이 행성에 담긴 7일</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {selected.entries.map((e) => (
                  <div
                    key={e.id}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 12,
                      background: "rgba(255,255,255,.04)",
                      border: "1px solid var(--iv-hairline)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 11.5, color: "var(--iv-txt2)", fontWeight: 600 }}>{fmtShort(e.date)}</span>
                      <EmotionTag label={e.primary} />
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--iv-txt2)",
                        lineHeight: 1.5,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                      }}
                    >
                      {e.preview}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={() => setSelected(null)}
              className="iv-btn iv-btn-ghost iv-btn-block"
              style={{ marginTop: 16 }}
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </>
  );
}
