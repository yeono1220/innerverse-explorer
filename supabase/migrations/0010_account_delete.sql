-- 0010_account_delete.sql
-- 회원 탈퇴: 본인 계정과 본인 데이터 전부를 한 번에 삭제하는 RPC.
--
-- 왜 RPC(security definer)인가
--   auth.users 는 anon/authenticated 롤이 직접 지울 수 없다. 프론트에서 지우려면
--   service_role 키가 필요한데, 그 키를 브라우저에 두면 안 된다.
--   → DB 안에서 "본인(auth.uid())만" 지우는 함수를 두고 실행 권한만 내준다.
--
-- 삭제 범위
--   1) user_id 로 소유가 표시되는 앱 테이블 (있는 것만 골라서)
--   2) 0001 레거시 public.users (하위 소셜 테이블은 FK on delete cascade 로 함께 삭제)
--   3) auth.users 본인 행 → profiles·diary_entries 등 남은 참조도 cascade 로 정리
--
-- 실행: Supabase SQL Editor 에 그대로 붙여넣기. 멱등(재실행 안전).

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  t   text;
  -- user_id 컬럼으로 소유자를 표시하는 테이블들. 마이그레이션이 일부만 적용된
  -- 프로젝트에서도 실패하지 않도록 to_regclass 로 존재하는 것만 지운다.
  owned text[] := array[
    'diary_entries', 'momo_messages', 'user_facts', 'relations', 'body_metrics',
    'emotion_analyses', 'diaries', 'weekly_reviews', 'crisis_events',
    'bookings', 'transactions', 'consents', 'planets'
  ];
begin
  if uid is null then
    raise exception '로그인이 필요합니다.' using errcode = '28000';
  end if;

  foreach t in array owned loop
    if to_regclass('public.' || t) is not null then
      execute format('delete from public.%I where user_id = $1', t) using uid;
    end if;
  end loop;

  -- 0001 레거시 루트(친구·방문·하트·교환일기 등이 여기서 cascade 로 정리된다)
  if to_regclass('public.users') is not null then
    execute 'delete from public.users where id = $1' using uid;
  end if;

  if to_regclass('public.profiles') is not null then
    delete from public.profiles where id = uid;
  end if;

  -- 계정 자체. auth.identities / auth.sessions / refresh_token 도 함께 정리된다.
  delete from auth.users where id = uid;
end;
$$;

-- 함수 소유자는 auth 스키마 권한이 있는 postgres 여야 한다(SQL Editor 실행 시 기본값).
alter function public.delete_own_account() owner to postgres;

revoke all on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;

comment on function public.delete_own_account() is
  '본인(auth.uid()) 계정과 소유 데이터 전체를 삭제한다. authenticated 롤만 실행 가능.';
