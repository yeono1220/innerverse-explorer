// 15 · 과거의 편지 (과거 편지 확인 + 가정법 시뮬레이션 + 미래의 나에게 편지 쓰기)
import { useEffect, useMemo, useState } from "react";
import { StatusBar, AppBar, Body } from "../ui/layout";
import { Card, Button, Chip } from "../ui/primitives";
import { Planet2D } from "../ui/planet";
import { saveLetter, listMyLetters, type Letter, type MyLetters } from "@/services/letterApi";

const SCENARIOS = [
  "그날 그 사람과 솔직하게 얘기했더라면",
  "조금 더 쉬어가는 선택을 했더라면",
  "그 일을 꼭 해내야 한다고 믿지 않았더라면",
];

const SIM_RESULT: Record<string, { color: "green" | "blue" | "love" | "amber"; line: string }> = {
  "그날 그 사람과 솔직하게 얘기했더라면": { color: "love", line: "사이는 가까워졌겠지만, 한동안 더 흔들렸을 수 있어." },
  "조금 더 쉬어가는 선택을 했더라면": { color: "green", line: "결과는 비슷했고, 너의 어깨는 훨씬 가벼웠을 거야." },
  "그 일을 꼭 해내야 한다고 믿지 않았더라면": { color: "blue", line: "다른 길이 보였을 거고, 마음은 더 너그러웠을 거야." },
};

// 열람 시점 단위: 일 / 개월
type Unit = "day" | "month";
const PRESETS: Record<Unit, number[]> = { day: [1, 7, 30, 100], month: [1, 3, 6, 12] };
const DEFAULT_AMOUNT: Record<Unit, number> = { day: 7, month: 3 };
const MAX_AMOUNT: Record<Unit, number> = { day: 3650, month: 600 };
const unitLabel = (u: Unit) => (u === "day" ? "일" : "개월");

// 항상 존재하는 더미 '과거의 편지'. 내용은 한 글자도 바꾸지 않는다.
// (기존 상단 카드에서 그대로 옮겨옴 — 1주 전에 작성한 편지로 취급)
const DUMMY_LETTER_BODY =
  "1주 전 오늘의 나에게,\n\n" +
  "\"별 거 아닌 일에도 너무 힘들어하지 마. 그때의 너가 충분히 잘하고 있어. 다음의 너는 그걸 알아보고 한 박자 더 부드러워질 수 있을 거야.\"\n" +
  "— 9월의 너로부터";

