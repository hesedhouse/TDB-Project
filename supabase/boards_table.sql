-- ============================================================
-- boards 테이블: id는 UUID 자동 생성, keyword로 한글 방 제목 검색
-- Supabase SQL Editor에서 실행.
-- 기존 테이블에 keyword가 없으면 boards_migration_keyword.sql 먼저 실행.
-- ============================================================
-- 검색/생성 시: keyword 컬럼만 사용. id에는 'board-1', 'PUBG' 등 절대 넣지 않음.

create table if not exists public.boards (
  id uuid primary key default gen_random_uuid(),
  keyword text unique not null,
  name text,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now()
);

comment on column public.boards.keyword is '방 제목/키워드 (한글 등). 검색은 이 컬럼으로만 수행.';
comment on column public.boards.id is 'UUID 자동 생성. 직접 지정 금지.';

alter table public.boards enable row level security;

create policy "boards select" on public.boards for select using (true);
create policy "boards insert" on public.boards for insert with check (true);
create policy "boards update" on public.boards for update using (true) with check (true);
