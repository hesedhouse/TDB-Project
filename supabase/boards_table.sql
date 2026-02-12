-- ============================================================
-- 모래시계 연장용 boards 테이블 (id, expires_at 필요)
-- Supabase SQL Editor에서 실행. 이미 테이블이 있으면 expires_at 컬럼만 확인.
-- ============================================================

create table if not exists public.boards (
  id text primary key,
  name text,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now()
);

alter table public.boards enable row level security;

create policy "boards select" on public.boards for select using (true);
create policy "boards update" on public.boards for update using (true) with check (true);
