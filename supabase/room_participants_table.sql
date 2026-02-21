-- 방 참여자 (들어옴/나감). 참여자 리스트·나가기·왕관 필터에 사용
-- SQL Editor에서 실행 후 Replication에서 room_participants 테이블 활성화

create table if not exists public.room_participants (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null,
  user_display_name text not null,
  is_active boolean not null default true,
  updated_at timestamptz not null default now(),
  unique(board_id, user_display_name)
);

create index if not exists room_participants_board_active
  on public.room_participants (board_id, is_active) where is_active = true;

alter table public.room_participants enable row level security;

create policy "room_participants_select" on public.room_participants for select using (true);
create policy "room_participants_insert" on public.room_participants for insert with check (true);
create policy "room_participants_update" on public.room_participants for update using (true) with check (true);

alter publication supabase_realtime add table public.room_participants;
