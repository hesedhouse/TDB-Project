# Supabase 실시간 채팅 설정 가이드

POPPIN 앱의 실시간 대화 기능을 사용하려면 Supabase 프로젝트를 만들고 아래 설정을 적용하세요.

## 1. Supabase 프로젝트 생성

1. [Supabase](https://supabase.com)에 로그인 후 **New Project**로 프로젝트 생성
2. **Settings → API**에서 다음 값을 확인:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`로 사용
   - **anon public** 키 → `NEXT_PUBLIC_SUPABASE_ANON_KEY`로 사용

## 2. 환경 변수 설정

프로젝트 루트에 `.env.local` 파일을 만들고 아래를 추가하세요.

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

- Supabase 대시보드 **Settings → API** 에서 **Project URL**과 **anon public** 키를 복사해 넣습니다.
- 키는 반드시 `NEXT_PUBLIC_` 접두사가 있어야 브라우저에서 사용할 수 있습니다.

## 3. messages 테이블 생성

Supabase 대시보드 **SQL Editor**에서 아래 SQL을 실행하세요.

```sql
-- messages 테이블
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

-- 인덱스 (board별 최신순 조회 및 Realtime 필터용)
create index if not exists messages_board_id_created_at
  on public.messages (board_id, created_at asc);

-- Row Level Security (RLS) 활성화
alter table public.messages enable row level security;

-- 누구나 읽기 가능
create policy "messages select"
  on public.messages for select
  using (true);

-- 누구나 삽입 가능 (익명 채팅)
create policy "messages insert"
  on public.messages for insert
  with check (true);

-- 누구나 heart_count만 업데이트 가능
create policy "messages update heart"
  on public.messages for update
  using (true)
  with check (true);
```

## 3.5 boards 테이블 생성/마이그레이션 (방 생성/직통 입장)

홈에서 방 생성/조회 및 **숫자 방 번호로 직통 입장(No. 123)** 기능을 사용하려면 `boards` 테이블이 필요합니다.

- `supabase/boards_table.sql` 실행 (최초 생성)
- `supabase/boards_migration_add_name.sql` 실행 (name 컬럼 보강)
- `supabase/boards_migration_public_id.sql` 실행 (**숫자 방 번호(public_id)** 추가)

## 4. Realtime 활성화

1. Supabase 대시보드 **Database → Replication** 이동
2. **public.messages** 테이블 옆 토글을 켜서 Realtime 활성화

또는 SQL로:

```sql
-- publication에 messages 테이블 추가 (Realtime용)
alter publication supabase_realtime add table public.messages;
```

이후 새 메시지(INSERT)와 하트 수 변경(UPDATE)이 실시간으로 클라이언트에 전달됩니다.

## 5. Storage (tdb-images) - 채팅 사진

채팅에서 올린 사진은 **Storage** 버킷 `tdb-images`에 저장됩니다.

1. **Storage** → **New bucket** → 이름 `tdb-images` 생성
2. 버킷 설정에서 **Public bucket** 을 켜서 업로드된 이미지 URL이 브라우저에서 보이게 합니다.
3. **SQL Editor**에서 아래 정책 실행 (누구나 업로드·조회 가능):

```sql
CREATE POLICY "Public Access"
ON storage.objects FOR ALL
USING ( bucket_id = 'tdb-images' )
WITH CHECK ( bucket_id = 'tdb-images' );
```

또는 프로젝트의 `supabase/storage_tdb_images_policy.sql` 파일 내용을 복사해 실행하면 됩니다.

## 6. 동작 확인

1. `npm run dev`로 앱 실행
2. 홈에서 게시판 입장 → Entry Gate에서 캐릭터·닉네임 입력 후 입장
3. 하단 입력창에 메시지 입력 후 전송 → 목록에 즉시 표시
4. 다른 기기/탭에서 같은 방에 들어가 메시지를 보내면 새로고침 없이 나타나는지 확인
5. 메시지 하단 하트 버튼 클릭 시 숫자 증가 및 DB 반영 확인
6. 입력창 옆 📷 버튼으로 사진 선택 → 업로드 후 메시지와 함께 전송·표시 확인

## 문제 해결

- **메시지가 안 보일 때**: RLS 정책과 Realtime이 위 설정대로 적용되었는지 확인
- **Realtime이 동작하지 않을 때**: Replication 화면에서 `messages` 테이블이 켜져 있는지, 브라우저 콘솔에 Supabase 에러가 없는지 확인
- **CORS 에러**: Supabase 프로젝트 URL이 `.env.local`의 URL과 일치하는지 확인
