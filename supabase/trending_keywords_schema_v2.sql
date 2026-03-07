-- ============================================================
-- 실시간 트렌드 키워드: id, source(google/youtube), keyword, rank, created_at
-- SQL Editor에서 실행. 기존 word 컬럼이 있으면 keyword/rank 추가 후 백필.
-- ============================================================

-- 1) 기존 테이블에 keyword, rank 추가 및 백필 (word 있을 때)
alter table public.trending_keywords add column if not exists keyword text;
alter table public.trending_keywords add column if not exists rank integer;

-- word 컬럼이 있으면 keyword 백필
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'trending_keywords' and column_name = 'word'
  ) then
    update public.trending_keywords set keyword = coalesce(keyword, word) where keyword is null;
  end if;
end $$;

-- 2) 신규 설치 시: keyword not null 등은 기존 데이터 때문에 바로 넣기 어려우면 생략. 인덱스만 추가
create index if not exists trending_keywords_source_created
  on public.trending_keywords (source, created_at desc);

create index if not exists trending_keywords_created_at
  on public.trending_keywords (created_at desc);

-- 3) Edge Function upsert용 정책
alter table public.trending_keywords enable row level security;

drop policy if exists "trending_keywords_select" on public.trending_keywords;
create policy "trending_keywords_select" on public.trending_keywords for select using (true);

drop policy if exists "trending_keywords_insert" on public.trending_keywords;
create policy "trending_keywords_insert" on public.trending_keywords for insert with check (true);

drop policy if exists "trending_keywords_update" on public.trending_keywords;
create policy "trending_keywords_update" on public.trending_keywords for update using (true) with check (true);

drop policy if exists "trending_keywords_delete" on public.trending_keywords;
create policy "trending_keywords_delete" on public.trending_keywords for delete using (true);

comment on column public.trending_keywords.source is 'google | youtube';
comment on column public.trending_keywords.keyword is '트렌드 검색어';
comment on column public.trending_keywords.rank is '순위 (1~N)';
