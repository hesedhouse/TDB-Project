import { createClient } from './client'
import { isValidUuid } from './client'

/**
 * room_participants 테이블이 필요합니다. (Supabase SQL Editor에서 생성)
 *
 * create table if not exists room_participants (
 *   id uuid primary key default gen_random_uuid(),
 *   board_id uuid not null references boards(id) on delete cascade,
 *   user_display_name text not null,
 *   is_active boolean not null default true,
 *   updated_at timestamptz not null default now(),
 *   unique(board_id, user_display_name)
 * );
 * alter publication supabase_realtime add table room_participants;
 */

export type RoomParticipant = { user_display_name: string }

/** 방 참여: room_participants에 board_id, user_display_name(닉네임) 저장. is_active = true 로 upsert. 성공 여부 반환. */
export async function joinRoom(boardId: string, nickname: string): Promise<boolean> {
  if (!isValidUuid(boardId)) {
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
      console.warn('[room_participants] joinRoom: invalid boardId', boardId)
    }
    return false
  }
  const name = (nickname || '').trim() || '익명의 수호자'
  const supabase = createClient()
  if (!supabase) {
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
      console.warn('[room_participants] joinRoom: Supabase client unavailable')
    }
    return false
  }
  const payload = {
    board_id: boardId,
    user_display_name: name,
    is_active: true,
    updated_at: new Date().toISOString(),
  }
  const { error } = await supabase.from('room_participants').upsert(payload, {
    onConflict: 'board_id,user_display_name',
  })
  if (error) {
    console.error('[room_participants] joinRoom error (insert 실패):', error.message, error.code, error.details)
    return false
  }
  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
    console.log('[room_participants] 참여자 추가 성공:', { board_id: boardId.slice(0, 8) + '…', user_display_name: name })
  }
  return true
}

/** 방 나가기: 해당 유저를 is_active = false 로 업데이트 */
export async function leaveRoom(boardId: string, nickname: string): Promise<{ ok: boolean; error?: string }> {
  if (!isValidUuid(boardId)) return { ok: false, error: 'invalid board' }
  const name = (nickname || '').trim()
  if (!name) return { ok: false, error: 'nickname required' }
  const supabase = createClient()
  if (!supabase) return { ok: false, error: 'supabase unavailable' }
  const { error } = await supabase
    .from('room_participants')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('board_id', boardId)
    .eq('user_display_name', name)
  if (error) {
    console.error('leaveRoom error:', error)
    return { ok: false, error: error.message }
  }
  return { ok: true }
}

/** 해당 방에서 is_active = true 인 참여자 목록. 행 개수 = 실제 참여자 수. */
export async function getActiveParticipants(boardId: string): Promise<RoomParticipant[]> {
  if (!isValidUuid(boardId)) return []
  const supabase = createClient()
  if (!supabase) return []
  const { data, error } = await supabase
    .from('room_participants')
    .select('user_display_name')
    .eq('board_id', boardId)
    .eq('is_active', true)
  if (error) {
    console.error('[room_participants] getActiveParticipants error:', error.message, error.code)
    return []
  }
  const rows = data ?? []
  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development' && rows.length > 0) {
    console.log('[room_participants] 참여자 수(행 개수):', rows.length, 'board_id:', boardId.slice(0, 8) + '…')
  }
  return rows.map((r) => ({ user_display_name: (r as { user_display_name: string }).user_display_name }))
}

/** room_participants 변경 시 콜백 (Realtime). 나가기/들어오기 시 리스트 갱신용 */
export function subscribeToRoomParticipants(
  boardId: string,
  onUpdate: () => void
): () => void {
  if (!isValidUuid(boardId)) return () => {}
  const supabase = createClient()
  if (!supabase) return () => {}
  const channel = supabase
    .channel(`room_participants:${boardId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'room_participants',
        filter: `board_id=eq.${boardId}`,
      },
      () => onUpdate()
    )
    .subscribe()
  return () => {
    supabase.removeChannel(channel)
  }
}
