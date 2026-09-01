// 01 · 로그인 로직 (카카오 OAuth + 이메일/비밀번호 + 데모 폴백)
// Login.tsx 옆에 분리한 "별도 로그인 로직" — 화면(Login.tsx)은 표현만, 로직은 여기서 담당.
//
//  · Supabase 설정됨  → 카카오는 OAuth 리다이렉트, 이메일은 비밀번호 로그인.
//  · Supabase 미설정(또는 서버 미연결) → 데모 모드로 즉시 진입 (기존 목업 동작 보존).
//
// 라우트 가드가 없는 SPA라, OAuth 후 /home 으로 복귀하면 AuthBootstrap이
// 세션→프로필을 하이드레이트한다. (vercel.json 의 SPA rewrite 로 딥링크 복귀 OK)
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useUserStore } from "@/store/userStore";
import { signInWithPassword } from "@/services/auth";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";

// OAuth 후 돌아올 주소. 배포/로컬 모두 현재 origin 기준으로 자동 결정.
const oauthRedirect = () => `${window.location.origin}/home`;

// "서버에 못 닿음"(네트워크/미배포) 류 에러 → 데모로 폴백 (기존 화면과 동일 판정).
const isOffline = (msg: string) => /fetch|network|failed|load/i.test(msg);

export function useLoginActions() {
  const nav = useNavigate();
  const login = useUserStore((s) => s.login);
  const name = useUserStore((s) => s.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const goHome = () => nav("/home", { replace: true });
  const demoLogin = (displayName: string, email = "") => {
    login(displayName || name || "IEUM", email);
    goHome();
  };

  /** 카카오로 시작 — 설정 시 OAuth 리다이렉트, 미설정 시 데모 진입. */
  const loginWithKakao = async () => {
    setError(null);

    // 데모 모드: 실제 OAuth 불가 → 즉시 데모 로그인
    if (!isSupabaseConfigured) {
      demoLogin("카카오 사용자");
      return;
    }

    setBusy(true);
    try {
      const { error: oauthError } = await getSupabase().auth.signInWithOAuth({
        provider: "kakao",
        options: { redirectTo: oauthRedirect() },
      });
      if (oauthError) throw oauthError;
      // 성공 시 브라우저가 카카오로 리다이렉트됨 → 이 아래는 실행되지 않음.
    } catch (e) {
      const msg = (e as Error)?.message || "";
      if (isOffline(msg)) {
        demoLogin("카카오 사용자");
        return;
      }
      // 대표적으로 provider 미활성화("Unsupported provider") 등 설정 이슈
      setError("카카오 로그인을 쓰려면 Supabase에서 카카오 provider를 활성화해야 해요.");
      setBusy(false);
    }
  };

  /** 이메일/비밀번호 로그인 — 설정 시 Supabase, 미설정/서버 미연결 시 데모. */
  const loginWithEmail = async (email: string, pw: string) => {
    const em = email.trim();
    if (!em) return;
    setError(null);

    if (!isSupabaseConfigured) {
      demoLogin(em.split("@")[0], em);
      return;
    }

    setBusy(true);
    try {
      await signInWithPassword(em, pw);
      goHome();
    } catch (e) {
      const msg = (e as Error)?.message || "";
      if (isOffline(msg)) {
        demoLogin(em.split("@")[0], em);
        return;
      }
      setError("로그인 실패 — 이메일/비밀번호를 확인하거나 회원가입해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  return { busy, error, setError, loginWithKakao, loginWithEmail };
}
