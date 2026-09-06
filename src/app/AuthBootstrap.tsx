// Supabase 세션 ↔ userStore/diaryStore 브리지.
// 로그인/세션 복원 시 프로필을 userStore에 채우고 DB 일기를 불러온다.
// Supabase 미설정이면 아무것도 안 함(목업 모드 유지).
import { useEffect } from "react";
import { getSession, onAuthChange } from "@/services/auth";
import { getProfile, saveProgress } from "@/services/profileApi";
import { useUserStore } from "@/store/userStore";
import { useDiaryStore } from "@/store/diaryStore";
import { isSupabaseConfigured } from "@/lib/supabase";
import { START_LEVEL } from "@/lib/level";
import { clearLocalUserData, getLastUid, setLastUid } from "@/store/session";
import type { User } from "@supabase/supabase-js";

export function AuthBootstrap() {
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    let unsubProgress: (() => void) | null = null;
    let timer: number | null = null;

    // 성장 상태가 바뀌면 DB에 반영 (연타 방지를 위해 짧게 디바운스).
    const watchProgress = () => {
      unsubProgress?.();
      unsubProgress = useUserStore.subscribe((s) => {
        if (!s.loggedIn) return;
        if (timer) window.clearTimeout(timer);
        timer = window.setTimeout(() => {
          void saveProgress({
            level: s.level,
            level_exp: s.levelExp,
            streak: s.streak,
            stardust: s.stardust,
            mileage_earned: s.mileageEarned,
            discount_won: s.discountWon,
            mileage_use: s.mileageUse,
            plan: s.plan,
          }).catch(() => {
            /* 0009 마이그레이션 전이면 컬럼이 없어 실패 — 조용히 무시 */
          });
        }, 800);
      });
    };

    const hydrate = async (user: User) => {
      // 계정이 바뀌었으면 이전 사용자의 로컬 흔적(일기·레벨·행성·퀘스트)부터 지운다.
      if (getLastUid() !== user.id) clearLocalUserData();
      setLastUid(user.id);

      try {
        const p = await getProfile();
        if (!active || !p) return;
        // level_exp 컬럼이 있어야 0009 이후 스키마. 그 전 행의 level/stardust는
        // 목업 기본값(7/132)이라 신뢰하지 않고 로컬 상태를 유지한다.
        const migrated = p.level_exp !== undefined && p.level_exp !== null;
        useUserStore.getState().hydrate({
          loggedIn: true,
          name: p.nickname ?? "IEUM",
          email: p.email ?? "",
          planetColor: p.planet_color,
          planetName: p.planet_name ?? `${p.nickname ?? "나"}의 행성`,
          ...(migrated
            ? {
                level: p.level ?? START_LEVEL,
                levelExp: p.level_exp ?? 0,
                streak: p.streak ?? 0,
                stardust: p.stardust ?? 0,
                mileageEarned: p.mileage_earned ?? 0,
                discountWon: p.discount_won ?? 0,
                mileageUse: p.mileage_use ?? "level",
                plan: p.plan ?? "free",
              }
            : {}),
        });
        watchProgress(); // 하이드레이트 이후부터 write-back 시작
      } catch {
        /* 프로필 조회 실패 — 일기 로딩은 아래에서 계속 진행 */
      }
      // 프로필 조회 성공 여부와 무관하게 "내 일기"로 교체한다.
      // (여기서 건너뛰면 화면에 이전 사용자 목록이 남는다)
      if (active) await useDiaryStore.getState().loadFromDb();
    };

    getSession().then((s) => {
      if (s?.user) hydrate(s.user);
    });

    const unsub = onAuthChange((user) => {
      if (user) hydrate(user);
      else {
        unsubProgress?.();
        unsubProgress = null;
        useUserStore.getState().logout();
        // 세션이 끊긴 순간 화면에 남은 개인 데이터도 함께 정리.
        // (로그인 이력이 있을 때만 — 최초 방문의 INITIAL_SESSION(null)까지 지우지 않도록)
        if (getLastUid()) {
          clearLocalUserData();
          setLastUid(null);
        }
      }
    });

    return () => {
      active = false;
      if (timer) window.clearTimeout(timer);
      unsubProgress?.();
      unsub();
    };
  }, []);

  return null;
}
