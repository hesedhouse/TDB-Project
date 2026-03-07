import { createClient } from './client'
import { isValidUuid } from './client'
import type { PinnedContentPayload } from './pinnedContent'

export type BillboardQueueItem = {
  id: string
  board_id: string
  content_url: string
  type: 'youtube' | 'image'
  creator_id: string | null
  created_at: string
  start_time?: number | null
  end_time?: number | null
}

/** 전광판 예약 대기열에 추가. 성공 시 true */
export async function addToQueue(
  boardId: string,
  payload: {
    type: 'youtube' | 'image'
    url: string
    creatorId?: string | null
    startTime?: number | null
    endTime?: number | null
  }
): Promise<boolean> {
  if (!isValidUuid(boardId)) return false
  const supabase = createClient()
  if (!supabase) return false
  const { error } = await supabase.from('billboard_queue').insert({
    board_id: boardId,
    content_url: payload.url.trim(),
    type: payload.type,
    creator_id: payload.creatorId ?? null,
    ...(payload.startTime != null && { start_time: payload.startTime }),
    ...(payload.endTime != null && { end_time: payload.endTime }),
  })
  if (error) {
    console.error('billboardQueue addToQueue:', error)
    return false
  }
  return true
}

/** 해당 방의 대기열 목록 (가장 먼저 들어온 순) */
export async function getQueueForBoard(boardId: string): Promise<BillboardQueueItem[]> {
  if (!isValidUuid(boardId)) return []
  const supabase = createClient()
  if (!supabase) return []
  const { data, error } = await supabase
    .from('billboard_queue')
    .select('id, board_id, content_url, type, creator_id, created_at, start_time, end_time')
    .eq('board_id', boardId)
    .order('created_at', { ascending: true })
  if (error) return []
  return (data ?? []) as BillboardQueueItem[]
}

/** 해당 방의 대기열 개수 */
export async function getQueueCount(boardId: string): Promise<number> {
  if (!isValidUuid(boardId)) return 0
  const supabase = createClient()
  if (!supabase) return 0
  const { count, error } = await supabase
    .from('billboard_queue')
    .select('id', { count: 'exact', head: true })
    .eq('board_id', boardId)
  if (error) return 0
  return count ?? 0
}

/** 대기열 실시간 구독 (개수/목록 갱신용). 구독 해제 함수 반환 */
export function subscribeBillboardQueue(
  boardId: string,
  onUpdate: (items: BillboardQueueItem[]) => void
): () => void {
  if (!isValidUuid(boardId)) return () => {}
  const supabase = createClient()
  if (!supabase) return () => {}
  const channel = supabase
    .channel(`billboard_queue:board_id=eq.${boardId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'billboard_queue', filter: `board_id=eq.${boardId}` },
      () => {
        getQueueForBoard(boardId).then(onUpdate)
      }
    )
  channel.subscribe()
  getQueueForBoard(boardId).then(onUpdate)
  return () => { supabase.removeChannel(channel) }
}

export type PopNextResult =
  | { ok: true; payload: PinnedContentPayload; pinnedUntil: string; pinnedAt: string }
  | { ok: false; reason: 'empty' | 'error' }
