-- ============================================================
-- 전광판(pinned) 컬럼 추가 + RLS Update 허용
-- Supabase SQL Editor에서 그대로 실행하세요.
-- ※ 이 앱은 채팅방을 'boards' 테이블로 사용합니다. 'rooms'만 쓰는 경우도 아래에 포함.
-- ============================================================

-- 1) boards 테이블에 전광판 컬럼 추가 (API가 이 테이블을 업데이트합니다)
alter table public.boards
  add column if not exists pinned_content jsonb null,
  add column if not exists pinned_until timestamptz null;

comment on column public.boards.pinned_content is '전광판: { "type": "youtube" | "image", "url": "..." }';
comment on column public.boards.pinned_until is '전광판 해제 시각 (이 시각 이후 미표시)';

-- 2) boards RLS: 일반 유저가 전광판(pinned_*) 업데이트 가능하도록
alter table public.boards enable row level security;

drop policy if exists "boards update" on public.boards;
create policy "boards update" on public.boards
  for update
  using (true)
  with check (true);

-- 3) [선택] rooms 테이블을 쓰는 경우: rooms에 컬럼 추가 + RLS
-- 아래는 rooms 테이블이 있을 때만 실행하세요. (테이블 없으면 에러 납니다)
/*
alter table public.rooms
  add column if not exists pinned_content jsonb null,
  add column if not exists pinned_until timestamptz null;

alter table public.rooms enable row level security;

drop policy if exists "rooms update" on public.rooms;
create policy "rooms update" on public.rooms
  for update
  using (true)
  with check (true);
*/
