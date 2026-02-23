/**
 * 워프존(Warp Zone) Supabase 저장소.
 * 로그인 유저(auth.uid)별로 워프존 목록을 DB에 저장해 웹/모바일 동기화.
 *
 * Supabase SQL Editor에서 아래 테이블 생성 후 RLS 적용:
 *
 * create table if not exists warp_zones (
 *   user_id uuid not null references auth.users(id) on delete cascade,
 *   board_id text not null,
 *   board_name text not null default '',
 *   nickname text not null default '',
 *   keyword text not null default '',
 *   visited_at timestamptz not null default now(),
 *   expires_at timestamptz null,
 *   primary key (user_id, board_id)
 * );
 *
 * alter table warp_zones enable row level security;
 *
 * create policy "Users can read own warp zones"
 *   on warp_zones for select using (auth.uid() = user_id);
 * create policy "Users can insert own warp zones"
 *   on warp_zones for insert with check (auth.uid() = user_id);
 * create policy "Users can update own warp zones"
 *   on warp_zones for update using (auth.uid() = user_id);
 * create policy "Users can delete own warp zones"
 *   on warp_zones for delete using (auth.uid() = user_id);
 */

import { createClient } from './client'

export type WarpZoneRow = {
  user_id: string
  board_id: string
  board_name: string
  nickname: string
  keyword: string
  visited_at: string
  expires_at: string | null
}

/** 화면용 세션 타입 (activeSessions와 호환) */
export type WarpZoneSession = {
  boardId: string
  boardName: string
  nickname: string
  keyword: string
  visitedAt: number
  expiresAt?: number
}

function rowToSession(row: WarpZoneRow): WarpZoneSession {
  return {
    boardId: row.board_id,
    boardName: row.board_name ?? '',
    nickname: row.nickname ?? '',
    keyword: row.keyword ?? '',
    visitedAt: new Date(row.visited_at).getTime(),
    expiresAt: row.expires_at != null ? new Date(row.expires_at).getTime() : undefined,
  }
}

/** 해당 유저의 워프존 목록을 Supabase에서 조회 (초기 로딩 시 호출) */
export async function getWarpZones(userId: string | null | undefined): Promise<WarpZoneSession[]> {
  if (!userId || typeof userId !== 'string') return []
  const supabase = createClient()
  if (!supabase) return []
  const { data, error } = await supabase
    .from('warp_zones')
    .select('user_id, board_id, board_name, nickname, keyword, visited_at, expires_at')
    .eq('user_id', userId)
    .order('visited_at', { ascending: false })
  if (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[warpZones] getWarpZones error:', error.message, error.code)
    }
    return []
  }
  const rows = (data ?? []) as WarpZoneRow[]
  return rows.map(rowToSession)
}

/** 워프존 추가/갱신 (방 입장·닉네임 제출 시 호출) */
export async function upsertWarpZone(
  userId: string | null | undefined,
  session: {
    boardId: string
    boardName: string
    nickname: string
    keyword: string
    expiresAt?: number
  }
): Promise<boolean> {
  if (!userId || typeof userId !== 'string') return false
  const supabase = createClient()
  if (!supabase) return false
  const now = new Date().toISOString()
  const payload = {
    user_id: userId,
    board_id: session.boardId,
    board_name: session.boardName ?? '',
    nickname: session.nickname ?? '',
    keyword: session.keyword ?? '',
    visited_at: now,
    expires_at: session.expiresAt != null ? new Date(session.expiresAt).toISOString() : null,
  }
  const { error } = await supabase.from('warp_zones').upsert(payload, {
    onConflict: 'user_id,board_id',
  })
  if (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[warpZones] upsertWarpZone error:', error.message, error.code)
    }
    return false
  }
  return true
}

/** 워프존에서 방 제거 */
export async function deleteWarpZoneByBoardId(
  userId: string | null | undefined,
  boardId: string
): Promise<boolean> {
  if (!userId || typeof userId !== 'string') return false
  const supabase = createClient()
  if (!supabase) return false
  const { error } = await supabase
    .from('warp_zones')
    .delete()
    .eq('user_id', userId)
    .eq('board_id', boardId)
  if (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[warpZones] deleteWarpZoneByBoardId error:', error.message, error.code)
    }
    return false
  }
  return true
}
