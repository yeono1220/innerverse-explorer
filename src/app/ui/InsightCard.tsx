// '모모의 해석' — 감정 분석의 근거(reason) · 다시 보기(reframe) · 작은 한 걸음(next_step).
// 결과 화면과 일기 상세에서 같은 카드를 쓴다. insight 가 없으면(규칙 기반 폴백) 렌더하지 않는다.
import { Card, CapLabel } from "./primitives";
import { Momo2D } from "./planet";
import type { DiaryEntry } from "@/store/diaryStore";

const ROWS: Array<{ key: keyof NonNullable<DiaryEntry["insight"]>; label: string; icon: string }> = [
  { key: "reason", label: "이렇게 읽었어", icon: "🔍" },
  { key: "reframe", label: "다른 각도에서 보면", icon: "🔭" },
  { key: "next_step", label: "오늘의 작은 한 걸음", icon: "🌱" },
];

export function InsightCard({ insight }: { insight: DiaryEntry["insight"] }) {
  if (!insight) return null;
  const rows = ROWS.filter((r) => insight[r.key]?.trim());
  if (!rows.length) return null;
  return (
    <Card variant="purple">
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <Momo2D size={28} />
        <CapLabel>MOMO'S NOTE · 모모의 해석</CapLabel>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {rows.map((r) => (
          <div key={r.key}>
            <div style={{ fontSize: 11, letterSpacing: ".08em", color: "rgba(255,255,255,.62)", marginBottom: 3 }}>
              {r.icon} {r.label}
            </div>
            <div style={{ fontSize: 13.5, lineHeight: 1.65, color: "#fff" }}>{insight[r.key]}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}
