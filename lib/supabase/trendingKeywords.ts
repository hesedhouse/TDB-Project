import { createClient } from './client'

export type FloatingTagSource = 'board' | 'trending'

export type FloatingTag = {
  word: string
  source: FloatingTagSource
}

function normalizeWord(raw: string): string {
  return raw.trim().replace(/^#/, '') || ''
}

const BOARD_RATIO = 0.7
const TRENDING_RATIO = 0.3

/**
 * 플로팅 태그: boards 70% + trending_keywords 30% 비율로 섞어서 반환.
 * Supabase 미설정 시 빈 배열 (호출측에서 mock 사용).
 */
export async function getFloatingTags(limit = 24): Promise<FloatingTag[]> {
  const supabase = createClient()
  if (!supabase) return []

  const boardLimit = Math.max(1, Math.round(limit * BOARD_RATIO))
  const trendLimit = Math.max(0, Math.round(limit * TRENDING_RATIO))

  const fromBoards = supabase
    .from('boards')
    .select('name')
    .order('created_at', { ascending: false })
    .limit(boardLimit)
  const fromTrending = supabase
    .from('trending_keywords')
    .select('word')
    .order('created_at', { ascending: false })
    .limit(trendLimit)

  const [boardsRes, trendingRes] = await Promise.all([
    fromBoards,
    fromTrending,
  ])

  const boardWords: FloatingTag[] = (boardsRes.data ?? [])
    .map((row) => normalizeWord((row.name ?? '').toString()))
    .filter(Boolean)
    .map((word) => ({ word, source: 'board' as const }))

  const trendWords: FloatingTag[] = (trendingRes.data ?? [])
    .map((row) => normalizeWord((row.word ?? '').toString()))
    .filter(Boolean)
    .map((word) => ({ word, source: 'trending' as const }))

  const merged = [...boardWords, ...trendWords]
  for (let i = merged.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [merged[i], merged[j]] = [merged[j], merged[i]]
  }
  return merged.slice(0, limit)
}
