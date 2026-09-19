// 05 · 일기 목록 (검색 + 감정 필터 + 리스트 + 7일 감정 행성 생성 팝업)
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { StatusBar, AppBar, Body, IconButton } from "../ui/layout";
import { Card, Chip, Button } from "../ui/primitives";
import { EmotionTag } from "../ui/emotion";
import { Planet2D } from "../ui/planet";
import { useDiaryStore, type EmotionLabel } from "@/store/diaryStore";
import { useGalaxyStore, summarizeEntries, fmtShort, PLANET_BATCH } from "@/store/galaxyStore";

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

  // 감정 행성 생성 흐름
  const consumedIds = useGalaxyStore((s) => s.consumedIds);
  const dismissedAt = useGalaxyStore((s) => s.dismissedAt);
  const addPlanet = useGalaxyStore((s) => s.addPlanet);
  const dismiss = useGalaxyStore((s) => s.dismiss);
  const [banner, setBanner] = useState<string | null>(null);

  // 아직 행성으로 만들지 않은(미소비) 일기
  const unconsumed = useMemo(
    () => entries.filter((e) => !consumedIds.includes(e.id)),
    [entries, consumedIds],
  );
  // 가장 이른 7개 = 이번에 만들 "7일" 배치
  const batch = useMemo(
    () =>
      unconsumed
        .slice()
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
        .slice(0, PLANET_BATCH),
    [unconsumed],
  );
  const preview = useMemo(() => (batch.length === PLANET_BATCH ? summarizeEntries(batch) : null), [batch]);
  // 7개 이상 쌓였고, 아직 '나중에'로 미룬 상태가 아니면 팝업 노출
  const showPrompt = unconsumed.length >= PLANET_BATCH && dismissedAt !== unconsumed.length;

  const onCreate = () => {
    if (batch.length < PLANET_BATCH) return;
    addPlanet(batch);
    setBanner("🌌 새로운 감정 행성이 은하수에 추가됐어요.");
    window.setTimeout(() => setBanner(null), 5000);
  };
  const onLater = () => dismiss(unconsumed.length);

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
        {banner && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 12px",
              borderRadius: 14,
              background: "linear-gradient(135deg,rgba(124,111,232,.22),rgba(163,148,247,.12))",
              border: "1px solid rgba(163,148,247,.35)",
            }}
          >
            <div style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: "var(--iv-purple2)" }}>{banner}</div>
            <button
              onClick={() => nav("/galaxy")}
              style={{
                flex: "0 0 auto",
                fontSize: 12,
                fontWeight: 700,
                padding: "7px 12px",
                borderRadius: 999,
                border: "none",
                cursor: "pointer",
                color: "#fff",
                background: "linear-gradient(135deg,#7c6fe8,#a394f7)",
              }}
            >
              은하수 보기
            </button>
          </div>
        )}

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

      {/* 7일치 일기가 모이면: 감정 행성 생성 팝업 */}
      {showPrompt && preview && (
        <div
          onClick={onLater}
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 60,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
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
              maxWidth: 300,
              padding: "22px 20px",
              borderRadius: 22,
              background: "var(--iv-surf2)",
              border: "1px solid var(--iv-line)",
              boxShadow: "0 24px 60px -20px rgba(0,0,0,.7)",
              textAlign: "center",
            }}
          >
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
              <div style={{ animation: "iv-bob 3s ease-in-out infinite" }}>
                <Planet2D color={preview.color} size={78} />
              </div>
            </div>
            <div style={{ fontSize: 15.5, fontWeight: 800, lineHeight: 1.5 }}>
              새로운 7일의 일기로<br />감정 행성을 추가하겠습니까?
            </div>
            <div style={{ marginTop: 8, fontSize: 12, color: "var(--iv-txt2)", lineHeight: 1.6 }}>
              {fmtShort(preview.startDate)}~{fmtShort(preview.endDate)}의 마음이에요.<br />
              가장 강한 감정은 <b style={{ color: "var(--iv-purple2)" }}>‘{preview.dominant}’</b>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
              <Button variant="ghost" block onClick={onLater}>나중에</Button>
              <Button block onClick={onCreate}>예, 추가할게요</Button>
            </div>
          </div>
          <style>{`@keyframes iv-bob { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-6px) } }`}</style>
        </div>
      )}
    </>
  );
}
