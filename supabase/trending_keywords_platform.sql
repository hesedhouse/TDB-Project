-- ============================================================
-- trending_keywords: id, platform, keyword, related_url, rank, created_at
-- SQL Editor에서 실행. 기존 테이블이 있으면 컬럼 추가.
-- ============================================================

-- 1) 테이블이 없으면 생성
create table if not exists public.trending_keywords (
  id uuid primary key default gen_random_uuid(),
  platform text not null,
  keyword text not null,
  related_url text,
  rank integer,
  created_at timestamptz not null default now()
);

-- 2) 기존 테이블에 컬럼 추가 (이미 있으면 무시)
alter table public.trending_keywords add column if not exists platform text;
alter table public.trending_keywords add column if not exists related_url text;

-- 3) source -> platform 백필 (기존 source 컬럼이 있을 때)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'trending_keywords' and column_name = 'source'
  ) then
    update public.trending_keywords set platform = coalesce(platform, source) where platform is null;
  end if;
end $$;

-- 4) keyword 없으면 word에서 백필
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'trending_keywords' and column_name = 'word'
  ) then
    update public.trending_keywords set keyword = coalesce(keyword, word) where keyword is null;
  end if;
end $$;

-- 5) 인덱스
create index if not exists trending_keywords_platform_created
  on public.trending_keywords (platform, created_at desc);

create index if not exists trending_keywords_created_at
  on public.trending_keywords (created_at desc);

-- 6) RLS
alter table public.trending_keywords enable row level security;

drop policy if exists "trending_keywords_select" on public.trending_keywords;
create policy "trending_keywords_select" on public.trending_keywords for select using (true);

drop policy if exists "trending_keywords_insert" on public.trending_keywords;
create policy "trending_keywords_insert" on public.trending_keywords for insert with check (true);

drop policy if exists "trending_keywords_update" on public.trending_keywords;
create policy "trending_keywords_update" on public.trending_keywords for update using (true) with check (true);

drop policy if exists "trending_keywords_delete" on public.trending_keywords;
create policy "trending_keywords_delete" on public.trending_keywords for delete using (true);

comment on column public.trending_keywords.platform is 'google | youtube | naver 등';
comment on column public.trending_keywords.keyword is '트렌드 검색어 또는 영상 제목';
comment on column public.trending_keywords.related_url is '관련 링크 (예: YouTube 영상 URL)';
comment on column public.trending_keywords.rank is '순위 (1~N)';