// ── 날짜 헬퍼 (모두 로컬 타임존 기준 — 사용자는 KST) ──
function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function addMonths(d: Date, n: number): Date {
  const r = new Date(d);
  r.setMonth(r.getMonth() + n);
  return r;
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
// "YYYY-MM-DD" 또는 ISO 문자열 모두 처리
function formatKDate(input: string): string {
  const d = new Date(input.length <= 10 ? `${input}T00:00:00` : input);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}
function daysUntil(dateStr: string): number {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  const d = new Date(`${dateStr}T00:00:00`);
  return Math.max(0, Math.round((d.getTime() - t.getTime()) / 86400000));
}

export default function PastLetter() {
  // 가정법 시뮬레이션(기존)
  const [sim, setSim] = useState<string | null>(null);
  const result = sim ? SIM_RESULT[sim] : null;

  // 내 편지 목록
  const [letters, setLetters] = useState<MyLetters>({ revealed: [], sealed: [] });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  // 작성 오버레이 상태
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState("");
  const [unit, setUnit] = useState<Unit>("month");
  const [amount, setAmount] = useState(3);
  const [customStr, setCustomStr] = useState("");
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const today = useMemo(() => ymd(new Date()), []);
  const revealAt = useMemo(
    () => ymd(unit === "day" ? addDays(new Date(), amount) : addMonths(new Date(), amount)),
    [unit, amount],
  );

  // 항상 맨 앞에 두는 더미 과거 편지 (1주 전 작성)
  const dummyLetter: Letter = useMemo(() => {
    const wrote = addDays(new Date(), -7);
    return {
      id: "dummy-past-1",
      body: DUMMY_LETTER_BODY,
      revealAt: ymd(wrote),
      createdAt: wrote.toISOString(),
    };
  }, []);

  const reload = async () => {
    try {
      const mine = await listMyLetters(today);
      setLetters(mine);
      setLoadError(false);
    } catch {
      setLetters({ revealed: [], sealed: [] });
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  // 마운트 시 "내" 편지만 불러온다 (DB 경로: RLS + user_id 필터로 타인 편지는 안 옴)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const mine = await listMyLetters(today);
        if (alive) setLetters(mine);
      } catch {
        if (alive) setLoadError(true);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [today]);

  const openCompose = () => {
    setDraft("");
    setUnit("month");
    setAmount(3);
    setCustomStr("");
    setComposing(true);
  };
  const closeCompose = () => {
    if (!saving) setComposing(false);
  };

  const switchUnit = (u: Unit) => {
    setUnit(u);
    setAmount(DEFAULT_AMOUNT[u]);
    setCustomStr("");
  };
  const pickPreset = (p: number) => {
    setAmount(p);
    setCustomStr("");
  };
  const onCustom = (v: string) => {
    const digits = v.replace(/[^0-9]/g, "").slice(0, 4);
    setCustomStr(digits);
    const n = parseInt(digits, 10);
    if (Number.isFinite(n) && n >= 1) setAmount(Math.min(n, MAX_AMOUNT[unit]));
  };
  const presetActive = (p: number) => customStr === "" && amount === p;

  const onSeal = async () => {
    if (!draft.trim() || saving) return;
    setSaving(true);
    try {
      await saveLetter({ body: draft, revealAt });
      setComposing(false);
      setDraft("");
      setFlash(`🔒 편지를 봉인했어요 · ${formatKDate(revealAt)}에 열려요`);
      window.setTimeout(() => setFlash(null), 4000);
      await reload();
    } catch (e) {
      console.error("[letter] save failed", e);
      alert("편지를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  };

  // 더미는 항상 맨 앞. 그 뒤로 실제로 공개일이 지난 내 편지.
  const revealed = [dummyLetter, ...letters.revealed];

  return (
    <>
      <StatusBar />
      <AppBar back title="과거의 편지" />
      <Body>
        <Card>
          <div className="iv-section-h">그날의 행성</div>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <Planet2D color="blue" size={70} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: "var(--iv-txt2)" }}>2024-02-24</div>
              <div style={{ fontSize: 13.5, fontWeight: 700, marginTop: 2 }}>차분·슬픔의 결</div>
              <div style={{ fontSize: 11.5, color: "var(--iv-txt3)", marginTop: 2 }}>
                기록 18줄 · 키워드 #회의 #지침 #산책
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <div className="iv-section-h">만약, 그때 다른 선택을 했다면?</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {SCENARIOS.map((s) => (
              <Chip key={s} active={sim === s} onClick={() => setSim(s)}>
                {s}
              </Chip>
            ))}
          </div>
          {result && (
            <div
              style={{
                marginTop: 6,
                padding: 14,
                borderRadius: 14,
                background: "rgba(163,148,247,.1)",
                border: "1px solid rgba(163,148,247,.3)",
                display: "flex",
                gap: 12,
                alignItems: "center",
              }}
            >
              <Planet2D color={result.color} size={56} />
              <div style={{ fontSize: 12.5, lineHeight: 1.6, color: "var(--iv-txt)" }}>
                {result.line}
              </div>
            </div>
          )}
        </Card>

        {/* 과거의 편지 — 공개일이 지난 편지를 확인하는 박스 (더미가 항상 하나 있다) */}
        <Card>
          <div className="iv-section-h">
            <span>나에게 쓴 편지</span>
            <span style={{ fontSize: 11.5, color: "var(--iv-txt3)", fontWeight: 600 }}>
              열람 {revealed.length} · 봉인 {letters.sealed.length}
            </span>
          </div>

          {flash && (
            <div
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                background: "rgba(124,111,232,.16)",
                border: "1px solid rgba(163,148,247,.35)",
                color: "var(--iv-purple2)",
                fontSize: 12.5,
                fontWeight: 600,
              }}
            >
              {flash}
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {/* 공개일이 지난 편지: 본문까지 열람 */}
            {revealed.map((l) => (
              <div
                key={l.id}
                style={{
                  padding: 14,
                  borderRadius: 14,
                  background: "rgba(163,148,247,.1)",
                  border: "1px solid rgba(163,148,247,.28)",
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: ".04em",
                    color: "var(--iv-purple2)",
                    marginBottom: 6,
                  }}
                >
                  💌 {formatKDate(l.createdAt)}에 쓴 편지
                </div>
                <div
                  style={{
                    fontSize: 13,
                    lineHeight: 1.7,
                    color: "rgba(255,255,255,.9)",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {l.body}
                </div>
              </div>
            ))}

            {/* 아직 봉인 중: 열람 예정일만, 본문은 감춤 */}
            {letters.sealed.map((s) => (
              <div
                key={s.id}
                style={{
                  padding: "12px 14px",
                  borderRadius: 14,
                  background: "var(--iv-surf2)",
                  border: "1px dashed var(--iv-line)",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 12.5,
                  color: "var(--iv-txt2)",
                }}
              >
                <span aria-hidden="true">🔒</span>
                <span>{formatKDate(s.revealAt)}에 열려요</span>
                <span
                  style={{
                    marginLeft: "auto",
                    padding: "2px 8px",
                    borderRadius: 999,
                    background: "rgba(255,255,255,.06)",
                    fontSize: 11,
                    fontWeight: 700,
                    color: "var(--iv-txt3)",
                  }}
                >
                  D-{daysUntil(s.revealAt)}
                </span>
              </div>
            ))}
          </div>

          {loading && (
            <div style={{ fontSize: 11.5, color: "var(--iv-txt3)" }}>새 편지를 불러오는 중…</div>
          )}
          {loadError && (
            <div style={{ fontSize: 11.5, color: "var(--iv-txt3)" }}>
              편지 목록을 불러오지 못했어요.
            </div>
          )}
        </Card>

        {/* 하단 가운데: 버튼 2개 */}
        <div style={{ display: "flex", gap: 10 }}>
          <Button block onClick={openCompose}>✍️ 편지 작성하기</Button>
          <Button variant="ghost" block onClick={() => alert("편지를 보관함에 저장했어요")}>
            편지 보관하기
          </Button>
        </div>
      </Body>

      {/* 편지 작성 오버레이 — 화면을 크게 덮는다 */}
      {composing && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 60,
            display: "flex",
            flexDirection: "column",
            background: "radial-gradient(800px 700px at 50% -10%, #1b1430, #0c0a16 55%, #07060d 100%)",
          }}
        >
          <StatusBar />
          <AppBar title="편지 작성하기" back={closeCompose} />
          <Body>
            <div style={{ fontSize: 12.5, lineHeight: 1.7, color: "var(--iv-txt2)" }}>
              미래의 나에게 보내는 편지예요.<br />
              정한 기간이 지나면 이 화면에서 열어볼 수 있어요.
            </div>

            <Card>
              <div className="iv-section-h" style={{ marginBottom: 10 }}>언제 열어볼까요?</div>

              {/* 단위: 일 / 개월 */}
              <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                <Chip active={unit === "day"} onClick={() => switchUnit("day")}>일 단위</Chip>
                <Chip active={unit === "month"} onClick={() => switchUnit("month")}>개월 단위</Chip>
              </div>

              {/* 프리셋 + 직접 입력 */}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                {PRESETS[unit].map((p) => (
                  <Chip key={p} active={presetActive(p)} onClick={() => pickPreset(p)}>
                    {unit === "month" && p === 12 ? "1년 후" : `${p}${unitLabel(unit)} 후`}
                  </Chip>
                ))}
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "6px 10px",
                    borderRadius: 999,
                    background: "var(--iv-surf2)",
                    border: `1px solid ${customStr ? "rgba(163,148,247,.55)" : "transparent"}`,
                    color: customStr ? "var(--iv-txt)" : "var(--iv-txt2)",
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  직접
                  <input
                    type="text"
                    inputMode="numeric"
                    value={customStr}
                    onChange={(e) => onCustom(e.target.value)}
                    placeholder="n"
                    aria-label={`직접 ${unitLabel(unit)} 수 입력`}
                    style={{
                      width: 34,
                      background: "transparent",
                      border: "none",
                      outline: "none",
                      color: "var(--iv-txt)",
                      font: "inherit",
                      fontSize: 12,
                      textAlign: "center",
                      borderBottom: "1px solid var(--iv-line)",
                    }}
                  />
                  {unitLabel(unit)}
                </span>
              </div>

              <div style={{ marginTop: 12, fontSize: 12.5, color: "var(--iv-purple2)", fontWeight: 600 }}>
                🗓 {formatKDate(revealAt)}에 열려요{" "}
                <span style={{ color: "var(--iv-txt3)", fontWeight: 500 }}>
                  · {unit === "day" ? `${amount}일 후` : `약 ${amount}개월 후`}
                </span>
              </div>
            </Card>

            <textarea
              className="iv-input"
              style={{ flex: 1, minHeight: 240, resize: "none", lineHeight: 1.7 }}
              placeholder="지금의 나에게, 그리고 미래의 나에게 하고 싶은 말을 적어보세요…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              autoFocus
            />

            <Button block onClick={onSeal} disabled={!draft.trim() || saving}>
              {saving ? "봉인하는 중…" : "🔒 이 편지 봉인하기"}
            </Button>
          </Body>
        </div>
      )}
    </>
  );
}
