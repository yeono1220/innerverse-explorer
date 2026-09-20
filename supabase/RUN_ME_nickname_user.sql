-- 시드 닉네임 이음 → user. SQL Editor 에 붙여넣고 Run (경고 뜨면 Run query). 멱등.

-- ==== 0013_anon_safe_profile_trigger.sql ====
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


-- ==== 0012_anon_demo_seed.sql ====
-- 0012_anon_demo_seed.sql
-- 익명(데모) 방문자용 "숨은 로그인 + 시드 우주".
--
-- 배경
--   심사/데모에서는 로그인 화면 없이 바로 앱을 보여줘야 한다. 그래서 프론트는
--   Supabase 익명 로그인(signInAnonymously)으로 방문자마다 uid 를 발급하고,
--   첫 진입 때 이 RPC 를 불러 템플릿 일기·기억을 그 uid 로 복사한다.
--   → 방문자마다 독립된 우주(RLS 그대로), 첫 화면부터 행성·리뷰·모모 기억이 차 있음.
--
-- 안전
--   · 익명 세션(auth.jwt() is_anonymous=true)에만 시드한다. 실제 계정은 절대 건드리지 않는다.
--   · 프로필 행을 for update 로 잠가 동시 호출(프론트 이중 부트스트랩)에도 1회만 시드된다.
--   · 임베딩(vector)은 SQL 에서 만들 수 없으므로, 삽입된 행(id/body/keywords)을 돌려주고
--     프론트가 /api/embed 로 채운다. 임베딩 없이도 rag.ts 는 최근 일기로 폴백한다.
--
-- 선행 조건
--   · Supabase 대시보드 → Authentication → Sign In / Providers → "Anonymous sign-ins" ON
--   · 0003(profiles/diary_entries), 0005(user_facts/relations), 0009(level 컬럼) 적용
--
-- 실행: Supabase SQL Editor 에 그대로 붙여넣기. 멱등(재실행 안전).

alter table public.profiles add column if not exists demo_seeded_at timestamptz;

-- 반환 컬럼은 entry_* 로 접두. (id/body 처럼 테이블 컬럼과 같은 이름을 쓰면 PL/pgSQL 이
--  "column reference is ambiguous" 로 실패한다.) 반환 타입이 바뀌므로 먼저 drop.
drop function if exists public.seed_demo_universe();

