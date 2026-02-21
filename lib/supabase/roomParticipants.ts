import { createClient } from './client'
import { isValidUuid } from './client'

/**
 * room_participants 테이블이 필요합니다. (Supabase SQL Editor에서 생성/업데이트)
 *
 * create table if not exists room_participants (
 *   id uuid primary key default gen_random_uuid(),
 *   board_id uuid not null references boards(id) on delete cascade,
 *   user_id uuid null,
 *   user_display_name text not null,
 *   is_active boolean not null default true,
 *   updated_at timestamptz not null default now(),
 *   unique(board_id, user_display_name)
 * );
 * alter table room_participants add column if not exists user_id uuid null;
 * create unique index if not exists room_participants_board_user_key
 *   on room_participants(board_id, user_id) where user_id is not null;
 * alter publication supabase_realtime add table room_participants;
 */

export type RoomParticipant = { user_display_name: string }

/** 현재 사용자(ID)가 해당 방에 이미 등록되어 있는지 확인. 있으면 사용했던 닉네임 반환, 없으면 null. */
export async function getExistingParticipantForUser(
  boardId: string,
  userId: string | null | undefined
): Promise<{ user_display_name: string } | null> {
  if (!isValidUuid(boardId) || !userId || typeof userId !== 'string') return null
  const supabase = createClient()
  if (!supabase) return null
  const { data, error } = await supabase
    .from('room_participants')
    .select('user_display_name')
    .eq('board_id', boardId)
    .eq('user_id', userId)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()
  if (error) {
    if (error.code !== 'PGRST116') console.error('[room_participants] getExistingParticipantForUser error:', error.message)
    return null
  }
  const row = data as { user_display_name?: string } | null
  if (!row?.user_display_name) return null
  return { user_display_name: row.user_display_name }
}

/** 방 참여: board_id, user_display_name(닉네임), 선택적으로 user_id 저장. is_active = true 로 upsert. */
export async function joinRoom(
  boardId: string,
  nickname: string,
  userId?: string | null
): Promise<boolean> {
  if (!isValidUuid(boardId)) {
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
      console.warn('[room_participants] joinRoom: invalid boardId', boardId)
    }
    return false
  }
  const name = (nickname || '').trim()
  if (!name) {
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
      console.warn('[room_participants] joinRoom: nickname 비어있음, 등록하지 않음')
    }
    return false
  }
  const supabase = createClient()
  if (!supabase) {
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
      console.warn('[room_participants] joinRoom: Supabase client unavailable')
    }
    return false
  }
  const updatedAt = new Date().toISOString()
  if (userId && typeof userId === 'string') {
    const payload = {
      board_id: boardId,
      user_id: userId,
      user_display_name: name,
      is_active: true,
      updated_at: updatedAt,
    }
    const { error } = await supabase.from('room_participants').upsert(payload, {
      onConflict: 'board_id,user_id',
    })
    if (error) {
      console.error('[room_participants] joinRoom error (upsert by user_id):', error.message, error.code, error.details)
      return false
    }
  } else {
    const payload = {
      board_id: boardId,
      user_display_name: name,
      is_active: true,
      updated_at: updatedAt,
    }
    const { error } = await supabase.from('room_participants').upsert(payload, {
      onConflict: 'board_id,user_display_name',
    })
    if (error) {
      console.error('[room_participants] joinRoom error (insert 실패):', error.message, error.code, error.details)
      return false
    }
  }
  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
    console.log('[room_participants] 참여자 추가 성공:', { board_id: boardId.slice(0, 8) + '…', user_display_name: name })
  }
  return true
}

/** 방 나가기: user_id 있으면 user_id 기준, 없으면 user_display_name 기준으로 is_active = false */
export async function leaveRoom(
  boardId: string,
  nickname: string,
  userId?: string | null
): Promise<{ ok: boolean; error?: string }> {
  if (!isValidUuid(boardId)) return { ok: false, error: 'invalid board' }
  const supabase = createClient()
  if (!supabase) return { ok: false, error: 'supabase unavailable' }
  const updated = { is_active: false, updated_at: new Date().toISOString() }
  if (userId && typeof userId === 'string') {
    const { error } = await supabase
      .from('room_participants')
      .update(updated)
      .eq('board_id', boardId)
      .eq('user_id', userId)
    if (error) {
      console.error('leaveRoom error (by user_id):', error)
      return { ok: false, error: error.message }
    }
    return { ok: true }
  }
  const name = (nickname || '').trim()
  if (!name) return { ok: false, error: 'nickname required' }
  const { error } = await supabase
    .from('room_participants')
    .update(updated)
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
