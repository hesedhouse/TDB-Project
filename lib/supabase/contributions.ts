import { createClient } from './client'
import { isValidUuid } from './client'

export type TopContributor = {
  rank: number
  user_display_name: string
  total_minutes: number
}

const EMPTY_NAME_LABEL = '이름 없음'

/**
 * 모래시계 연장 성공 시 기여도 1건 삽입.
 * @param boardId boards.id (UUID)
 * @param displayName 닉네임 (비어있으면 EMPTY_NAME_LABEL로 저장)
 * @param minutes 기여 분 (예: 30)
 * @param userId 로그인 유저 ID (contributions.user_id, nullable)
 */
export async function recordContribution(
  boardId: string,
  displayName: string,
  minutes: number,
  userId?: string | null
): Promise<void> {
  if (!isValidUuid(boardId) || minutes < 1) return
  const supabase = createClient()
  if (!supabase) return
  const name = (displayName || '').trim() || EMPTY_NAME_LABEL
  try {
    const row: { board_id: string; user_display_name: string; minutes: number } = {
      board_id: boardId,
      user_display_name: name,
      minutes,
    }
    const { error } = await supabase.from('contributions').insert(row)
    if (error && typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
      console.warn('[contributions] recordContribution:', error.message, error.code)
    }
  } catch (e) {
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
      console.warn('[contributions] recordContribution exception:', e)
    }
  }
}

/**
 * 해당 방의 기여도 TOP 3 (총 기여 분 기준).
 * DB 컬럼명: board_id, user_display_name, minutes (스키마와 일치).
 * 데이터 없음·에러 시 빈 배열 반환 (400 미노출).
 */
export async function getTopContributors(boardId: string): Promise<TopContributor[]> {
  if (!isValidUuid(boardId)) return []
  const supabase = createClient()
  if (!supabase) return []

  try {
    const { data: rows, error } = await supabase
      .from('contributions')
      .select('user_display_name, minutes')
      .eq('board_id', boardId)

    if (error) {
      if (error.code === '42703') {
        return getTopContributorsFallback(supabase, boardId)
      }
      if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
        console.warn('[contributions] getTopContributors:', error.message, error.code)
      }
      return []
    }
    if (rows == null || !Array.isArray(rows) || rows.length === 0) return []
    const byName = new Map<string, number>()
    for (const r of rows) {
      const name = (r as { user_display_name?: string; minutes?: number }).user_display_name ?? EMPTY_NAME_LABEL
      const mins = Number((r as { minutes?: number }).minutes) || 0
      byName.set(name, (byName.get(name) ?? 0) + mins)
    }
    const sorted = [...byName.entries()]
      .map(([user_display_name, total_minutes]) => ({ user_display_name, total_minutes }))
      .sort((a, b) => b.total_minutes - a.total_minutes)
      .slice(0, 3)
    return sorted.map((row, i) => ({ ...row, rank: i + 1 }))
  } catch (e) {
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
      console.warn('[contributions] getTopContributors exception:', e)
    }
    return []
  }
}

/** user_display_name 컬럼 없을 때: minutes만 조회. 에러·빈 결과 시 [] */
async function getTopContributorsFallback(
  supabase: NonNullable<ReturnType<typeof createClient>>,
  boardId: string
): Promise<TopContributor[]> {
  try {
    const { data: rows, error } = await supabase
      .from('contributions')
      .select('minutes')
      .eq('board_id', boardId)
    if (error || rows == null || !Array.isArray(rows) || rows.length === 0) return []
    const total = rows.reduce((sum, r) => sum + (Number((r as { minutes?: number }).minutes) || 0), 0)
    if (total <= 0) return []
    return [{ rank: 1, user_display_name: EMPTY_NAME_LABEL, total_minutes: total }]
  } catch {
    return []
  }
}

/**
 * contributions 테이블 변경 시 콜백 호출 (Realtime).
 * board_id가 일치하는 INSERT 시에만 refetch 하려면 콜백에서 boardId 비교.
 */
export function subscribeToContributions(
  boardId: string,
  onUpdate: () => void
): () => void {
  if (!isValidUuid(boardId)) return () => {}
  const supabase = createClient()
  if (!supabase) return () => {}
  const channel = supabase
    .channel(`contributions:${boardId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'contributions',
        filter: `board_id=eq.${boardId}`,
      },
      () => onUpdate()
    )
    .subscribe()
  return () => {
    supabase.removeChannel(channel)
  }
}
