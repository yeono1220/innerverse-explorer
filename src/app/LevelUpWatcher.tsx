// 레벨업이 발생하면(어느 화면에서 퀘스트를 달성했든) 축하 화면으로 보낸다.
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useUserStore } from "@/store/userStore";

const SKIP = ["/", "/login", "/signup", "/levelup"];

export function LevelUpWatcher() {
  const nav = useNavigate();
  const loc = useLocation();
  const pending = useUserStore((s) => s.pendingLevelUp);

  useEffect(() => {
    if (pending == null) return;
    if (SKIP.includes(loc.pathname)) return;
    nav("/levelup", { state: { from: loc.pathname } });
  }, [pending, loc.pathname, nav]);

  return null;
}
