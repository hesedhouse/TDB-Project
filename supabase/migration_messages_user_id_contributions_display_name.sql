-- ============================================================
-- TDB 스키마 보강: messages.user_id, contributions.user_display_name
-- PGRST204 / 42703 방지. Supabase SQL Editor 에서 실행.
-- ============================================================

-- 1. messages 테이블에 user_id 컬럼 추가 (로그인 유저 추적용, nullable)
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'messages' and column_name = 'user_id'
  ) then
    alter table public.messages add column user_id uuid null;
    comment on column public.messages.user_id is 'Supabase Auth user.id (관리자 추적용, nullable)';
  end if;
end $$;

-- 2. messages 테이블에 image_url 없으면 추가 (이미 있으면 스킵)
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'messages' and column_name = 'image_url'
  ) then
    alter table public.messages add column image_url text null;
  end if;
end $$;

-- 3. contributions 테이블에 user_display_name 컬럼 추가 (없을 때만)
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'contributions' and column_name = 'user_display_name'
  ) then
    alter table public.contributions add column user_display_name text not null default '익명의 수호자';
    comment on column public.contributions.user_display_name is '닉네임 또는 익명의 수호자';
  end if;
end $$;
