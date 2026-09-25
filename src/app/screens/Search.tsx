// 21 · 검색 결과 (키워드 하이라이트 + 필터)
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { StatusBar, AppBar, Body } from "../ui/layout";
import { Card, Chip } from "../ui/primitives";
import { EmotionTag } from "../ui/emotion";
import { useDiaryStore, type EmotionLabel } from "@/store/diaryStore";

const FILTERS: Array<EmotionLabel | "전체"> = ["전체", "기쁨", "차분", "사랑", "슬픔", "긴장", "공허"];

function highlight(text: string, q: string) {
  if (!q.trim()) return text;
  const idx = text.indexOf(q);
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background: "rgba(163,148,247,.35)", color: "#fff", padding: "1px 2px", borderRadius: 3 }}>
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length)}
    </>
  );
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export default function Search() {
  const nav = useNavigate();
  const entries = useDiaryStore((s) => s.entries);
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [filter, setFilter] = useState<EmotionLabel | "전체">("전체");

  const results = useMemo(() => {
    if (!q.trim()) return [];
    return entries.filter((e) => {
      if (filter !== "전체" && e.primary !== filter) return false;
      return `${e.body} ${e.keywords.join(" ")}`.includes(q);
    });
  }, [entries, q, filter]);

  return (
    <>
      <StatusBar />
      <AppBar back title="검색" />
      <Body>
        <input
          autoFocus
          className="iv-input"
          placeholder="키워드, 감정, 단어로 찾기"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div style={{ display: "flex", gap: 6, overflowX: "auto", margin: "0 -4px" }}>
          {FILTERS.map((f) => (
            <Chip key={f} active={f === filter} onClick={() => setFilter(f)}>
              {f}
            </Chip>
          ))}
        </div>

        {!q.trim() ? (
          <div style={{ textAlign: "center", color: "var(--iv-txt3)", padding: 30, fontSize: 12.5 }}>
            "회의", "산책", "친구" 처럼 단어로 찾아보세요.
          </div>
        ) : results.length === 0 ? (
          <div style={{ textAlign: "center", color: "var(--iv-txt3)", padding: 30, fontSize: 12.5 }}>
            ‘{q}’에 해당하는 기록이 없어요.
          </div>
        ) : (
          <>
            <div style={{ fontSize: 11.5, color: "var(--iv-txt3)" }}>{results.length}개 결과</div>
            {results.map((e) => (
              <Card key={e.id} size="sm" onClick={() => nav(`/diary/${e.id}`)}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 11.5, color: "var(--iv-txt3)" }}>{formatDate(e.date)}</span>
                  <EmotionTag label={e.primary} />
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.6, color: "var(--iv-txt)" }}>
                  {highlight(e.preview, q)}
                </div>
              </Card>
            ))}
          </>
        )}
      </Body>
    </>
  );
}
