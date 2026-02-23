-- ============================================================
-- boards 테이블: 5분 고정 전광판 컬럼 추가
-- Supabase SQL Editor에서 실행.
-- ============================================================

alter table public.boards
  add column if not exists pinned_content jsonb null,
  add column if not exists pinned_until timestamptz null,
  add column if not exists pinned_at timestamptz null;

comment on column public.boards.pinned_content is '고정 전광판: { "type": "youtube" | "image", "url": "..." }';
comment on column public.boards.pinned_until is '고정 해제 시각 (5분 후). 이 시각 이후에는 전광판 미표시.';
comment on column public.boards.pinned_at is '영상이 처음 고정된 시각. 동시 시청(Watch Together) 싱크용. 연장 시 변경하지 않음.';

-- Realtime: 고정 전광판 변경 시 모든 접속자에게 반영
alter publication supabase_realtime add table boards;
