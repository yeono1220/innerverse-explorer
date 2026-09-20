-- INNERVERSE 미적용 마이그레이션 일괄 실행 (2026-09-20)
-- Supabase SQL Editor 에 전체 붙여넣기 → Run. "Potential issue detected" 경고는 drop policy/function 때문 → Run query.
-- 전부 멱등(재실행 안전).

-- ==================== 0011_letters.sql ====================
-- 0011_letters.sql
-- 미래의 나에게 보내는 편지 (타임캡슐). /letter 화면의 '편지 작성하기' 대응.
--
-- 핵심 요구사항
--   · 편지는 "쓴 사람 본인"만 볼 수 있다. 다른 사용자는 접근 불가.
--     → RLS(user_id = auth.uid())로 DB 레벨에서 강제한다. 프론트 필터에만
--       의존하지 않는다(0001/0003 의 diaries·diary_entries 와 동일 원칙).
--   · 공개일(reveal_at)이 지나야 열람 가능. 지난 편지는 모두 볼 수 있다.
--     → 조회는 letterApi 에서 reveal_at 기준으로 나눈다. 봉인 중 편지의 본문은
--       클라이언트로 내려보내지 않는다(메타데이터만).
--
-- 실행: `supabase db push` 또는 Supabase SQL Editor 에 그대로 붙여넣기. 멱등.

create extension if not exists "pgcrypto";

create table if not exists public.letters (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  body       text not null,                    -- 편지 본문
  reveal_at  date not null,                    -- 공개일(이 날짜부터 열람 가능)
  created_at timestamptz not null default now()  -- 작성일(=봉인일)
);

-- "내 편지 중 공개일 순/작성일 순" 조회를 위한 인덱스.
create index if not exists letters_user_reveal_idx
  on public.letters(user_id, reveal_at);
create index if not exists letters_user_created_idx
  on public.letters(user_id, created_at desc);

-- ── RLS: 본인 데이터만 (읽기·쓰기 모두) ──
alter table public.letters enable row level security;

drop policy if exists letters_owner on public.letters;
create policy letters_owner on public.letters
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 회원 탈퇴(0010 delete_own_account)의 마지막 `delete from auth.users` 시
-- 위 FK(on delete cascade)로 편지도 함께 삭제되므로 별도 처리는 필요 없다.

grant select, insert, update, delete on public.letters to authenticated;


-- ==================== 0013_user_items.sql ====================
-- ── 구매한 인벤토리 아이템 + 행성 위 설치 위치 ──────────────
-- appStore.inventory / placement.ts(ItemPlacement) 에 1:1 대응.
-- 로그인 상태에서 구매하면 여기에 남고, 다른 기기에서도 같은 자리에 복원된다.

create table if not exists public.user_items (
  user_id    uuid not null references auth.users(id) on delete cascade,
  item_id    text not null,                       -- InventoryItem.id ('i1' 등)
  lat        double precision not null default 0, -- 위도(rad)
  lon        double precision not null default 0, -- 경도(rad)
  seed       double precision not null default 0.5,
  created_at timestamptz default now(),
  primary key (user_id, item_id)
);

create index if not exists user_items_user_idx on public.user_items(user_id, created_at);

alter table public.user_items enable row level security;

drop policy if exists user_items_owner on public.user_items;
create policy user_items_owner on public.user_items
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update, delete on public.user_items to authenticated;
grant select on public.user_items to anon;


-- ==================== 0014_app_state.sql ====================
-- ── 앱 상태 전반의 계정 단위 영속화 ─────────────────────────
-- 지금까지 메모리/localStorage 에만 있던 상태를 auth.users.id 기준으로 옮긴다.
--   · user_app_state      : 단일 행 상태 (퀘스트·사용량·출석·컨디션·설정·소비 일기)
--   · galaxy_planets      : 감정 행성 (galaxyStore.planets)
--   · user_friends        : 친구 목록 (appStore.friends)
--   · user_notifications  : 알림 (appStore.notifications)
-- 보유 아이템(user_items)은 0013 에서 이미 만들었다.
--
-- 이름 주의: condition / time 은 SQL 키워드와 겹쳐 PostgREST 에서 말썽이 나기 쉬워
--            condition_state / time_label 로 피했다.

