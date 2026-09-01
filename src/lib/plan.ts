// 무료 / 구독 플랜 정의. 사용량 제한의 단일 출처.

export type Plan = "free" | "plus";

export interface PlanLimits {
  /** 모모챗 하루 사용자 발화 수 */
  chatTurnsPerDay: number;
  /** 일기 주간 작성 수 */
  diaryPerWeek: number;
  /** 주간 리뷰 제공 여부 */
  weeklyReview: boolean;
  /** 장기(월/분기) 패턴 분석 제공 여부 */
  longTermAnalysis: boolean;
  /** 일기 원문 보관 주 수. 무료는 지난 주가 되면 감정 요약만 남는다. */
  rawRetentionWeeks: number;
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: {
    chatTurnsPerDay: 15,
    diaryPerWeek: 5,
    weeklyReview: true,
    longTermAnalysis: false,
    rawRetentionWeeks: 1,
  },
  plus: {
    chatTurnsPerDay: Infinity,
    diaryPerWeek: Infinity,
    weeklyReview: true,
    longTermAnalysis: true,
    rawRetentionWeeks: Infinity,
  },
};

export const PLAN_LABEL: Record<Plan, string> = { free: "무료", plus: "이너버스 플러스" };

/** 구독료(원/월). 별조각 할인은 여기서 차감된다. */
export const PLUS_PRICE_WON = 4900;

export function limitsFor(plan: Plan): PlanLimits {
  return PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;
}

export function isUnlimited(n: number): boolean {
  return !Number.isFinite(n);
}
