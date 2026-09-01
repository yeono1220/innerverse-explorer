import { describe, it, expect, beforeEach } from "vitest";
import { useUserStore, DEFAULT_USER, todayStr, weekKey, REWARDS } from "./userStore";
import { useUsageStore } from "./usageStore";
import { PLAN_LIMITS } from "@/lib/plan";
import { mileageForNextLevel, START_LEVEL } from "@/lib/level";

function resetUser(patch: Partial<typeof DEFAULT_USER> = {}) {
  window.localStorage.clear();
  useUserStore.setState({ ...DEFAULT_USER, ...patch, pendingLevelUp: null });
}

function resetUsage() {
  useUsageStore.setState({ day: todayStr(), chatTurns: 0, week: weekKey(), diaryCount: 0 });
}

describe("신규 가입 기본값", () => {
  beforeEach(() => resetUser());

  it("회원가입 직후에는 Lv.0에서 시작한다", () => {
    const s = useUserStore.getState();
    expect(s.level).toBe(0);
    expect(s.levelExp).toBe(0);
    expect(s.stardust).toBe(0);
    expect(s.streak).toBe(0);
    expect(s.plan).toBe("free");
    expect(s.mileageUse).toBe("level");
  });
});

describe("별조각 적립 — 성장(레벨업) 선택", () => {
  beforeEach(() => resetUser({ mileageUse: "level" }));

  it("퀘스트 보상이 즉시 성장에 투자된다", () => {
    const gained = useUserStore.getState().earnMileage(12);
    const s = useUserStore.getState();
    expect(gained).toBe(0);
    expect(s.level).toBe(0);
    expect(s.levelExp).toBe(12);
    expect(s.stardust).toBe(0); // 전액 투자되어 잔액 없음
    expect(s.mileageEarned).toBe(12);
  });

  it("요구량을 채우면 레벨이 오르고 축하 신호가 남는다", () => {
    const gained = useUserStore.getState().earnMileage(mileageForNextLevel(START_LEVEL) + 5);
    const s = useUserStore.getState();
    expect(gained).toBe(1);
    expect(s.level).toBe(1);
    expect(s.levelExp).toBe(5);
    expect(s.pendingLevelUp).toBe(1);
  });

  it("clearLevelUp 후에는 신호가 사라진다", () => {
    useUserStore.getState().earnMileage(mileageForNextLevel(START_LEVEL));
    useUserStore.getState().clearLevelUp();
    expect(useUserStore.getState().pendingLevelUp).toBeNull();
  });

  it("0 이하 적립은 무시된다", () => {
    useUserStore.getState().earnMileage(0);
    useUserStore.getState().earnMileage(-5);
    expect(useUserStore.getState().mileageEarned).toBe(0);
  });
});

describe("별조각 적립 — 구독 할인 선택", () => {
  beforeEach(() => resetUser({ mileageUse: "discount" }));

  it("레벨에 투자되지 않고 잔액으로 쌓인다", () => {
    useUserStore.getState().earnMileage(120);
    const s = useUserStore.getState();
    expect(s.level).toBe(0);
    expect(s.levelExp).toBe(0);
    expect(s.stardust).toBe(120);
  });

  it("잔액을 할인 적립금으로 교환한다", () => {
    useUserStore.getState().earnMileage(250);
    const spent = useUserStore.getState().redeemMileage(200);
    const s = useUserStore.getState();
    expect(spent).toBe(200);
    expect(s.stardust).toBe(50);
    expect(s.discountWon).toBe(2000);
  });

  it("잔액이 모자라면 교환되지 않는다", () => {
    useUserStore.getState().earnMileage(30);
    expect(useUserStore.getState().redeemMileage(100)).toBe(0);
    expect(useUserStore.getState().stardust).toBe(30);
  });

  it("사용처를 성장으로 바꾸면 모아둔 잔액이 한 번에 투자된다", () => {
    const twoLevels = mileageForNextLevel(START_LEVEL) + mileageForNextLevel(START_LEVEL + 1);
    useUserStore.getState().earnMileage(twoLevels + 10);
    useUserStore.getState().setMileageUse("level");
    const s = useUserStore.getState();
    expect(s.level).toBe(2);
    expect(s.levelExp).toBe(10);
    expect(s.stardust).toBe(0);
  });
});

