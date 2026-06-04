import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { useGrowthPreview } from "@/glass-momo/growthStages";

// jsdom has no WebGL, so stub the 3D mascot (react-three-fiber Canvas) for these
// content/routing smoke tests. The component itself is verified via the build.
vi.mock("@/glass-momo/MomoOrb", () => ({
  MomoOrb: () => null,
}));
vi.mock("@/glass-momo/GalaxyExplorer", () => ({
  GalaxyExplorer: () => null,
}));

import Landing from "@/pages/Landing";

// jsdom lacks IntersectionObserver, which framer-motion's whileInView relies on.
beforeAll(() => {
  class IO {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
    takeRecords = vi.fn(() => []);
    root = null;
    rootMargin = "";
    thresholds = [];
  }
  vi.stubGlobal("IntersectionObserver", IO);
});

function renderLanding() {
  return render(
    <MemoryRouter>
      <Landing />
    </MemoryRouter>,
  );
}

describe("Landing page", () => {
  beforeEach(() => {
    // reset the shared growth preview store between tests
    useGrowthPreview.getState().setPreview(null);
  });

  it("mounts without crashing and shows the hero headline", () => {
    renderLanding();
    expect(screen.getByText(/3D 메타버스 멘탈 헬스케어/)).toBeInTheDocument();
  });

  it("renders the three business-model pillars", () => {
    renderLanding();
    expect(screen.getByText("프리미엄 구독")).toBeInTheDocument();
    expect(screen.getByText("비대면 진료 중개 수수료")).toBeInTheDocument();
    expect(screen.getByText("소셜 아이템 · 입장료")).toBeInTheDocument();
  });

  it("renders both product sections", () => {
    renderLanding();
    // appears in both the pivot pillars and the product deep-dive sections
    expect(screen.getAllByText("닥터 컨텍").length).toBeGreaterThan(0);
    expect(screen.getAllByText("소셜 탐사").length).toBeGreaterThan(0);
  });

  it("links the primary CTA to the /experience route", () => {
    renderLanding();
    const ctas = screen.getAllByRole("link", { name: /나의 행성 만들기|체험/ });
    expect(ctas.length).toBeGreaterThan(0);
    expect(
      ctas.some((a) => a.getAttribute("href") === "/experience"),
    ).toBe(true);
  });

  it("shows the 7-day growth scrubber, defaulting to DAY 7 · 광휘", () => {
    renderLanding();
    expect(screen.getByText(/DAY 7 · 광휘/)).toBeInTheDocument();
    // 7 stage buttons
    for (let n = 1; n <= 7; n++) {
      expect(screen.getByRole("button", { name: new RegExp(`DAY ${n}`) })).toBeInTheDocument();
    }
  });

  it("scrubs the momo growth stage when a day chip is clicked", () => {
    renderLanding();
    fireEvent.click(screen.getByRole("button", { name: /DAY 1 씨앗/ }));
    expect(screen.getByText(/DAY 1 · 씨앗/)).toBeInTheDocument();
    expect(useGrowthPreview.getState().preview).toBe(1);
  });
});
