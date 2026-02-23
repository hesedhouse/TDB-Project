-- ============================================================
-- pinned_reports: 전광판 신고 (유저ID, 방ID, 신고사유, 생성시간)
-- 동일 pinned_content(스냅샷)당 30명 이상 신고 시 자동 해제용.
-- Supabase SQL Editor에서 실행.
-- ============================================================

create table if not exists public.pinned_reports (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  user_id uuid null,
  reporter_fingerprint text null,
  report_reason text not null,
  created_at timestamptz not null default now(),
  pinned_until_snapshot timestamptz not null
);

comment on column public.pinned_reports.board_id is '방(보드) ID';
comment on column public.pinned_reports.user_id is '로그인 유저 ID (있을 경우)';
comment on column public.pinned_reports.reporter_fingerprint is '비로그인 시 구분용 지문 (같은 유저 중복 신고 방지)';
comment on column public.pinned_reports.report_reason is '신고 사유 코드 또는 텍스트';
comment on column public.pinned_reports.pinned_until_snapshot is '신고 당시 해당 방의 pinned_until (동일 전광판 묶음용)';

create index if not exists idx_pinned_reports_board_snapshot
  on public.pinned_reports (board_id, pinned_until_snapshot);

alter table public.pinned_reports enable row level security;

create policy "pinned_reports select" on public.pinned_reports for select using (true);
create policy "pinned_reports insert" on public.pinned_reports for insert with check (true);
