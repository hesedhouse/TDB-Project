# TDB (떴다방) - 7-Day Ephemeral Community Prototype

7일 후 소멸하는 휘발성 커뮤니티 프로토타입입니다.

## 기술 스택

- **Next.js 14** - React 프레임워크
- **TypeScript** - 타입 안정성
- **Tailwind CSS** - 스타일링
- **Framer Motion** - 애니메이션
- **date-fns** - 날짜 처리
- **Supabase** - 실시간 채팅(메시지 저장, Realtime, 하트 반영)

## 주요 기능

### 1. Home Dashboard
- TDB 로고 및 하트 잔액 표시
- 트렌드 키워드 버블 애니메이션
- Warp Zone: 참여 중인 방 (더블클릭으로 워프)
- Live Boards: 활발한 게시판 리스트

### 2. Entry Gate
- 10개의 8-bit 도트 캐릭터 선택
- 닉네임 입력 및 랜덤 생성 (🎲)
- Bottom Sheet 형태의 입장 화면

### 3. Pulse Feed
- 게시판 남은 수명 프로그레스 바
- 최신순/인기순 필터
- 말풍선 형태의 피드 (글래스모피즘)
- 사진 캐러셀 (최대 5장)
- 유튜브/인스타 링크 썸네일
- 하트 인터랙션 (더블탭/길게 누르기)
- 하트를 받으면 게시판 수명 연장
- **Supabase 연동 시**: 실시간 채팅, 내 메시지(오른쪽)/남 메시지(왼쪽), 하단 입력창, 하트 DB 반영

## 디자인 테마

- **배경**: 순수 검정 (#000000)
- **악센트**: 네온 오렌지 (#FF5F00)
- **스타일**: 글래스모피즘, 8-bit 픽셀 아트 캐릭터

## 설치 및 실행

```bash
# 의존성 설치
npm install

# 개발 서버 실행
npm run dev

# 프로덕션 빌드
npm run build
npm start
```

브라우저에서 [http://localhost:3000](http://localhost:3000)을 열어 확인하세요.

### Supabase 실시간 채팅 (선택)

실시간 대화 기능을 쓰려면 Supabase 프로젝트를 만들고 환경 변수를 설정한 뒤, `messages` 테이블과 Realtime을 설정해야 합니다.

1. **환경 변수**: `.env.example`을 참고해 `.env.local`에 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` 추가
2. **DB 및 Realtime**: [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md)에 안내된 SQL로 테이블·RLS·Realtime 설정

설정이 없으면 기존 목업 피드만 동작합니다.

## 프로젝트 구조

```
app/
  layout.tsx          # 루트 레이아웃
  page.tsx            # 메인 페이지 (라우팅)
  globals.css         # 전역 스타일

components/
  HomeDashboard.tsx   # 홈 대시보드
  EntryGate.tsx       # 입장 게이트
  PulseFeed.tsx       # 피드 화면
  DotCharacter.tsx    # 8-bit 캐릭터 컴포넌트

lib/
  mockData.ts         # Mock 데이터 및 유틸리티
  nicknames.ts        # 랜덤 닉네임 생성
  supabase/
    client.ts         # Supabase 브라우저 클라이언트
    types.ts          # Message 타입
    messages.ts       # 메시지 조회/전송/하트/Realtime 구독
docs/
  SUPABASE_SETUP.md   # Supabase 테이블·RLS·Realtime 설정 가이드
```

## 주요 특징

- **7일 자동 삭제**: 게시판은 생성 후 7일이 지나면 자동으로 만료됩니다.
- **하트로 수명 연장**: 하트를 받으면 게시판 수명이 연장됩니다 (10개당 1시간).
- **실시간 프로그레스**: 게시판 남은 시간이 실시간으로 업데이트됩니다.
- **부드러운 애니메이션**: Framer Motion을 활용한 세련된 인터랙션
