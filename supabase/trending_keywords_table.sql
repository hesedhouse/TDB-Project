-- TDB 트렌드 키워드 테이블. SQL Editor 에서 실행.

create table if not exists public.trending_keywords (
  id uuid primary key default gen_random_uuid(),
  word text not null,
  source text not null,
  created_at timestamptz not null default now()
);

create index if not exists trending_keywords_created_at
  on public.trending_keywords (created_at desc);

alter table public.trending_keywords enable row level security;

create policy "trending_keywords_select" on public.trending_keywords for select using (true);
create policy "trending_keywords_insert" on public.trending_keywords for insert with check (true);
