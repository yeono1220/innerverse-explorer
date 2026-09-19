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
