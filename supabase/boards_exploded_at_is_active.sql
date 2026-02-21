-- Poppin: 방 폭파(종료) 시 is_active + exploded_at 저장
-- SQL Editor에서 실행 후 기존 boards 행은 is_active=true, exploded_at=null 유지

alter table public.boards
  add column if not exists is_active boolean not null default true;

alter table public.boards
  add column if not exists exploded_at timestamptz null;

comment on column public.boards.is_active is 'true=활성 방, false=폭파(종료)된 방';
comment on column public.boards.exploded_at is '폭파된 시각(ISO). null이면 미폭파';
