-- ── 레벨/별조각 ────────────────────────────────────────────
-- 시작 레벨을 0으로 통일하고(0003의 목업 기본값 7 제거),
-- 별조각 사용처·구독 플랜 컬럼을 profiles에 추가한다.

alter table public.profiles alter column level    set default 0;
alter table public.profiles alter column stardust set default 0;

alter table public.profiles add column if not exists level_exp      int  default 0;   -- 현재 레벨 구간에 투자된 별조각
alter table public.profiles add column if not exists mileage_earned int  default 0;   -- 누적 획득량(감소하지 않음)
alter table public.profiles add column if not exists discount_won   int  default 0;   -- 교환해 둔 구독 할인 적립금(원)
alter table public.profiles add column if not exists mileage_use    text default 'level'
  check (mileage_use in ('level', 'discount'));
alter table public.profiles add column if not exists plan           text default 'free'
  check (plan in ('free', 'plus'));

-- 기존 행에 남은 목업 기본값 정리.
-- level_exp가 없는(= 이 기능 이전에 만들어진) 행만 대상으로 하므로
-- 이미 성장 기록이 있는 계정은 건드리지 않는다.
update public.profiles
   set level = 0, level_exp = 0
 where level = 7
   and coalesce(level_exp, 0) = 0;

update public.profiles
   set stardust = 0
 where stardust = 132
   and coalesce(mileage_earned, 0) = 0;
