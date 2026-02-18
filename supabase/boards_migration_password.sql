-- ============================================================
-- boards 테이블에 비밀번호 해시 컬럼 추가
-- 비밀번호는 서버에서만 bcrypt 등으로 해시 후 저장·비교.
-- Supabase SQL Editor에서 실행.
-- ============================================================

ALTER TABLE public.boards
  ADD COLUMN IF NOT EXISTS password_hash TEXT;

COMMENT ON COLUMN public.boards.password_hash IS '비밀번호 해시 (선택). 서버에서만 검증.';
