-- ============================================================
-- tdb-images 버킷: 누구나 사진 업로드·조회 허용
-- Supabase 대시보드 → SQL Editor 에서 실행
-- (먼저 Storage → New bucket → tdb-images 생성 후 실행)
-- ============================================================

CREATE POLICY "Public Access"
ON storage.objects FOR ALL
USING ( bucket_id = 'tdb-images' )
WITH CHECK ( bucket_id = 'tdb-images' );
