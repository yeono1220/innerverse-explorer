// 08 · 일기 상세 (음성 파형 mock + 본문 + 감정 태그)
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { StatusBar, AppBar, Body, IconButton } from "../ui/layout";
import { Card } from "../ui/primitives";
import { EmotionBar, EmotionTag } from "../ui/emotion";
import { useDiaryStore } from "@/store/diaryStore";

function Waveform({ active }: { active?: boolean }) {
  const bars = 28;
  return (
    <div style={{ display: "flex", gap: 3, alignItems: "center", height: 36 }}>
      {Array.from({ length: bars }).map((_, i) => {
        const h = 8 + Math.abs(Math.sin(i * 1.3)) * 28;
        return (
          <div
            key={i}
            style={{
              width: 3,
              height: h,
              borderRadius: 2,
              background: active && i < bars * 0.45 ? "var(--iv-purple2)" : "rgba(255,255,255,.18)",
            }}
          />
        );
      })}
    </div>
  );
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${["일", "월", "화", "수", "목", "금", "토"][d.getDay()]}요일`;
}

export default function DiaryDetail() {
  const nav = useNavigate();
  const { id } = useParams();
  const entry = useDiaryStore((s) => (id ? s.byId(id) : undefined));
  const [saving, setSaving] = useState(false);

  // 앱바 우측 ⤴ : 이 일기(모모챗 자동생성 본문 포함)를 저장 확정하고 홈으로.
  // DB 저장은 멱등(같은 날짜+본문이면 재사용) — 실패해도 로컬 스토어에는 남아 있으므로 홈으로 이동.
  const onSaveAndHome = async () => {
    if (saving) return;
    setSaving(true);
    try {
      if (entry) {
        const { ensureDiarySaved } = await import("@/services/diaryApi");
        await ensureDiarySaved({
          date: entry.date,
          preview: entry.preview,
          body: entry.body,
          audioSec: entry.audioSec,
          emotions: entry.emotions,
          keywords: entry.keywords,
          primary: entry.primary,
        });
      }
    } catch {
      /* 저장 실패해도 로컬 보관 → 홈 이동은 진행 */
    } finally {
      setSaving(false);
      nav("/home", { replace: true });
    }
  };

  if (!entry) {
    return (
      <>
        <StatusBar />
        <AppBar back title="일기" />
        <Body>
          <div style={{ textAlign: "center", color: "var(--iv-txt2)", padding: 40 }}>일기를 찾을 수 없어요.</div>
        </Body>
      </>
    );
  }

  return (
    <>
      <StatusBar />
      <AppBar back title={formatDate(entry.date).slice(8)} right={
          <IconButton onClick={onSaveAndHome} ariaLabel="저장하고 홈으로">
            ⤴
          </IconButton>
        } />
      <Body>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 12, color: "var(--iv-txt2)" }}>{formatDate(entry.date)}</div>
          <EmotionTag label={entry.primary} />
        </div>

        {entry.audioSec > 0 && (
          <Card size="sm">
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button
                className="iv-iconbtn"
                style={{ background: "linear-gradient(135deg,#7c6fe8,#a394f7)", border: "none" }}
                aria-label="재생"
              >
                ▶
              </button>
              <div style={{ flex: 1 }}>
                <Waveform active />
                <div style={{ fontSize: 11, color: "var(--iv-txt3)", marginTop: 4 }}>
                  음성 기록 · {entry.audioSec}초
                </div>
              </div>
            </div>
          </Card>
        )}

        <Card>
          <div style={{ fontSize: 14, lineHeight: 1.75, color: "var(--iv-txt)" }}>{entry.body}</div>
        </Card>

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

        <button
          onClick={() => nav(`/diary/result/${entry.id}`)}
          style={{
            background: "none",
            border: "none",
            color: "var(--iv-purple2)",
            fontSize: 13,
            cursor: "pointer",
            padding: "8px 0",
            alignSelf: "center",
          }}
        >
          분석 결과 다시 보기
        </button>
      </Body>
    </>
  );
}
