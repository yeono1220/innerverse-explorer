// 22 · 캘린더 (월간 뷰 + 날짜별 감정 도트)
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { StatusBar, AppBar, Body, IconButton } from "../ui/layout";
import { Card, CapLabel } from "../ui/primitives";
import { EmotionTag } from "../ui/emotion";
import { useDiaryStore, EMOTION_COLORS } from "@/store/diaryStore";

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

export default function Calendar() {
  const nav = useNavigate();
  const entries = useDiaryStore((s) => s.entries);
  useEffect(() => {
    void useDiaryStore.getState().loadFromDb();
  }, []);
  const today = new Date();
  const [ym, setYm] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [selDate, setSelDate] = useState<string | null>(null);

  const byDate = useMemo(() => {
    const map = new Map<string, typeof entries>();
    entries.forEach((e) => {
      const list = map.get(e.date) ?? [];
      list.push(e);
      map.set(e.date, list);
    });
    return map;
  }, [entries]);

  const first = new Date(ym.y, ym.m, 1);
  const startDow = first.getDay();
  const daysInMonth = new Date(ym.y, ym.m + 1, 0).getDate();
  const cells: Array<{ date: string; day: number } | null> = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${ym.y}-${String(ym.m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ date: iso, day: d });
  }

  const selected = selDate ? byDate.get(selDate) ?? [] : [];

  const prevMonth = () => setYm(({ y, m }) => (m === 0 ? { y: y - 1, m: 11 } : { y, m: m - 1 }));
  const nextMonth = () => setYm(({ y, m }) => (m === 11 ? { y: y + 1, m: 0 } : { y, m: m + 1 }));

  return (
    <>
      <StatusBar />
      <AppBar back title="캘린더" />
      <Body>
        <Card>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <IconButton onClick={prevMonth} ariaLabel="이전 달">‹</IconButton>
            <div style={{ fontSize: 15, fontWeight: 700 }}>
              {ym.y}년 {ym.m + 1}월
            </div>
            <IconButton onClick={nextMonth} ariaLabel="다음 달">›</IconButton>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginTop: 4 }}>
            {WEEK.map((w) => (
              <div key={w} style={{ textAlign: "center", fontSize: 10.5, color: "var(--iv-txt3)", padding: 4 }}>
                {w}
              </div>
            ))}
            {cells.map((c, i) => {
              if (!c) return <div key={i} />;
              const items = byDate.get(c.date) ?? [];
              const isToday = c.date === today.toISOString().slice(0, 10);
              const isSel = selDate === c.date;
              return (
                <button
                  key={c.date}
                  onClick={() => setSelDate(c.date)}
                  style={{
                    aspectRatio: "1 / 1",
                    borderRadius: 10,
                    background: isSel ? "rgba(163,148,247,.22)" : "rgba(255,255,255,.03)",
                    border: isToday ? "1px solid var(--iv-purple2)" : "1px solid transparent",
                    color: items.length ? "var(--iv-txt)" : "var(--iv-txt3)",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 2,
                    padding: 0,
                  }}
                >
                  <span>{c.day}</span>
                  <div style={{ display: "flex", gap: 2, height: 5 }}>
                    {items.slice(0, 3).map((it) => (
                      <span
                        key={it.id}
                        style={{
                          width: 4,
                          height: 4,
                          borderRadius: "50%",
                          background: EMOTION_COLORS[it.primary],
                        }}
                      />
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </Card>

        {selDate && (
          <>
            <CapLabel>{selDate.split("-").join(".")}</CapLabel>
            {selected.length === 0 ? (
              <div style={{ color: "var(--iv-txt3)", fontSize: 12.5, padding: 20, textAlign: "center" }}>
                기록 없음
              </div>
            ) : (
              selected.map((e) => (
                <Card key={e.id} size="sm" onClick={() => nav(`/diary/${e.id}`)}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontSize: 12.5, color: "var(--iv-txt2)" }}>{e.audioSec > 0 ? `🎤 ${e.audioSec}초` : "✍︎"}</div>
                    <EmotionTag label={e.primary} />
                  </div>
                  <div style={{ fontSize: 13, color: "var(--iv-txt)", lineHeight: 1.6 }}>{e.preview}</div>
                </Card>
              ))
            )}
          </>
        )}
      </Body>
    </>
  );
}
