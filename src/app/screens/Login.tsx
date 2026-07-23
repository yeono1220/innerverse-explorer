// 01 · 로그인 (카카오/이메일) — 화면(표현) 전용. 로직은 ./useLoginActions.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { StatusBar } from "../ui/layout";
import { Button } from "../ui/primitives";
import { Planet2D } from "../ui/planet";
import { useLoginActions } from "./useLoginActions";

export default function Login() {
  const nav = useNavigate();
  const { busy, error, loginWithKakao, loginWithEmail } = useLoginActions();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [mode, setMode] = useState<"choose" | "email">("choose");

  const onEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // loginWithEmail(email, pw);
  };

  return (
    <>
      <StatusBar />
      <div className="iv-stars" />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "10px 32px 32px", textAlign: "center", position: "relative" }}>
        <div style={{ marginTop: 26 }}>
          <Planet2D color="purple" size={110} />
        </div>
        <div className="iv-cap" style={{ marginTop: 22 }}>INNERVERSE</div>
        <h1 style={{ fontSize: 25, fontWeight: 800, marginTop: 6, lineHeight: 1.25 }}>
          오늘의 마음을<br />행성에 기록해요
        </h1>
        <p style={{ fontSize: 13, color: "var(--iv-txt2)", marginTop: 10, lineHeight: 1.6 }}>
          기록한 감정은 당신만의 행성이 되어<br />매일 조금씩 자라납니다.
        </p>

        <div style={{ marginTop: "auto", width: "100%", display: "flex", flexDirection: "column", gap: 10 }}>
          {mode === "choose" ? (
            <>
              <Button /*block onClick={loginWithKakao} disabled={busy} style={{ background: "#FEE500", color: "#181600" }}*/>
                💬 카카오로 3초 만에 시작
              </Button>
              <Button block variant="ghost" onClick={() => setMode("email")}>
                ✉️ 이메일로 시작
              </Button>
              <button
                type="button"
                onClick={() => nav("/signup")}
                style={{ background: "none", border: "none", color: "var(--iv-purple2)", fontSize: 13, fontWeight: 600, padding: 6, cursor: "pointer" }}
              >
                처음이신가요? 회원가입 →
              </button>
              {/*error && <p style={{ fontSize: 12, color: "#e8744e" }}>{error}</p>*/}
              <p style={{ fontSize: 11, color: "var(--iv-txt3)", marginTop: 4 }}>
                계속하면 이용약관과 개인정보처리방침에 동의합니다.
              </p>
            </>
          ) : (
            <form onSubmit={onEmailSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <input
                className="iv-input"
                type="email"
                placeholder="이메일"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
              />
              <input
                className="iv-input"
                type="password"
                placeholder="비밀번호"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
              />
              {/*error && <p style={{ fontSize: 12, color: "#e8744e" }}>{error}</p>*/}
              <Button block type="submit" disabled={busy}>
                {busy ? "로그인 중…" : "로그인"}
              </Button>
              <button
                type="button"
                onClick={() => setMode("choose")}
                style={{ background: "none", border: "none", color: "var(--iv-txt3)", fontSize: 12, padding: 8, cursor: "pointer" }}
              >
                ← 다른 방법으로
              </button>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
