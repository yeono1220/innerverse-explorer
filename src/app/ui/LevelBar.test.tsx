import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { LevelBar } from "./LevelBar";
import { useUserStore, DEFAULT_USER } from "@/store/userStore";
import { mileageForNextLevel } from "@/lib/level";

function setUser(patch: Partial<typeof DEFAULT_USER>) {
  window.localStorage.clear();
  useUserStore.setState({ ...DEFAULT_USER, ...patch, pendingLevelUp: null });
}

describe("홈 레벨 스탯바", () => {
  beforeEach(() => setUser({}));

  it("레벨은 보여주되 진행 수치(퍼센트/별조각)는 노출하지 않는다", () => {
    setUser({ level: 3, levelExp: 17 });
    const { container } = render(<LevelBar />);
    expect(screen.getByText("Lv.3")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/%/);
    expect(container.textContent).not.toContain("17");
  });

  it("채워진 정도가 경험치 비율과 일치한다", () => {
    const need = mileageForNextLevel(2); // 30
    setUser({ level: 2, levelExp: need / 2 });
    render(<LevelBar />);
    const fill = screen.getByRole("progressbar").firstElementChild as HTMLElement;
    expect(fill.style.width).toBe("50%");
  });

  it("이제 막 시작한 계정은 Lv.0이고 비어 있다", () => {
    setUser({ level: 0, levelExp: 0 });
    render(<LevelBar />);
    const fill = screen.getByRole("progressbar").firstElementChild as HTMLElement;
    expect(fill.style.width).toBe("0%");
    expect(screen.getByText("Lv.0")).toBeInTheDocument();
  });

  it("할인 모드에서는 성장이 아니라 할인으로 모인다고 알려준다", () => {
    setUser({ mileageUse: "discount" });
    render(<LevelBar />);
    expect(screen.getByText(/구독 할인으로 모이는 중/)).toBeInTheDocument();
  });
});
