-- 0013_anon_safe_profile_trigger.sql
-- 익명 로그인(signInAnonymously)이 "Database error creating anonymous user"(500) 로
-- 실패하는 문제 수정.
--
-- 원인
--   0003 의 handle_new_user() 는 가입 직후 profiles 행을 만들 때
--     nickname    = coalesce(meta.nickname, split_part(new.email, '@', 1))
--     planet_name = coalesce(meta.nickname, '나') || '의 행성'
--   를 쓰는데, 익명 유저는 email 이 NULL 이라 split_part(...) 도 NULL 이 된다.
--   profiles.nickname 에 NOT NULL / UNIQUE 등 제약이 있으면 insert 가 터지고,
--   트리거 예외는 auth.users insert 자체를 롤백시켜 익명 가입이 500 으로 끝난다.
--   (이메일 가입은 email 이 있어 정상 → 익명만 실패하는 증상과 일치)
--
-- 수정
--   · nickname 이 비면 'user' 으로, planet_name 도 그에 맞춰 채운다.
--   · 트리거 안의 어떤 예외도 가입을 막지 못하게 exception 블록으로 감싼다.
--     (프로필이 없어도 앱은 seed_demo_universe()/saveProgress 의 upsert 로 복구한다)
--
-- 실행: Supabase SQL Editor 에 그대로 붙여넣기. 멱등.

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  nick text := coalesce(
    nullif(new.raw_user_meta_data->>'nickname', ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'user'
  );
begin
  begin
    insert into public.profiles (id, email, nickname, planet_name)
    values (new.id, new.email, nick, nick || '의 행성')
    on conflict (id) do nothing;
  exception when others then
    -- 프로필 생성 실패가 가입 자체를 막으면 안 된다. 로그만 남긴다.
    raise warning 'handle_new_user: profiles insert skipped for % (%)', new.id, sqlerrm;
  end;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
