import { createClient } from './client'

export type FloatingTagSource = 'board' | 'trending'

export type FloatingTag = {
  word: string
  source: FloatingTagSource
}

function normalizeWord(raw: string): string {
  return raw.trim().replace(/^#/, '') || ''
}

/** 메인 화면을 realtime_news로 가득 채우고, 여유분만 boards에서 보충 */
const REALTIME_RATIO = 0.85
const BOARD_RATIO = 0.15

/**
 * 플로팅 태그: trending_keywords(source=realtime_news) 우선으로 메인 화면 가득 채움.
 * 부족 시 boards에서 일부 보충. Supabase 미설정 시 빈 배열 (호출측에서 mock 사용).
 */
export async function getFloatingTags(limit = 24): Promise<FloatingTag[]> {
  const supabase = createClient()
  if (!supabase) return []

  const realtimeLimit = Math.max(0, Math.round(limit * REALTIME_RATIO))
  const boardLimit = Math.max(0, Math.round(limit * BOARD_RATIO))

  const fromRealtime = supabase
    .from('trending_keywords')
    .select('word')
    .eq('source', 'realtime_news')
    .order('created_at', { ascending: false })
    .limit(realtimeLimit)
  const fromBoards = supabase
    .from('boards')
    .select('name')
    .order('created_at', { ascending: false })
    .limit(boardLimit)

  let realtimeRes = await fromRealtime
  const boardsRes = await fromBoards

  let realtimeWords: FloatingTag[] = (realtimeRes.data ?? [])
    .map((row) => normalizeWord((row.word ?? '').toString()))
    .filter(Boolean)
    .map((word) => ({ word, source: 'trending' as const }))

  if (realtimeWords.length === 0) {
    const anyTrending = await supabase
      .from('trending_keywords')
      .select('word')
      .order('created_at', { ascending: false })
      .limit(realtimeLimit)
    realtimeWords = (anyTrending.data ?? [])
      .map((row) => normalizeWord((row.word ?? '').toString()))
      .filter(Boolean)
      .map((word) => ({ word, source: 'trending' as const }))
  }

  const boardWords: FloatingTag[] = (boardsRes.data ?? [])
    .map((row) => normalizeWord((row.name ?? '').toString()))
    .filter(Boolean)
    .map((word) => ({ word, source: 'board' as const }))

  const merged = [...realtimeWords, ...boardWords]
  for (let i = merged.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [merged[i], merged[j]] = [merged[j], merged[i]]
  }
  return merged.slice(0, limit)
}