-- ── 단일 행 상태 ──
create table if not exists public.user_app_state (
  user_id         uuid primary key references auth.users(id) on delete cascade,

  -- 퀘스트: 어느 날짜의 완료 상태인지 + { questId: true } 맵
  quests_date     date,
  quests_done     jsonb       not null default '{}'::jsonb,

  -- 무료 플랜 사용량: 날짜/주가 바뀌면 클라이언트가 리셋한다
  usage_day       date,
  chat_turns      int         not null default 0,
  usage_week      date,
  diary_count     int         not null default 0,

  -- 출석한 일자 인덱스 배열
  attendance      jsonb       not null default '[]'::jsonb,
  -- { score, sleep, tags[] }
  condition_state jsonb       not null default '{}'::jsonb,
  -- 알림/주 시작요일/테마 등 UI 설정
  settings        jsonb       not null default '{}'::jsonb,
  -- 이미 감정 행성으로 소비된 일기 id
  galaxy_consumed jsonb       not null default '[]'::jsonb,

  updated_at      timestamptz not null default now()
);

-- ── 감정 행성 (galaxyStore.EmotionPlanet 과 1:1) ──
create table if not exists public.galaxy_planets (
  user_id    uuid not null references auth.users(id) on delete cascade,
  id         text not null,               -- 클라이언트 생성 id ('pl<timestamp>')
  created_at timestamptz not null default now(),
  start_date text,
  end_date   text,
  dominant   text,
  color      text,
  breakdown  jsonb not null default '[]'::jsonb,
  keywords   jsonb not null default '[]'::jsonb,
  summary    text,
  entries    jsonb not null default '[]'::jsonb,  -- 생성 시점 일기 스냅샷
  primary key (user_id, id)
);
create index if not exists galaxy_planets_user_idx on public.galaxy_planets(user_id, created_at);

-- ── 친구 (appStore.Friend — code 가 고유 식별자) ──
create table if not exists public.user_friends (
  user_id      uuid not null references auth.users(id) on delete cascade,
  code         text not null,
  name         text,
  planet_color text,
  similarity   int,
  last_emotion text,
  created_at   timestamptz not null default now(),
  primary key (user_id, code)
);

-- ── 알림 (appStore.NotificationItem) ──
create table if not exists public.user_notifications (
  user_id    uuid not null references auth.users(id) on delete cascade,
  id         text not null,
  type       text,
  title      text,
  body       text,
  time_label text,
  unread     boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists user_notifications_user_idx on public.user_notifications(user_id, created_at desc);

-- ── RLS: 본인 행만 ──
alter table public.user_app_state     enable row level security;
alter table public.galaxy_planets     enable row level security;
alter table public.user_friends       enable row level security;
alter table public.user_notifications enable row level security;

drop policy if exists user_app_state_owner on public.user_app_state;
create policy user_app_state_owner on public.user_app_state
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists galaxy_planets_owner on public.galaxy_planets;
create policy galaxy_planets_owner on public.galaxy_planets
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists user_friends_owner on public.user_friends;
create policy user_friends_owner on public.user_friends
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists user_notifications_owner on public.user_notifications;
create policy user_notifications_owner on public.user_notifications
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── 권한 (0008 과 같은 방침: 게이트만 열고 행 필터는 RLS 가 강제) ──
grant select, insert, update, delete
  on public.user_app_state, public.galaxy_planets, public.user_friends, public.user_notifications
  to authenticated;
grant select
  on public.user_app_state, public.galaxy_planets, public.user_friends, public.user_notifications
  to anon;


-- ==================== 0015_last_check_in.sql ====================
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


-- ==================== 0012_anon_demo_seed.sql ====================
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
  insert into public.profiles (id, nickname, planet_name) values (uid, '이음', '이음의 행성') on conflict (id) do nothing;
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
    nickname        = '이음',
    planet_name     = '이음의 행성',
    planet_color    = 'green',
    streak          = 5,
    last_check_in   = current_date - 1,  -- 어제 출석 → 오늘 출석하면 6일차로 이어짐 (0015)
    level           = 1,
    level_exp       = 12,
    stardust        = 18,
    mileage_earned  = 38,
    fact_summary    = '이음은 서울 마포에 사는 3년차 UX 디자이너. 고양이 보리와 함께 살고, 최근 한강 러닝을 시작했다. 이번 분기 신규 온보딩 프로젝트를 맡고 있다.',
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
