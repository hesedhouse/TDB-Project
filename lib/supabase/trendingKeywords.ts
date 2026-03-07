import { createClient } from './client'

export type FloatingTagSource = 'board' | 'trending'

export type FloatingTag = {
  word: string
  source: FloatingTagSource
}

function normalizeWord(raw: string): string {
  return raw.trim().replace(/^#/, '') || ''
}

/** 메인 화면: 트렌드(google/youtube 등) 우선, 부족 시 boards 보충 */
const TREND_RATIO = 0.85
const BOARD_RATIO = 0.15

function extractWord(row: { keyword?: string | null; word?: string | null }): string {
  const raw = (row.keyword ?? row.word ?? '').toString().trim()
  return normalizeWord(raw)
}

/**
 * 플로팅 태그: trending_keywords(실시간 트렌드) 우선으로 메인 화면에 표시.
 * source=google | youtube | realtime_news 등. keyword 컬럼 사용, 없으면 word 폴백.
 * 부족 시 boards에서 보충. Supabase 미설정 시 빈 배열 (호출측에서 mock 사용).
 */
export async function getFloatingTags(limit = 24): Promise<FloatingTag[]> {
  const supabase = createClient()
  if (!supabase) return []

  const trendLimit = Math.max(0, Math.round(limit * TREND_RATIO))
  const boardLimit = Math.max(0, Math.round(limit * BOARD_RATIO))

  // 실시간 트렌드: 최신 trending_keywords (platform 구분 없이 최신순)
  const { data: trendData } = await supabase
    .from('trending_keywords')
    .select('keyword, word')
    .order('created_at', { ascending: false })
    .limit(trendLimit)

  let trendWords: FloatingTag[] = (trendData ?? [])
    .map((row) => extractWord(row))
    .filter(Boolean)
    .map((word) => ({ word, source: 'trending' as const }))

  const { data: boardsData } = await supabase
    .from('boards')
    .select('name')
    .order('created_at', { ascending: false })
    .limit(boardLimit)

  const boardWords: FloatingTag[] = (boardsData ?? [])
    .map((row) => normalizeWord((row.name ?? '').toString()))
    .filter(Boolean)
    .map((word) => ({ word, source: 'board' as const }))

  const merged = [...trendWords, ...boardWords]
  for (let i = merged.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [merged[i], merged[j]] = [merged[j], merged[i]]
  }
  return merged.slice(0, limit)
}
