// 08 · 일기 상세 (음성 파형 mock + 본문 + 감정 태그)
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { StatusBar, AppBar, Body, IconButton } from "../ui/layout";
import { Card } from "../ui/primitives";
import { InsightCard } from "../ui/InsightCard";
import { ShareCardButton } from "../ui/ShareCardButton";
import { EmotionBar, EmotionTag } from "../ui/emotion";
import { useDiaryStore } from "@/store/diaryStore";
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
      <AppBar
        back
        title={formatDate(entry.date).slice(8)}
        right={
          <div style={{ display: "flex", gap: 4 }}>
            <ShareCardButton entry={entry} icon />
            <IconButton onClick={() => nav(`/diary/${entry.id}/edit`)} ariaLabel="일기 수정">
              ✎
            </IconButton>
            <IconButton onClick={onSaveAndHome} ariaLabel="저장하고 홈으로">
              ⤴
            </IconButton>
          </div>
        }
      />
      <Body>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 12, color: "var(--iv-txt2)" }}>{formatDate(entry.date)}</div>
          <EmotionTag label={entry.primary} />
        </div>

        {/* 음성은 텍스트로만 받아쓰고 오디오는 저장하지 않는다 — 재생 버튼 대신 기록 방식만 표시 */}
        {entry.audioSec > 0 && (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              alignSelf: "flex-start",
              fontSize: 11.5,
              color: "var(--iv-txt2)",
              background: "var(--iv-surf2)",
              borderRadius: 999,
              padding: "5px 11px",
            }}
          >
            🎤 음성으로 기록 · {entry.audioSec}초
          </div>
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

        <InsightCard insight={entry.insight} />

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
