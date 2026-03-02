-- ============================================================
-- 명예의 전당 "핫플레이스": 최근 24시간 모래시계 충전 건수 집계용
-- 1) board_recharge_log: 방별 충전 시각 로그 (연장 시마다 1건 삽입)
-- 2) boards.total_recharged: 전체 누적 충전 횟수 (선택, 폴백용)
-- Supabase SQL Editor에서 실행.
-- ============================================================

-- 1) 로그 테이블: 최근 24시간 집계용
create table if not exists public.board_recharge_log (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_board_recharge_log_board_created
  on public.board_recharge_log (board_id, created_at desc);

comment on table public.board_recharge_log is '모래시계 연장 시 1건씩 기록. 명예의 전당 핫플레이스(24h) 집계용.';

-- 2) boards에 누적 충전 횟수 (폴백 또는 전체 기간 화력 표시용)
alter table public.boards
  add column if not exists total_recharged integer not null default 0;

comment on column public.boards.total_recharged is '누적 모래시계 연장 횟수. 명예의 전당 폴백 또는 화력 표시용.';

-- 3) 로그 INSERT 시 boards.total_recharged 자동 증가
create or replace function public.inc_board_total_recharged()
returns trigger as $$
begin
  update public.boards
  set total_recharged = coalesce(total_recharged, 0) + 1
  where id = new.board_id;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_inc_board_total_recharged on public.board_recharge_log;
create trigger trg_inc_board_total_recharged
  after insert on public.board_recharge_log
  for each row execute function public.inc_board_total_recharged();

-- 4) 최근 24시간 충전 건수 상위 N개 방 ID + 건수 반환 (RPC)
create or replace function public.get_hot_places_24h(lim int default 5)
returns table (board_id uuid, recharge_count bigint) as $$
  select b.board_id, count(*)::bigint
  from public.board_recharge_log b
  where b.created_at >= (now() - interval '24 hours')
  group by b.board_id
  order by count(*) desc
  limit lim;
$$ language sql security definer;
