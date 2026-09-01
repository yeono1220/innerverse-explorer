// AI 분석처럼 오래 걸리는 작업 중에 띄우는 오버레이.
// 화면을 갈아끼우지 않고 뒤 화면을 살짝 흐리게 덮어, 하던 맥락을 유지한다.
import type { ReactNode } from "react";

export function BusyOverlay({
  open,
  label = "전송중",
  emoji = "📝",
  hint,
}: {
  open: boolean;
  label?: string;
  emoji?: string;
  hint?: ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      className="iv-busy"
      role="status"
      aria-live="polite"
      aria-label={`${label} 중입니다`}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 60,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        background: "rgba(10,8,20,.55)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        animation: "iv-busy-in .22s ease-out",
      }}
    >
      <div style={{ fontSize: 40, animation: "iv-busy-bob 1.6s ease-in-out infinite" }} aria-hidden="true">
        {emoji}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 2, fontSize: 15, fontWeight: 700 }}>
        <span>{label}</span>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            aria-hidden="true"
            style={{ animation: `iv-busy-dot 1.2s ${i * 0.18}s ease-in-out infinite`, opacity: 0.25 }}
          >
            .
          </span>
        ))}
      </div>
      {hint && (
        <div style={{ fontSize: 11.5, color: "var(--iv-txt3)", textAlign: "center", maxWidth: 240, lineHeight: 1.6 }}>
          {hint}
        </div>
      )}
      <style>{`
        @keyframes iv-busy-in { from { opacity: 0 } to { opacity: 1 } }
        @keyframes iv-busy-bob { 0%,100% { transform: translateY(0) rotate(-4deg) } 50% { transform: translateY(-7px) rotate(4deg) } }
        @keyframes iv-busy-dot { 0%,100% { opacity: .2 } 50% { opacity: 1 } }
        @media (prefers-reduced-motion: reduce) {
          .iv-busy, .iv-busy * { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
