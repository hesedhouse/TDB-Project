-- 메시지 삭제 정책 (본인 메시지만 삭제 가능. user_id 컬럼이 있을 때)
-- Supabase SQL Editor 에서 실행. messages 테이블에 user_id uuid 컬럼이 있어야 함.

drop policy if exists "messages_delete" on public.messages;
create policy "messages_delete"
  on public.messages for delete
  using (auth.uid() = user_id);

-- user_id가 없는 메시지(익명)는 삭제 불가로 두려면 위 대신 아래 사용:
-- using (user_id is not null and auth.uid() = user_id);
