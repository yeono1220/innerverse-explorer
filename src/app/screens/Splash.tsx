// 18 · 스플래시 인트로
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useUserStore } from "@/store/userStore";
import { Planet2D } from "../ui/planet";

export default function Splash() {
  const nav = useNavigate();
  const loggedIn = useUserStore((s) => s.loggedIn);

  useEffect(() => {
    const t = window.setTimeout(() => nav(loggedIn ? "/home" : "/login", { replace: true }), 1400);
    return () => window.clearTimeout(t);
  }, [nav, loggedIn]);

  return (
    <div style={{ position: "relative", flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 24 }}>
      <div className="iv-stars" />
      <div style={{ animation: "iv-float 4s ease-in-out infinite" }}>
        <Planet2D color="green" size={150} withMomo />
      </div>
      <div style={{ textAlign: "center" }}>
        <div className="iv-cap" style={{ letterSpacing: "0.34em", opacity: 0.9 }}>INNERVERSE</div>
        <h1
          style={{
            fontFamily: "'Gowun Batang', serif",
            fontSize: 29,
            fontWeight: 700,
            letterSpacing: "0.01em",
            lineHeight: 1.35,
            marginTop: 12,
            textShadow: "0 0 24px rgba(155,149,173,0.35)",
          }}
        >
          내 안의 우주를 발견하다
        </h1>
        <p style={{ fontSize: 13, color: "var(--iv-txt2)", marginTop: 12, letterSpacing: "0.04em" }}> 시작해요.</p>
      </div>
      <style>{`
        @keyframes iv-float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
      `}</style>
    </div>
  );
}
