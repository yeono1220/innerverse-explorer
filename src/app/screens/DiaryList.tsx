// 05 · 일기 목록 (검색 + 감정 필터 + 리스트)
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { StatusBar, AppBar, Body, IconButton } from "../ui/layout";
import { Card, Chip } from "../ui/primitives";
import { EmotionTag } from "../ui/emotion";
import { useDiaryStore, type EmotionLabel } from "@/store/diaryStore";

const FILTERS: Array<EmotionLabel | "전체"> = ["전체", "기쁨", "차분", "사랑", "슬픔", "긴장", "공허"];

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

export default function DiaryList() {
  const nav = useNavigate();
  const entries = useDiaryStore((s) => s.entries);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<EmotionLabel | "전체">("전체");

  const list = useMemo(() => {
    return entries.filter((e) => {
      if (filter !== "전체" && e.primary !== filter) return false;
      if (q.trim() && !`${e.body} ${e.keywords.join(" ")}`.includes(q)) return false;
      return true;
    });
  }, [entries, q, filter]);

  return (
    <>
      <StatusBar />
      <AppBar title="기록한 마음들" right={<IconButton onClick={() => nav("/calendar")} ariaLabel="캘린더">📅</IconButton>} />
      <Body tabbed>
        <input
          className="iv-input"
          placeholder="키워드로 찾기"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div style={{ flex: "0 0 auto", minHeight: 36 }}>
          <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4, margin: "0 -4px" }}>
            {FILTERS.map((f) => (
              <Chip key={f} active={f === filter} onClick={() => setFilter(f)}>
                {f}
              </Chip>
            ))}
          </div>
        </div>

        {list.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 12px", color: "var(--iv-txt3)" }}>
            기록된 마음이 없어요.
            <br />
            지금 한 줄을 남겨볼까요?
          </div>
        ) : (
          list.map((e) => (
            <Card key={e.id} onClick={() => nav(`/diary/${e.id}`)} size="sm">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 12.5, color: "var(--iv-txt2)", fontWeight: 600 }}>
                  {formatDate(e.date)}
                </span>
                <EmotionTag label={e.primary} />
              </div>
              <div style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--iv-txt)" }}>
                {e.preview}
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {e.keywords.slice(0, 3).map((k) => (
                  <span
                    key={k}
                    style={{
                      fontSize: 11,
                      padding: "3px 8px",
                      borderRadius: 999,
                      background: "rgba(255,255,255,.06)",
                      color: "var(--iv-txt2)",
                    }}
                  >
                    #{k}
                  </span>
                ))}
                {e.audioSec > 0 && (
                  <span
                    style={{
                      fontSize: 11,
                      padding: "3px 8px",
                      borderRadius: 999,
                      background: "rgba(163,148,247,.18)",
                      color: "var(--iv-purple2)",
                    }}
                  >
                    🎤 {e.audioSec}초
                  </span>
                )}
              </div>
            </Card>
          ))
        )}

        <button
          onClick={() => nav("/diary/write")}
          style={{
            position: "fixed",
            right: "max(calc(50vw - 196px + 24px), 24px)",
            bottom: 100,
            width: 56,
            height: 56,
            borderRadius: 999,
            border: "none",
            background: "linear-gradient(135deg,#7c6fe8,#a394f7)",
            color: "#fff",
            fontSize: 24,
            cursor: "pointer",
            boxShadow: "0 12px 24px -8px rgba(124,111,232,.7)",
            zIndex: 35,
          }}
          aria-label="새 일기 작성"
        >
          ＋
        </button>
      </Body>
    </>
  );
}
