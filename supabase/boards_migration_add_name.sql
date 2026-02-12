-- ============================================================
-- boards 테이블에 name 컬럼 추가 (Schema Mismatch 400 방지)
-- 코드는 name 컬럼만 사용합니다. title이 있더라도 name으로 통일해 주세요.
-- Supabase SQL Editor에서 실행.
-- ============================================================

-- name 컬럼이 없으면 추가 (TEXT, nullable 허용)
ALTER TABLE public.boards
  ADD COLUMN IF NOT EXISTS name TEXT;

-- (선택) 기존에 title만 있고 name이 비어 있으면 title 값을 name으로 복사
-- UPDATE public.boards SET name = title WHERE name IS NULL AND title IS NOT NULL;
