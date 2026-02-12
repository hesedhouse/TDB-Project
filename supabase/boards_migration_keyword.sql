-- ============================================================
-- boards 테이블에 keyword 컬럼 추가 (한글 방 제목 검색용)
-- 기존 테이블에 keyword가 없을 때 Supabase SQL Editor에서 실행.
-- ============================================================

-- 1) keyword 컬럼이 없으면 추가 (TEXT). 검색/생성 시 이 컬럼만 사용, id는 건드리지 않음.
ALTER TABLE public.boards
  ADD COLUMN IF NOT EXISTS keyword TEXT;

-- 2) keyword 유니크 제약이 없으면 추가 (같은 방 제목 = 한 방만)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'boards' AND c.conname = 'boards_keyword_key'
  ) THEN
    ALTER TABLE public.boards
      ADD CONSTRAINT boards_keyword_key UNIQUE (keyword);
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'boards_keyword_key 추가 스킵 또는 이미 존재: %', SQLERRM;
END $$;

-- 3) 컬럼 확인 (실행 후 필요 시)
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'boards';
--
-- id가 uuid가 아니면(예: text) 테이블을 삭제 후 boards_table.sql 로 새로 만드는 것을 권장.
