// 무료 플랜 한도 안내 / 업그레이드 유도 배너.
import { useNavigate } from "react-router-dom";
import { useUserStore } from "@/store/userStore";

export function PlanNotice({ title, body }: { title: string; body: string }) {
  const nav = useNavigate();
  const plan = useUserStore((s) => s.plan);
  if (plan !== "free") return null;
  return (
    <div
      style={{
        borderRadius: 14,
        padding: "12px 14px",
        background: "linear-gradient(135deg,rgba(124,111,232,.22),rgba(163,148,247,.12))",
        border: "1px solid rgba(163,148,247,.35)",
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>{title}</div>
        <div style={{ fontSize: 11.5, color: "var(--iv-txt2)", marginTop: 3, lineHeight: 1.5 }}>{body}</div>
      </div>
      <button
        onClick={() => nav("/plan")}
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
        플러스
      </button>
    </div>
  );
}
