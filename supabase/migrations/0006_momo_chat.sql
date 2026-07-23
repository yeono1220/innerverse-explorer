-- INNERVERSE — momo 대화 저장 + 대화→당일 일기 자동생성 파이프라인
-- 0005_memory.sql 적용 후 실행.
--
-- 설계: '롤링 실드(rolling seal)' 모델 —
--   · 당일 데이터(챗/일기)는 평문 → 모델(AI)이 접근 가능
--   · 과거 데이터는 봉인(sealed=true) → 이후 암호문(content_enc/body_enc)만 접근
--   (실제 암호화 배선은 후속 슬라이스. 여기선 경계·봉인 컬럼만 미리 둔다.)

-- 1) momo 대화 턴 저장 (RAG 소스 + 당일 일기 자동생성 소스)
create table if not exists public.momo_messages (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  day         date not null default current_date,          -- 당일/과거 경계
  role        text not null check (role in ('user','momo')),
  content     text not null,                                -- 당일=평문, 과거=봉인 대상
  emo         text,                                         -- 감정 태그(선택)
  embedding   vector(768),                                  -- RAG(선택)
  sealed      boolean not null default false,               -- 과거 봉인 여부
  sealed_at   timestamptz,
  content_enc jsonb,                                        -- 봉인 시 암호문 {iv,ct} (후속)
  created_at  timestamptz not null default now()
);
create index if not exists momo_messages_user_day_idx on public.momo_messages(user_id, day);

alter table public.momo_messages enable row level security;
create policy momo_messages_owner on public.momo_messages
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 2) diary_entries: 출처 + 봉인 컬럼 (당일/과거 모델)
alter table public.diary_entries add column if not exists source     text default 'manual';   -- manual|momo_chat|voice|photo
alter table public.diary_entries add column if not exists sealed     boolean not null default false;
alter table public.diary_entries add column if not exists sealed_at  timestamptz;
alter table public.diary_entries add column if not exists body_enc   jsonb;                    -- 봉인 시 {iv,ct}

-- 3) momo 대화 의미검색 RPC — RLS invoker라 남의 대화는 검색 불가.
--    봉인(과거)된 턴은 평문 검색에서 제외 → 과거는 파생 요약을 통해서만 참조.
create or replace function public.match_momo_messages(
  query_embedding vector(768),
  match_count int default 5
)
returns table (id uuid, content text, day date, similarity float)
language sql stable
as $$
  select m.id, m.content, m.day,
         1 - (m.embedding <=> query_embedding) as similarity
  from public.momo_messages m
  where m.user_id = auth.uid()
    and m.embedding is not null
    and m.sealed = false
  order by m.embedding <=> query_embedding
  limit greatest(1, match_count);
$$;
grant execute on function public.match_momo_messages(vector, int) to authenticated;
