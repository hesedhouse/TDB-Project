-- ============================================================
-- boards 테이블: id는 UUID, 키워드로 조회/생성
-- Supabase SQL Editor에서 실행. 기존 테이블이 있으면 마이그레이션 필요.
-- ============================================================

-- 기존 id text 테이블이 있다면 먼저 백업 후 삭제하거나, 마이그레이션 스크립트로 전환

create table if not exists public.boards (
  id uuid primary key default gen_random_uuid(),
  keyword text unique not null,
  name text,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now()
);

alter table public.boards enable row level security;

create policy "boards select" on public.boards for select using (true);
create policy "boards insert" on public.boards for insert with check (true);
create policy "boards update" on public.boards for update using (true) with check (true);
