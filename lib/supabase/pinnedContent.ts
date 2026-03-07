import { createClient } from './client'
import { isValidUuid } from './client'

export type PinnedContentPayload =
  | { type: 'youtube'; url: string; start_seconds?: number; end_seconds?: number }
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
  let type = obj?.type
  const url = typeof obj?.url === 'string' ? obj.url.trim() : ''
  if (!url) return null
  const inferred = inferPinContentType(url)
  if (type !== 'youtube' && type !== 'image') type = inferred
  else if (inferred && type !== inferred) type = inferred
  if (type !== 'youtube' && type !== 'image') return null
  const pinnedUntil = new Date(until)
  if (Number.isNaN(pinnedUntil.getTime())) return null
  const pinnedAt = row?.pinned_at ? new Date(row.pinned_at) : undefined
  const startSec = typeof obj?.start_seconds === 'number' && obj.start_seconds >= 0 ? Math.floor(obj.start_seconds) : undefined
  const endSec = typeof obj?.end_seconds === 'number' && obj.end_seconds >= 0 ? Math.floor(obj.end_seconds) : undefined
  const content: PinnedContentPayload =
    type === 'youtube'
      ? { type: 'youtube', url, ...(startSec != null && { start_seconds: startSec }), ...(endSec != null && { end_seconds: endSec }) }
      : { type: 'image', url }
  if (pinnedAt != null && Number.isNaN(pinnedAt.getTime())) return { content, pinnedUntil }
  return { content, pinnedUntil, pinnedAt }
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

/** 고정 전광판 변경 실시간 구독. 구독 해제 함수 반환.
 * 누군가 '전광판에 띄우기'로 업데이트하면 boards UPDATE가 발생하고, 이 채널을 구독한 방 안 모든 유저의 onUpdate가 호출됨. */
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
        try {
          const row = payload.new as { pinned_content?: unknown; pinned_until?: string | null; pinned_at?: string | null }
          const state = parseRow(row)
          if (state && state.pinnedUntil.getTime() <= Date.now()) {
            onUpdate(null)
            return
          }
          onUpdate(state)
        } catch {
          onUpdate(null)
        }
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

/** URL이 YouTube 링크인지 (youtube.com / youtu.be 포함) */
export function isYouTubeUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false
  const u = url.trim().toLowerCase()
  return u.includes('youtube.com') || u.includes('youtu.be')
}

/** URL이 이미지 확장자로 끝나거나 이미지 호스트인지 */
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|svg|avif)(\?.*)?$/i
export function isImageUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false
  const u = url.trim()
  return IMAGE_EXT.test(u) || /\.(png|jpe?g|gif|webp)(\?|$)/i.test(u)
}

/** URL만 보고 전광판 콘텐츠 타입 추론 (youtube → 플레이어, 이미지 확장자 → 이미지) */
export function inferPinContentType(url: string): 'youtube' | 'image' | null {
  if (!url?.trim()) return null
  if (isYouTubeUrl(url)) return 'youtube'
  if (isImageUrl(url)) return 'image'
  return null
}

/** mm:ss 또는 초 단위 문자열을 초( number )로. 빈 문자열/잘못된 형식은 undefined */
export function parseMmSsToSeconds(input: string): number | undefined {
  const s = (input ?? '').trim()
  if (!s) return undefined
  const parts = s.split(':').map((p) => parseInt(p, 10))
  if (parts.some((n) => Number.isNaN(n) || n < 0)) return undefined
  if (parts.length === 1) return parts[0]!
  if (parts.length === 2) return parts[0]! * 60 + parts[1]!
  if (parts.length === 3) return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!
  return undefined
}

/** 초( number )를 m:ss 형식 문자열로 */
export function secondsToMmSs(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const m = Math.floor(s / 60)
  const sec = s % 60
  return m > 0 ? `${m}:${String(sec).padStart(2, '0')}` : String(sec)
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
