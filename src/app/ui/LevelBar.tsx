// 홈 레벨 스탯바 — 다음 레벨까지 "채워진 정도"만 보여준다(수치 비노출).
import { useUserStore } from "@/store/userStore";
import { levelProgress } from "@/lib/level";

/** 채워진 정도를 말로만 전달 (스크린리더/보조 설명용). */
function fillWord(ratio: number): string {
  if (ratio <= 0) return "이제 막 시작";
  if (ratio < 0.25) return "조금 채워짐";
  if (ratio < 0.5) return "차오르는 중";
  if (ratio < 0.75) return "절반을 넘음";
  if (ratio < 1) return "거의 다 참";
  return "가득 참";
}

export function LevelBar({ compact = false }: { compact?: boolean }) {
  const level = useUserStore((s) => s.level);
  const levelExp = useUserStore((s) => s.levelExp);
  const mileageUse = useUserStore((s) => s.mileageUse);
  const p = levelProgress(level, levelExp);

  const label = p.isMax
    ? "최고 레벨에 도달했어요"
    : mileageUse === "discount"
    ? "별조각이 구독 할인으로 모이는 중"
    : "다음 레벨까지";

  return (
    <div style={{ width: "100%" }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 8,
          marginBottom: compact ? 5 : 7,
        }}
      >
        <span style={{ fontSize: compact ? 12 : 13, fontWeight: 800, letterSpacing: "0.02em" }}>
          Lv.{p.level}
        </span>
        <span style={{ fontSize: 11, color: "var(--iv-txt3)" }}>{label}</span>
      </div>
      <div
        role="progressbar"
        aria-label={`레벨 ${p.level} 진행도 — ${fillWord(p.ratio)}`}
        style={{
          height: compact ? 6 : 9,
          borderRadius: 999,
          background: "rgba(255,255,255,.08)",
          overflow: "hidden",
          border: "1px solid var(--iv-line)",
        }}
      >
        <div
          style={{
            width: `${Math.round(p.ratio * 100)}%`,
            height: "100%",
            borderRadius: 999,
            background:
              mileageUse === "discount"
                ? "linear-gradient(90deg,#5b5470,#8a82a0)"
                : "linear-gradient(90deg,#7c6fe8,#a394f7 60%,#ffd58a)",
            boxShadow: p.ratio > 0 ? "0 0 10px rgba(163,148,247,.45)" : "none",
            transition: "width .5s ease",
          }}
        />
      </div>
    </div>
  );
}
