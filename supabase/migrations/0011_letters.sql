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

create policy letters_owner on public.letters
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 회원 탈퇴(0010 delete_own_account)의 마지막 `delete from auth.users` 시
-- 위 FK(on delete cascade)로 편지도 함께 삭제되므로 별도 처리는 필요 없다.
