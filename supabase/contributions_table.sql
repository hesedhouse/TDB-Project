-- TDB 방 수호천사 기여도 (명예의 전당)
-- SQL Editor 에서 실행 후 Replication 에서 contributions 테이블 활성화

create table if not exists public.contributions (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null,
  user_display_name text not null,
  minutes int not null,
  created_at timestamptz not null default now()
);

create index if not exists contributions_board_id_created_at
  on public.contributions (board_id, created_at desc);

alter table public.contributions enable row level security;

create policy "contributions_select" on public.contributions for select using (true);
create policy "contributions_insert" on public.contributions for insert with check (true);

alter publication supabase_realtime add table public.contributions;
