-- 카카오(Supabase Auth) + 네이버(NextAuth) 유저 통합 프로필
-- Supabase SQL Editor에서 실행

create table if not exists public.profiles (
  id uuid primary key,
  email text,
  name text,
  image text,
  provider text not null default 'supabase',
  updated_at timestamptz not null default now()
);

comment on table public.profiles is '통합 유저 프로필 (Supabase Auth + NextAuth 네이버)';
comment on column public.profiles.provider is 'supabase | naver';

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles for select using (true);
create policy "profiles_insert_service" on public.profiles for insert with check (true);
create policy "profiles_update_service" on public.profiles for update using (true);
