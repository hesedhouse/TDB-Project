-- ============================================================
-- TDB (떴다방) 실시간 채팅용 messages 테이블
-- Supabase 대시보드 → SQL Editor 에서 전체 복사 후 실행
-- ============================================================

-- 1. 테이블 생성 (board_id, nickname, content, heart_count 포함)
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  board_id text not null,
  author_character smallint not null default 0,
  author_nickname text not null,
  content text not null,
  heart_count int not null default 0,
  created_at timestamptz not null default now(),
  images jsonb,
  links jsonb
);

comment on column public.messages.board_id is '게시판/방 식별자';
comment on column public.messages.author_nickname is '작성자 닉네임';
comment on column public.messages.author_character is '도트 캐릭터 번호 (0~9)';
comment on column public.messages.content is '메시지 내용';
comment on column public.messages.heart_count is '받은 하트 수';

-- 2. 인덱스 (board별 조회 + Realtime 필터)
create index if not exists messages_board_id_created_at
  on public.messages (board_id, created_at asc);

-- 3. RLS 활성화
alter table public.messages enable row level security;

-- 4. 정책: 누구나 읽기
create policy "messages_select"
  on public.messages for select
  using (true);

-- 5. 정책: 누구나 메시지 삽입
create policy "messages_insert"
  on public.messages for insert
  with check (true);

-- 6. 정책: 누구나 하트 수 업데이트
create policy "messages_update"
  on public.messages for update
  using (true)
  with check (true);

-- 7. Realtime 활성화 (새 메시지·하트 변경 실시간 수신)
-- 에러 나면: Database → Replication 에서 public.messages 토글만 켜면 됨
alter publication supabase_realtime add table public.messages;
