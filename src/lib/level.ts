// 레벨 · 별조각 코어 로직 (순수 함수).
// store와 화면이 공유하는 단일 출처. 여기에만 성장 커브를 둔다.

/** 레벨 상한. 도달 후 투입된 별조각은 잔액으로 환급된다. */
export const MAX_LEVEL = 30;

/** 회원가입 직후 시작 레벨. 앱·DB 모두 0으로 통일(이전 목업값 7 제거). */
export const START_LEVEL = 0;

/**
 * 성장 난이도 배율. 모든 레벨의 요구량에 동일하게 곱해진다.
 * 1.7 = 기본 커브 대비 70% 상향. 페이스만 조절하려면 이 값만 바꾸면 된다.
 */
export const LEVEL_COST_SCALE = 1.7;

/**
 * Lv.L → Lv.L+1 로 올라가는 데 필요한 별조각. (L은 0부터)
 * 기본 커브는 Lv.0→1이 20이고 레벨마다 +10, 200에서 상한.
 * 여기에 LEVEL_COST_SCALE을 곱한 값이 실제 요구량 (현재 34에서 시작, 상한 340).
 */
export function mileageForNextLevel(level: number): number {
  if (level >= MAX_LEVEL) return Infinity;
  const l = Math.max(START_LEVEL, Math.floor(level));
  const base = Math.min(20 + l * 10, 200);
  return Math.round(base * LEVEL_COST_SCALE);
}

/** Lv.0부터 해당 레벨까지 도달하는 데 든 총 별조각 (통계/표시용). */
export function totalMileageForLevel(level: number): number {
  let sum = 0;
  for (let l = START_LEVEL; l < Math.min(level, MAX_LEVEL); l += 1) sum += mileageForNextLevel(l);
  return sum;
}

export interface LevelProgress {
  level: number;
  /** 현재 레벨 구간에 쌓인 경험치 */
  exp: number;
  /** 다음 레벨까지 필요한 총량 (만렙이면 0) */
  need: number;
  /** 0~1. 홈 스탯바의 "채워진 정도" — 화면에는 수치로 노출하지 않는다. */
  ratio: number;
  isMax: boolean;
}

/** 스탯바 표시에 필요한 값 계산. */
export function levelProgress(level: number, exp: number): LevelProgress {
  const isMax = level >= MAX_LEVEL;
  if (isMax) return { level: MAX_LEVEL, exp: 0, need: 0, ratio: 1, isMax: true };
  const need = mileageForNextLevel(level);
  const e = Math.max(0, Math.min(exp, need));
  return { level, exp: e, need, ratio: need > 0 ? e / need : 0, isMax: false };
}

export interface InvestResult {
  level: number;
  exp: number;
  /** 투자 후 남은 별조각 잔액 */
  balance: number;
  /** 실제로 성장에 쓰인 양 (만렙 환급분 제외) */
  invested: number;
  levelsGained: number;
}

/**
 * 잔액에서 별조각을 성장(레벨)에 투자한다.
 * - 잔액보다 많이 투자할 수 없다.
 * - 한 번에 여러 레벨이 오를 수 있다.
 * - 만렙 도달 시 남은 경험치는 잔액으로 환급.
 */
export function invest(level: number, exp: number, balance: number, amount: number): InvestResult {
  const bal = Math.max(0, Math.floor(balance));
  const use = Math.max(0, Math.min(Math.floor(amount), bal));
  let lv = Math.max(START_LEVEL, Math.floor(level));
  let ex = Math.max(0, Math.floor(exp)) + use;
  let gained = 0;

  while (lv < MAX_LEVEL) {
    const need = mileageForNextLevel(lv);
    if (ex < need) break;
    ex -= need;
    lv += 1;
    gained += 1;
  }

  let refund = 0;
  if (lv >= MAX_LEVEL) {
    refund = ex;
    ex = 0;
  }

  return {
    level: lv,
    exp: ex,
    balance: bal - use + refund,
    invested: use - refund,
    levelsGained: gained,
  };
}

// ── 구독 할인 교환 ────────────────────────────────────────────
/** 별조각 1 = 10원. */
export const WON_PER_MILEAGE = 10;
/** 교환 단위 (100 별조각 = 1,000원). */
export const DISCOUNT_STEP = 100;
/** 월 최대 할인 한도(원). 구독료를 넘겨 적립되지 않게 한다. */
export const DISCOUNT_CAP_WON = 4000;

export interface RedeemResult {
  balance: number;
  discountWon: number;
  /** 실제로 소모된 별조각 */
  spent: number;
}

/**
 * 별조각을 구독 할인 적립금으로 교환한다.
 * DISCOUNT_STEP 단위로 내림 처리하고, 월 한도를 넘는 만큼은 교환하지 않는다.
 */
export function redeemDiscount(balance: number, discountWon: number, amount: number): RedeemResult {
  const bal = Math.max(0, Math.floor(balance));
  const cur = Math.max(0, Math.floor(discountWon));
  const room = Math.max(0, DISCOUNT_CAP_WON - cur);
  const maxByRoom = Math.floor(room / WON_PER_MILEAGE);
  const want = Math.min(Math.floor(amount), bal, maxByRoom);
  const spent = Math.floor(want / DISCOUNT_STEP) * DISCOUNT_STEP;
  if (spent <= 0) return { balance: bal, discountWon: cur, spent: 0 };
  return { balance: bal - spent, discountWon: cur + spent * WON_PER_MILEAGE, spent };
}
