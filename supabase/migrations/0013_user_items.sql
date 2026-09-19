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
