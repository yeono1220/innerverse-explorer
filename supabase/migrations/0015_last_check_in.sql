-- 0015_last_check_in.sql
-- 출석(연속 n일)의 "마지막 출석일"을 DB에 둔다.
--
-- 배경
--   profiles.streak(연속 일수)은 저장되지만 userStore.lastCheckIn(마지막 출석 날짜)은
--   localStorage 에만 있었다. 다른 기기/새 브라우저에서 streak 만 복원되면
--   "어제 출석했는지"를 알 수 없어 다음 출석 때 연속이 끊긴 것으로 판정돼 1로 리셋된다.
--   시드 프로필(streak=5)을 받은 데모 방문자가 출석 버튼을 누르면 5→1 로 떨어지는 문제.
--
-- 수정
--   · profiles.last_check_in (date) 추가. 프론트 saveProgress/hydrate 가 함께 다룬다.
--   · 시드 RPC 가 last_check_in = 어제 로 넣어 첫 출석이 5→6 으로 자연스럽게 이어지게 한다
--     (seed_demo_universe 본문은 0012 에 있으므로 여기서는 컬럼만 추가하고,
--      0012 를 다시 실행해 RPC 를 갱신한다).
--
-- 실행: Supabase SQL Editor. 멱등.

alter table public.profiles add column if not exists last_check_in date;

comment on column public.profiles.last_check_in is
  '마지막 출석(일일 보상 수령) 날짜. streak 와 함께 연속 여부 판정에 쓴다.';