describe("잔액 소모(인벤토리)", () => {
  beforeEach(() => resetUser({ mileageUse: "discount" }));

  it("잔액이 충분하면 차감된다", () => {
    useUserStore.getState().earnMileage(100);
    expect(useUserStore.getState().spendMileage(30)).toBe(true);
    expect(useUserStore.getState().stardust).toBe(70);
  });

  it("잔액이 모자라면 실패하고 잔액은 그대로", () => {
    useUserStore.getState().earnMileage(10);
    expect(useUserStore.getState().spendMileage(30)).toBe(false);
    expect(useUserStore.getState().stardust).toBe(10);
  });
});

describe("출석 보상", () => {
  beforeEach(() => resetUser({ mileageUse: "discount" }));

  it("첫 출석은 1일차 보상을 별조각으로 지급한다", () => {
    expect(useUserStore.getState().claimDailyReward()).toBe(true);
    const s = useUserStore.getState();
    expect(s.streak).toBe(1);
    expect(s.stardust).toBe(REWARDS[0]);
  });

  it("같은 날 두 번째 수령은 거절된다", () => {
    useUserStore.getState().claimDailyReward();
    const before = useUserStore.getState().stardust;
    expect(useUserStore.getState().claimDailyReward()).toBe(false);
    expect(useUserStore.getState().stardust).toBe(before);
  });
});

describe("무료 / 구독 사용량 제한", () => {
  beforeEach(() => {
    resetUser({ plan: "free" });
    resetUsage();
  });

  it("무료는 모모챗 하루 15턴까지", () => {
    const max = PLAN_LIMITS.free.chatTurnsPerDay;
    expect(max).toBe(15);
    for (let i = 0; i < max; i += 1) expect(useUsageStore.getState().consumeChatTurn()).toBe(true);
    expect(useUsageStore.getState().chatLeft()).toBe(0);
    expect(useUsageStore.getState().consumeChatTurn()).toBe(false);
  });

  it("무료는 일기 주 5개까지", () => {
    const max = PLAN_LIMITS.free.diaryPerWeek;
    expect(max).toBe(5);
    for (let i = 0; i < max; i += 1) expect(useUsageStore.getState().consumeDiary()).toBe(true);
    expect(useUsageStore.getState().consumeDiary()).toBe(false);
  });

  it("구독자는 무제한", () => {
    useUserStore.setState({ plan: "plus" });
    for (let i = 0; i < 50; i += 1) expect(useUsageStore.getState().consumeChatTurn()).toBe(true);
    expect(useUsageStore.getState().canChat()).toBe(true);
    expect(useUsageStore.getState().chatLeft()).toBe(Infinity);
    expect(useUsageStore.getState().diaryLeft()).toBe(Infinity);
  });

  it("날짜가 바뀌면 채팅 카운터가 리셋된다", () => {
    useUsageStore.getState().consumeChatTurn();
    useUsageStore.setState({ day: "2000-01-01" });
    useUsageStore.getState().ensureFresh();
    expect(useUsageStore.getState().chatTurns).toBe(0);
  });

  it("주가 바뀌면 일기 카운터가 리셋된다", () => {
    useUsageStore.getState().consumeDiary();
    useUsageStore.setState({ week: "2000-01-03" });
    useUsageStore.getState().ensureFresh();
    expect(useUsageStore.getState().diaryCount).toBe(0);
  });

  it("무료는 장기 패턴 분석이 잠겨 있다", () => {
    expect(PLAN_LIMITS.free.longTermAnalysis).toBe(false);
    expect(PLAN_LIMITS.free.weeklyReview).toBe(true);
    expect(PLAN_LIMITS.free.rawRetentionWeeks).toBe(1); // 다음 주가 되면 감정 요약만 남음
    expect(PLAN_LIMITS.plus.longTermAnalysis).toBe(true);
  });
});

describe("주 식별자(월요일 시작)", () => {
  it("같은 주의 월~일은 같은 키", () => {
    expect(weekKey("2026-08-31")).toBe("2026-08-31"); // 월요일
    expect(weekKey("2026-09-06")).toBe("2026-08-31"); // 일요일
  });
  it("다음 월요일은 다른 키", () => {
    expect(weekKey("2026-09-07")).toBe("2026-09-07");
  });
});
