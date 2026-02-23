-- ============================================================
-- boards 테이블에 pinned_content, pinned_until 컬럼 존재·타입 확인
-- Supabase SQL Editor에서 실행 후 결과로 컬럼/타입 확인.
-- ============================================================

-- 컬럼 존재 및 타입 확인 (결과: column_name, data_type)
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'boards'
  and column_name in ('pinned_content', 'pinned_until');

-- 위에서 2행(pinned_content, pinned_until)이 나와야 함.
-- pinned_content = jsonb, pinned_until = timestamp with time zone (timestamptz).

-- 없으면 아래로 컬럼 추가 후 다시 위 쿼리 실행.
-- alter table public.boards
--   add column if not exists pinned_content jsonb null,
--   add column if not exists pinned_until timestamptz null;
