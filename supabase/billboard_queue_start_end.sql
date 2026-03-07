-- ============================================================
-- billboard_queue: 유튜브 시작/종료 시간 컬럼 추가
-- Supabase SQL Editor에서 실행. billboard_queue_table.sql 선행 필요.
-- ============================================================

alter table public.billboard_queue
  add column if not exists start_time integer,
  add column if not exists end_time integer;

comment on column public.billboard_queue.start_time is '유튜브 재생 시작 시각(초). type=youtube일 때만 사용';
comment on column public.billboard_queue.end_time is '유튜브 재생 종료 시각(초). 이 시각에 도달하면 다음 대기열로';
