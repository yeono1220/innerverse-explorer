import { describe, it, expect } from "vitest";
import {
  MAX_LEVEL,
  START_LEVEL,
  mileageForNextLevel,
  totalMileageForLevel,
  levelProgress,
  invest,
  redeemDiscount,
  LEVEL_COST_SCALE,
  DISCOUNT_STEP,
  DISCOUNT_CAP_WON,
  WON_PER_MILEAGE,
} from "./level";

describe("레벨 커브", () => {
  it("현재 난이도(기본 커브 x1.7)의 요구량", () => {
    expect(LEVEL_COST_SCALE).toBe(1.7);
    expect(mileageForNextLevel(0)).toBe(34); // 20 x 1.7
    expect(mileageForNextLevel(1)).toBe(51); // 30 x 1.7
    expect(mileageForNextLevel(7)).toBe(153); // 90 x 1.7
  });

  it("배율과 무관하게 레벨마다 요구량이 늘어난다", () => {
    for (let l = 0; l < 15; l += 1) {
      expect(mileageForNextLevel(l + 1)).toBeGreaterThan(mileageForNextLevel(l));
    }
  });

  it("요구량은 상한에서 멈춘다", () => {
    const cap = Math.round(200 * LEVEL_COST_SCALE);
    expect(mileageForNextLevel(18)).toBe(cap);
    expect(mileageForNextLevel(25)).toBe(cap);
  });

  it("만렙은 더 오를 수 없다", () => {
    expect(mileageForNextLevel(MAX_LEVEL)).toBe(Infinity);
  });

  it("누적 요구량은 각 레벨 요구량의 합", () => {
    expect(totalMileageForLevel(0)).toBe(0);
    expect(totalMileageForLevel(1)).toBe(mileageForNextLevel(0));
    expect(totalMileageForLevel(2)).toBe(mileageForNextLevel(0) + mileageForNextLevel(1));
    expect(totalMileageForLevel(3)).toBeGreaterThan(totalMileageForLevel(2));
  });
});

describe("진행도(스탯바)", () => {
  it("시작 레벨은 Lv.0이고 0% 채움", () => {
    const p = levelProgress(START_LEVEL, 0);
    expect(p.level).toBe(0);
    expect(p.ratio).toBe(0);
    expect(p.isMax).toBe(false);
  });

  it("절반 쌓이면 0.5", () => {
    const need = mileageForNextLevel(START_LEVEL);
    expect(levelProgress(START_LEVEL, need / 2).ratio).toBeCloseTo(0.5);
  });

  it("요구량을 넘겨도 1을 넘지 않는다", () => {
    expect(levelProgress(START_LEVEL, 999).ratio).toBe(1);
  });

  it("만렙은 가득 찬 상태", () => {
    const p = levelProgress(MAX_LEVEL, 0);
    expect(p.isMax).toBe(true);
    expect(p.ratio).toBe(1);
  });
});

describe("별조각 투자 → 레벨업", () => {
  it("요구량 미만이면 레벨은 그대로, 경험치만 쌓인다", () => {
    const r = invest(START_LEVEL, 0, 100, 12);
    expect(r.level).toBe(0);
    expect(r.exp).toBe(12);
    expect(r.balance).toBe(88);
    expect(r.levelsGained).toBe(0);
  });

  it("요구량을 채우면 레벨이 오르고 나머지는 이월된다", () => {
    const need = mileageForNextLevel(START_LEVEL);
    const r = invest(START_LEVEL, 0, 500, need + 5);
    expect(r.level).toBe(1);
    expect(r.exp).toBe(5);
    expect(r.levelsGained).toBe(1);
  });

  it("요구량에 한 개 모자라면 오르지 않는다", () => {
    const need = mileageForNextLevel(START_LEVEL);
    const r = invest(START_LEVEL, 0, 500, need - 1);
    expect(r.level).toBe(START_LEVEL);
    expect(r.levelsGained).toBe(0);
  });

  it("한 번에 여러 레벨이 오를 수 있다", () => {
    const three = mileageForNextLevel(0) + mileageForNextLevel(1) + mileageForNextLevel(2);
    const r = invest(START_LEVEL, 0, 1000, three);
    expect(r.level).toBe(3);
    expect(r.exp).toBe(0);
    expect(r.levelsGained).toBe(3);
  });

  it("잔액보다 많이 투자할 수 없다", () => {
    const r = invest(START_LEVEL, 0, 5, 100);
    expect(r.invested).toBe(5);
    expect(r.balance).toBe(0);
    expect(r.exp).toBe(5);
  });

  it("잔액이 0이면 아무 일도 없다", () => {
    const r = invest(3, 7, 0, 50);
    expect(r).toMatchObject({ level: 3, exp: 7, balance: 0, invested: 0, levelsGained: 0 });
  });

  it("음수 투자는 무시된다", () => {
    const r = invest(2, 4, 30, -10);
    expect(r).toMatchObject({ level: 2, exp: 4, balance: 30, levelsGained: 0 });
  });

  it("만렙 도달 후 남은 별조각은 환급된다", () => {
    const r = invest(MAX_LEVEL - 1, 0, 1000, 1000);
    expect(r.level).toBe(MAX_LEVEL);
    expect(r.exp).toBe(0);
    expect(r.balance).toBeGreaterThan(0);
    expect(r.balance).toBe(1000 - mileageForNextLevel(MAX_LEVEL - 1));
  });

  it("만렙에서는 더 이상 투자되지 않는다", () => {
    const r = invest(MAX_LEVEL, 0, 500, 500);
    expect(r.level).toBe(MAX_LEVEL);
    expect(r.balance).toBe(500);
    expect(r.levelsGained).toBe(0);
  });

  it("매일 같은 양을 모으면 레벨은 점점 천천히 오른다", () => {
    const perDay = 25;
    let st = { level: START_LEVEL, exp: 0 };
    const daysToReach: number[] = [];
    let target = 1;
    for (let day = 1; day <= 30 && target <= 3; day += 1) {
      const r = invest(st.level, st.exp, perDay, perDay);
      st = { level: r.level, exp: r.exp };
      while (target <= st.level) {
        daysToReach.push(day);
        target += 1;
      }
    }
    expect(daysToReach).toHaveLength(3);
    expect(daysToReach[1] - daysToReach[0]).toBeGreaterThanOrEqual(1);
    expect(daysToReach[2] - daysToReach[1]).toBeGreaterThanOrEqual(daysToReach[1] - daysToReach[0]);
  });
});

describe("구독 할인 교환", () => {
  it("100 별조각 = 1,000원", () => {
    const r = redeemDiscount(300, 0, DISCOUNT_STEP);
    expect(r.spent).toBe(100);
    expect(r.discountWon).toBe(100 * WON_PER_MILEAGE);
    expect(r.balance).toBe(200);
  });

  it("교환 단위 미만은 교환되지 않는다", () => {
    const r = redeemDiscount(90, 0, 90);
    expect(r.spent).toBe(0);
    expect(r.balance).toBe(90);
  });

  it("단위 아래로 내림 처리된다", () => {
    const r = redeemDiscount(500, 0, 250);
    expect(r.spent).toBe(200);
  });

  it("월 한도를 넘겨 적립되지 않는다", () => {
    const r = redeemDiscount(10000, 0, 10000);
    expect(r.discountWon).toBeLessThanOrEqual(DISCOUNT_CAP_WON);
  });

  it("한도에 도달하면 더 교환되지 않는다", () => {
    const r = redeemDiscount(1000, DISCOUNT_CAP_WON, 500);
    expect(r.spent).toBe(0);
    expect(r.balance).toBe(1000);
  });
});
