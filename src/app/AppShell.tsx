// 화면 외각 폰 프레임. 모든 화면 공통.
import { Outlet } from "react-router-dom";
import { PhoneFrame } from "./ui/layout";
import { LevelUpWatcher } from "./LevelUpWatcher";

export function AppShell() {
  return (
    <PhoneFrame>
      <LevelUpWatcher />
      <Outlet />
    </PhoneFrame>
  );
}
