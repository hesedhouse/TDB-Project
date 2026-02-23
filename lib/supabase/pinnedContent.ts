import { createClient } from './client'
import { isValidUuid } from './client'

export type PinnedContentPayload =
  | { type: 'youtube'; url: string }
  | { type: 'image'; url: string }

export type PinnedState = {
  content: PinnedContentPayload
  pinnedUntil: Date
  /** 영상이 처음 고정된 시각. 동시 시청(Watch Together) 싱크용. */
  pinnedAt?: Date
} | null

const PIN_DURATION_MS = 5 * 60 * 1000

function parseRow(row: {
  pinned_content?: unknown
  pinned_until?: string | null
  pinned_at?: string | null
}): PinnedState {
  const raw = row?.pinned_content
  const until = row?.pinned_until
  if (!raw || typeof raw !== 'object' || !until) return null
  const obj = raw as Record<string, unknown>
  const type = obj?.type
  const url = typeof obj?.url === 'string' ? obj.url : ''
  if ((type !== 'youtube' && type !== 'image') || !url) return null
  const pinnedUntil = new Date(until)
  if (Number.isNaN(pinnedUntil.getTime())) return null
  const pinnedAt = row?.pinned_at ? new Date(row.pinned_at) : undefined
  if (pinnedAt != null && Number.isNaN(pinnedAt.getTime())) return { content: { type: type as 'youtube' | 'image', url }, pinnedUntil }
  return { content: { type: type as 'youtube' | 'image', url }, pinnedUntil, pinnedAt }
}

/** 해당 방의 현재 고정 전광판 조회. 만료됐으면 null. */
export async function getPinnedContent(boardId: string): Promise<PinnedState> {
  if (!isValidUuid(boardId)) return null
  const supabase = createClient()
  if (!supabase) return null
  const { data, error } = await supabase
    .from('boards')
    .select('pinned_content, pinned_until, pinned_at')
    .eq('id', boardId)
    .maybeSingle()
  if (error || !data) return null
  const state = parseRow(data as { pinned_content?: unknown; pinned_until?: string | null; pinned_at?: string | null })
  if (!state) return null
  if (state.pinnedUntil.getTime() <= Date.now()) return null
  return state
}

/**
 * 고정 전광판 설정. 모래시계 차감은 클라이언트에서 처리.
 * 성공 시 true. 실패 시 false.
 */
export async function setPinnedContent(
  boardId: string,
  payload: PinnedContentPayload
): Promise<boolean> {
  if (!isValidUuid(boardId)) return false
  const supabase = createClient()
  if (!supabase) return false
  const now = new Date()
  const pinnedUntil = new Date(now.getTime() + PIN_DURATION_MS)
  const { error } = await supabase
    .from('boards')
    .update({
      pinned_content: payload,
      pinned_until: pinnedUntil.toISOString(),
      pinned_at: now.toISOString(),
    })
    .eq('id', boardId)
  if (error) {
    console.error('setPinnedContent error:', error)
    return false
  }
  return true
}

/** 고정 전광판 변경 실시간 구독. 구독 해제 함수 반환. */
export function subscribePinnedContent(
  boardId: string,
  onUpdate: (state: PinnedState) => void
): () => void {
  if (!isValidUuid(boardId)) return () => {}
  const supabase = createClient()
  if (!supabase) return () => {}

  const channel = supabase
    .channel(`pinned:board_id=eq.${boardId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'boards',
        filter: `id=eq.${boardId}`,
      },
      (payload) => {
        const row = payload.new as { pinned_content?: unknown; pinned_until?: string | null; pinned_at?: string | null }
        const state = parseRow(row)
        if (state && state.pinnedUntil.getTime() <= Date.now()) {
          onUpdate(null)
          return
        }
        onUpdate(state)
      }
    )
  channel.subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}

/** YouTube URL에서 video ID 추출 (iframe용) */
export function getYouTubeVideoId(url: string): string | null {
  if (!url || typeof url !== 'string') return null
  const u = url.trim()
  const patterns = [
    /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
    /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
  ]
  for (const p of patterns) {
    const m = u.match(p)
    if (m?.[1]) return m[1]
  }
  return null
}

/** 1분 릴레이 전광판: 모든 콘텐츠 동일 규칙 — 모래시계 1개 / 1분 고정·연장 */
export type PinTier = { hourglasses: 1; durationMinutes: 1 }

export function getPinTier(
  pinType: 'youtube' | 'image',
  urlOrEmpty: string
): PinTier | null {
  if (pinType === 'image') return { hourglasses: 1, durationMinutes: 1 }
  const u = (urlOrEmpty ?? '').trim()
  if (!u) return null
  if (!getYouTubeVideoId(u)) return null
  return { hourglasses: 1, durationMinutes: 1 }
}
