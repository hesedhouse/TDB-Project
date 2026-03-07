-- ============================================================
-- billboard_queue: 전광판 예약 대기열 (방별)
-- Supabase SQL Editor에서 실행. boards 테이블 선행 필요.
-- ============================================================

create table if not exists public.billboard_queue (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  content_url text not null,
  type text not null check (type in ('youtube', 'image')),
  creator_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_billboard_queue_board_created
  on public.billboard_queue (board_id, created_at asc);

comment on table public.billboard_queue is '전광판 예약 대기열. 재생 중이면 대기, 비어 있으면 즉시 전광판에 반영.';
comment on column public.billboard_queue.content_url is 'YouTube 또는 이미지 URL';
comment on column public.billboard_queue.creator_id is '예약한 유저(선택). auth.users 또는 public.users id';

alter table public.billboard_queue enable row level security;

create policy "billboard_queue select" on public.billboard_queue for select using (true);
create policy "billboard_queue insert" on public.billboard_queue for insert with check (true);
create policy "billboard_queue delete" on public.billboard_queue for delete using (true);
