// 02 · 회원가입 + 아바타 생성 (이름 + 행성 색)
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { StatusBar, AppBar, Body } from "../ui/layout";
import { Button, CapLabel } from "../ui/primitives";
import { Planet2D } from "../ui/planet";
import { useUserStore, PLANET_COLORS, type PlanetColor } from "@/store/userStore";
import { signUpWithPassword } from "@/services/auth";
import { saveProfile } from "@/services/profileApi";
import { isSupabaseConfigured } from "@/lib/supabase";

const COLORS: PlanetColor[] = ["green", "purple", "blue", "amber", "love", "void"];

export default function Signup() {
  const nav = useNavigate();
  const setProfile = useUserStore((s) => s.setProfile);
  const login = useUserStore((s) => s.login);
  const currentName = useUserStore((s) => s.name);
  const currentColor = useUserStore((s) => s.planetColor);
  const [name, setName] = useState(currentName);
  const [color, setColor] = useState<PlanetColor>(currentColor);
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async () => {
    const trimmed = name.trim() || "IEUM";

    // 목업 모드 (Supabase 미설정) — 기존 동작
    if (!isSupabaseConfigured) {
      setProfile(trimmed, color);
      login(trimmed, email || `${trimmed}@example.com`);
      nav("/home", { replace: true });
      return;
    }

    if (!email.trim() || pw.length < 6) {
      setErr("이메일과 6자 이상 비밀번호를 입력해 주세요.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const data = await signUpWithPassword(email.trim(), pw, trimmed);
      setProfile(trimmed, color);
      if (data.session) {
        // 이메일 인증 OFF → 즉시 로그인됨
        try {
          await saveProfile({ nickname: trimmed, planet_color: color, planet_name: `${trimmed}의 행성` });
        } catch {
          /* 트리거가 기본 프로필 생성하므로 무시 */
        }
        nav("/home", { replace: true });
      } else {
        // 이메일 인증 ON → 메일 확인 후 로그인
        setErr("가입 완료! 이메일 인증 후 로그인해 주세요.");
        setTimeout(() => nav("/login", { replace: true }), 1500);
      }
    } catch (e) {
      const msg = (e as Error)?.message || "";
      // Supabase 서버 미연결(네트워크/미배포) → 데모 모드로 폴백해서 그대로 진입
      if (/fetch|network|failed|load/i.test(msg)) {
        setProfile(trimmed, color);
        login(trimmed, email || `${trimmed}@example.com`);
        nav("/home", { replace: true });
        return;
      }
      setErr("가입 실패: " + msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <StatusBar />
      <AppBar back title="내 행성 만들기" />
      <Body>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18, padding: "20px 0 10px" }}>
          <CapLabel>YOUR PLANET</CapLabel>
          <Planet2D color={color} size={170} />
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>{name.trim() || "이름"}의 행성</h2>
        </div>

        {isSupabaseConfigured && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <label style={{ fontSize: 12, color: "var(--iv-txt2)", fontWeight: 600 }}>이메일 · 비밀번호</label>
            <input
              className="iv-input"
              type="email"
              placeholder="이메일"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              className="iv-input"
              type="password"
              placeholder="비밀번호 (6자 이상)"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
            />
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <label style={{ fontSize: 12, color: "var(--iv-txt2)", fontWeight: 600 }}>닉네임</label>
          <input
            className="iv-input"
            placeholder="이름 또는 닉네임"
            value={name}
            maxLength={12}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ fontSize: 12, color: "var(--iv-txt2)", fontWeight: 600 }}>행성 색</label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10 }}>
            {COLORS.map((c) => {
              const def = PLANET_COLORS[c];
              const active = c === color;
              return (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  aria-label={def.label}
                  aria-pressed={active}
                  style={{
                    width: "100%",
                    aspectRatio: "1 / 1",
                    borderRadius: "50%",
                    border: active ? `2px solid ${def.mid}` : "1px solid rgba(255,255,255,.1)",
                    boxShadow: active ? `0 0 0 3px ${def.mid}33, 0 0 20px -6px ${def.glow}` : "none",
                    background: `radial-gradient(circle at 30% 25%, ${def.hi}, ${def.mid} 55%, ${def.lo} 100%)`,
                    cursor: "pointer",
                    padding: 0,
                  }}
                />
              );
            })}
          </div>
        </div>

        <p style={{ fontSize: 11.5, color: "var(--iv-txt3)", lineHeight: 1.6, marginTop: 4 }}>
          행성은 당신의 감정에 따라 색과 모양이 변해요. 처음 색은 언제든 바꿀 수 있어요.
        </p>

        {err && <p style={{ fontSize: 12, color: "#e8744e", marginTop: 4 }}>{err}</p>}
        <div style={{ marginTop: "auto", paddingTop: 16 }}>
          <Button block onClick={onSubmit} disabled={busy}>
            {busy ? "행성 만드는 중…" : "행성 만들기"}
          </Button>
        </div>
      </Body>
    </>
  );
}