create function public.seed_demo_universe()
returns table (entry_id uuid, entry_body text, entry_keywords jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare
  uid     uuid := auth.uid();
  is_anon boolean := coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
  already timestamptz;
begin
  if uid is null then
    raise exception '로그인이 필요합니다.' using errcode = '28000';
  end if;
  -- 실제 계정에는 절대 시드하지 않는다.
  if not is_anon then
    return;
  end if;

  -- 프로필 행 확보 + 잠금 (트리거가 이미 만들었을 수도, 아닐 수도 있다)
  insert into public.profiles (id, nickname, planet_name) values (uid, 'user', 'user의 행성') on conflict (id) do nothing;
  select p.demo_seeded_at into already from public.profiles p where p.id = uid for update;
  if already is not null then
    return;
  end if;
  if exists (select 1 from public.diary_entries d where d.user_id = uid) then
    update public.profiles set demo_seeded_at = now() where profiles.id = uid;
    return;
  end if;

  -- ── 프로필: 이름·행성·성장 상태·장기기억 요약(③④) ──
  update public.profiles set
    nickname        = 'user',
    planet_name     = 'user의 행성',
    planet_color    = 'green',
    streak          = 5,
    last_check_in   = current_date - 1,  -- 어제 출석 → 오늘 출석하면 6일차로 이어짐 (0015)
    level           = 1,
    level_exp       = 12,
    stardust        = 18,
    mileage_earned  = 38,
    fact_summary    = '서울 마포에 사는 3년차 UX 디자이너. 고양이 보리와 함께 살고, 최근 한강 러닝을 시작했다. 이번 분기 신규 온보딩 프로젝트를 맡고 있다.',
    persona_summary = '사람들 앞에서 발표할 때 긴장이 크지만 끝나면 안도와 뿌듯함을 느끼는 편. 비 오는 날 천천히 걷는 걸 좋아하고, 아무 일도 없는 날을 오히려 불안해한다. 친구 수진과의 연락에서 큰 힘을 얻는다.',
    demo_seeded_at  = now()
  where profiles.id = uid;

  -- ── ③ 구조화된 사실 ──
  insert into public.user_facts (user_id, kind, key, value, confidence) values
    (uid, 'permanent', '직업',   'UX 디자이너 (3년차)', 0.9),
    (uid, 'slow',      '거주지', '서울 마포',           0.8),
    (uid, 'slow',      '취미',   '한강 러닝, 카페 산책', 0.8),
    (uid, 'permanent', '반려동물', '고양이 보리',        0.9),
    (uid, 'tracked',   '현재 프로젝트', '신규 온보딩 리디자인', 0.7)
  on conflict (user_id, key) do nothing;

  -- ── 관계 그래프 ──
  insert into public.relations (user_id, name, relation, sentiment, note, last_mentioned) values
    (uid, '수진',   '친구', '긍정', '오랜 친구. 통화하면 마음이 풀린다.',        now() - interval '1 day'),
    (uid, '팀장님', '상사', '중립', '발표를 칭찬해 줌. 기대가 부담되기도.',      now() - interval '2 days'),
    (uid, '엄마',   '가족', '긍정', '야근 때 전화를 못 받아 미안했다.',          now() - interval '4 days'),
    (uid, '민재',   '동료', '갈등', '마감 일정으로 부딪힘. 아직 어색하다.',      now() - interval '9 days')
  on conflict (user_id, name) do nothing;

  -- ── ② 일기 7편 (오늘은 비워 둔다 — 방문자가 직접 쓰는 첫 일기가 "오늘") ──
  return query
  insert into public.diary_entries
    (user_id, date, preview, body, audio_sec, emotions, keywords, primary_label, source, created_at)
  values
    (uid, current_date - 1,
     '수진이한테 오랜만에 전화가 왔다. 별 얘기 아니었는데 마음이 풀렸다.',
     '수진이한테 오랜만에 전화가 왔다. 별 얘기 아니었는데, 요즘 어떻게 지내냐는 말에 마음이 풀렸다. 보리가 옆에서 골골거리는 소리를 들으면서 한 시간 넘게 통화했다. 사람이 사람을 구한다는 말이 무슨 뜻인지 조금 알 것 같았다.',
     0,
     '[{"label":"사랑","pct":44},{"label":"차분","pct":34},{"label":"기쁨","pct":16},{"label":"슬픔","pct":6}]'::jsonb,
     '["수진","통화","보리","안부"]'::jsonb,
     '사랑', 'manual', now() - interval '1 day'),
    (uid, current_date - 2,
     '온보딩 발표. 손이 떨렸는데 팀장님이 잘했다고 했다.',
     '오늘 온보딩 리디자인 중간 발표를 했다. 시작 전에 손이 떨려서 물을 세 번이나 마셨다. 막상 시작하니까 준비한 대로 흘러갔고, 끝나고 팀장님이 잘 정리했다고 말해주셨다. 안도감이 몰려오는데 동시에 다음 기대가 부담스럽기도 하다.',
     41,
     '[{"label":"긴장","pct":42},{"label":"기쁨","pct":30},{"label":"차분","pct":18},{"label":"슬픔","pct":10}]'::jsonb,
     '["발표","회의","팀장님","긴장","안도"]'::jsonb,
     '긴장', 'voice', now() - interval '2 days'),
    (uid, current_date - 3,
     '비가 왔다. 우산을 안 가져갔는데 그게 그렇게 슬프지 않았다.',
     '비가 왔다. 우산을 안 가져갔는데 그게 그렇게 슬프지 않았다. 마포대교 쪽으로 천천히 걸었다. 젖은 머리로 집에 와서 보리를 안고 한참 앉아 있었다. 천천히 걷는 게 요즘 나한테 제일 잘 맞는 속도 같다.',
     0,
     '[{"label":"차분","pct":52},{"label":"슬픔","pct":26},{"label":"공허","pct":12},{"label":"기쁨","pct":10}]'::jsonb,
     '["비","산책","느림","마포"]'::jsonb,
     '차분', 'manual', now() - interval '3 days'),
    (uid, current_date - 4,
     '야근. 엄마 전화를 두 번 놓쳤다. 몸이 무겁다.',
     '발표 자료 때문에 밤 11시까지 야근했다. 엄마 전화를 두 번 놓쳤는데 다시 걸 기운이 없었다. 집에 오니 보리가 문 앞에서 기다리고 있었다. 미안한 마음이 계속 남는다. 내일은 꼭 먼저 전화해야지.',
     0,
     '[{"label":"슬픔","pct":36},{"label":"긴장","pct":30},{"label":"공허","pct":22},{"label":"차분","pct":12}]'::jsonb,
     '["야근","엄마","피로","미안함"]'::jsonb,
     '슬픔', 'manual', now() - interval '4 days'),
    (uid, current_date - 5,
     '처음으로 한강을 뛰었다. 3km. 다리는 아픈데 기분은 가볍다.',
     '드디어 미루던 러닝을 시작했다. 한강까지 걸어가서 3km를 뛰었다. 중간에 두 번 멈췄지만 끝까지 갔다. 다리는 아픈데 머리가 맑아졌다. 이 느낌을 잊지 말자고 적어둔다.',
     28,
     '[{"label":"기쁨","pct":46},{"label":"차분","pct":32},{"label":"긴장","pct":12},{"label":"사랑","pct":10}]'::jsonb,
     '["러닝","한강","시작","상쾌"]'::jsonb,
     '기쁨', 'voice', now() - interval '5 days'),
    (uid, current_date - 7,
     '아무 일도 일어나지 않은 일요일. 그게 이상하게 무서웠다.',
     '아무 일도 일어나지 않은 일요일. 침대에서 오후 3시까지 있었다. 해야 할 것도 없고 만날 사람도 없는 날이 오히려 불안하다. 보리 밥 주는 것만 했다. 이런 날도 기록해 두면 나중에 뭔가 보일까.',
     12,
     '[{"label":"공허","pct":54},{"label":"슬픔","pct":22},{"label":"차분","pct":18},{"label":"긴장","pct":6}]'::jsonb,
     '["공허","일요일","정적"]'::jsonb,
     '공허', 'manual', now() - interval '7 days'),
    (uid, current_date - 9,
     '민재랑 마감 일정 때문에 부딪혔다. 아직 열이 안 식는다.',
     '민재랑 마감 일정 때문에 부딪혔다. 내 쪽 디자인이 늦어서 개발이 밀린다고 회의에서 말해버려서 순간 욱했다. 틀린 말은 아닌데 방식이 싫었다. 퇴근길 내내 뭐라고 받아쳤어야 했는지 생각했다. 아직 열이 안 식는다.',
     0,
     '[{"label":"분노","pct":44},{"label":"긴장","pct":28},{"label":"슬픔","pct":16},{"label":"차분","pct":12}]'::jsonb,
     '["민재","마감","갈등","회의"]'::jsonb,
     '분노', 'manual', now() - interval '9 days')
  returning diary_entries.id, diary_entries.body, diary_entries.keywords;
end;
$$;

revoke all on function public.seed_demo_universe() from public, anon;
grant execute on function public.seed_demo_universe() to authenticated;

comment on function public.seed_demo_universe() is
  '익명(데모) 세션의 첫 진입 시 템플릿 일기 7편 + 사실/관계 기억을 본인 uid 로 복사한다. 1회만 실행됨.';
