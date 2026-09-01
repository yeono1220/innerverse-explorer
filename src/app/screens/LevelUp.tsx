// 23 · 레벨업 축하 (성장 모먼트 + 컨페티)
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { StatusBar, Body } from "../ui/layout";
import { Button, CapLabel } from "../ui/primitives";
import { HomeAvatarStage } from "../ui/HomeAvatarStage";
import { useUserStore } from "@/store/userStore";
import { useAppStore } from "@/store/appStore";

export default function LevelUp() {
  const nav = useNavigate();
  const loc = useLocation();
  const user = useUserStore();
  const clearLevelUp = useUserStore((s) => s.clearLevelUp);
  // 진입 시점의 레벨을 고정해 두고(스토어를 즉시 비우므로) 축하 문구에 사용.
  const reached = useRef<number>(useUserStore.getState().pendingLevelUp ?? user.level);
  const back = (loc.state as { from?: string } | null)?.from ?? "/home";

  const [reward, setReward] = useState<{ name: string; emoji: string } | null>(null);

  useEffect(() => {
    document.body.classList.add("iv-confetti-host");
    if (useUserStore.getState().pendingLevelUp != null) {
      setReward(useAppStore.getState().grantLevelReward()); // 레벨업 보상 데코 1종
      clearLevelUp(); // 신호 소비 — 되돌아가도 다시 튀지 않게
    }
    return () => document.body.classList.remove("iv-confetti-host");
  }, [clearLevelUp]);

  return (
    <>
      <StatusBar />
      <Body>
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            gap: 20,
            padding: 20,
            position: "relative",
          }}
        >
          {Array.from({ length: 24 }).map((_, i) => (
            <span
              key={i}
              style={{
                position: "absolute",
                top: `${Math.random() * 90}%`,
                left: `${Math.random() * 90}%`,
                fontSize: 14 + Math.random() * 14,
                animation: `iv-fall ${1.5 + Math.random() * 2.2}s ease-out infinite`,
                animationDelay: `${Math.random() * 1.5}s`,
                pointerEvents: "none",
              }}
            >
              {["✨", "🌟", "💫", "⭐"][i % 4]}
            </span>
          ))}

          <CapLabel>LEVEL UP</CapLabel>
          <div style={{ animation: "iv-pop 1.8s ease infinite alternate" }}>
            <HomeAvatarStage color={user.planetColor} size={200} rotating />
          </div>
          <div>
            <h1 style={{ fontSize: 30, fontWeight: 800 }}>Lv. {reached.current} 도달!</h1>
            <p style={{ fontSize: 13.5, color: "var(--iv-txt2)", marginTop: 8, lineHeight: 1.6 }}>
              마음을 꾸준히 쌓아온 보상이에요.<br />
              {reward ? (
                <>
                  <b style={{ color: "var(--iv-purple2)" }}>{reward.emoji} {reward.name}</b>이(가) 인벤토리에 추가됐어요.
                </>
              ) : (
                <>다음 레벨에서도 새로운 것이 기다리고 있어요.</>
              )}
            </p>
          </div>
          <Button onClick={() => nav(back, { replace: true })} style={{ minWidth: 200 }}>
            계속하기
          </Button>
        </div>
        <style>{`
          @keyframes iv-fall { from { transform: translateY(-20px) rotate(0deg); opacity:0 } 50%{opacity:1} to { transform: translateY(80px) rotate(360deg); opacity:0 } }
          @keyframes iv-pop { from { transform: scale(1) } to { transform: scale(1.04) } }
        `}</style>
      </Body>
    </>
  );
}
