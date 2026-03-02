-- ============================================================
-- 명예의 전당 "핫플레이스" 화력 점수: 연장(extension) + 전광판(billboard) 집계
-- - extension: 방 시간 연장 시 1P per 모래시계
-- - billboard: 전광판 고정/연장 시 2P per 모래시계 (가중치 2배)
-- Heat Score = sum(extension * 1) + sum(billboard * 2)
-- ============================================================

create table if not exists public.hourglass_transactions (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  type text not null check (type in ('extension', 'billboard')),
  amount integer not null default 1 check (amount >= 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_hourglass_transactions_board_created
  on public.hourglass_transactions (board_id, created_at desc);

create index if not exists idx_hourglass_transactions_created
  on public.hourglass_transactions (created_at desc);

comment on table public.hourglass_transactions is '모래시계 사용 로그: extension(방 연장), billboard(전광판). 화력 점수 집계용.';

-- 최근 24시간 화력 점수 상위 N개 방 (Heat = extension*1 + billboard*2)
create or replace function public.get_hot_places_24h_heat(lim int default 5)
returns table (board_id uuid, heat_score bigint) as $$
  select
    h.board_id,
    (
      coalesce(sum(case when h.type = 'extension' then h.amount else 0 end), 0)
      + coalesce(sum(case when h.type = 'billboard' then h.amount * 2 else 0 end), 0)
    )::bigint as heat_score
  from public.hourglass_transactions h
  where h.created_at >= (now() - interval '24 hours')
  group by h.board_id
  order by heat_score desc
  limit lim;
$$ language sql security definer;
