import { createClient } from './client'
import { isValidUuid } from './client'

export type TopContributor = {
  rank: number
  user_display_name: string
  total_minutes: number
}

/**
 * 모래시계 연장 성공 시 기여도 1건 삽입.
 * @param boardId boards.id (UUID)
 * @param displayName 닉네임 또는 '익명의 수호자'
 * @param minutes 기여 분 (예: 30)
 */
export async function recordContribution(
  boardId: string,
  displayName: string,
  minutes: number
): Promise<void> {
  if (!isValidUuid(boardId) || minutes < 1) return
  const supabase = createClient()
  if (!supabase) return
  const name = (displayName || '').trim() || '익명의 수호자'
  await supabase.from('contributions').insert({
    board_id: boardId,
    user_display_name: name,
    minutes,
  })
}

/**
 * 해당 방의 기여도 TOP 3 (총 기여 분 기준).
 * 동일 user_display_name은 합산 후 순위.
 */
export async function getTopContributors(boardId: string): Promise<TopContributor[]> {
  if (!isValidUuid(boardId)) return []
  const supabase = createClient()
  if (!supabase) return []
  const { data: rows, error } = await supabase
    .from('contributions')
    .select('user_display_name, minutes')
    .eq('board_id', boardId)
  if (error) {
    console.error('getTopContributors error:', error)
    return []
  }
  if (!rows?.length) return []
  const byName = new Map<string, number>()
  for (const r of rows) {
    const name = r.user_display_name ?? '익명의 수호자'
    byName.set(name, (byName.get(name) ?? 0) + (r.minutes ?? 0))
  }
  const sorted = [...byName.entries()]
    .map(([user_display_name, total_minutes]) => ({ user_display_name, total_minutes }))
    .sort((a, b) => b.total_minutes - a.total_minutes)
    .slice(0, 3)
  return sorted.map((row, i) => ({ ...row, rank: i + 1 }))
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
