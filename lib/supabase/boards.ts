import { createClient } from './client'

const ONE_HOUR_MS = 60 * 60 * 1000

/**
 * 해당 방의 expires_at을 현재 저장된 값에서 정확히 1시간 뒤로 업데이트합니다.
 * 갱신된 expires_at을 반환하며, 실패 시 null을 반환합니다.
 * (PromiseLike 타입 이슈 방지를 위해 모든 비동기 호출은 await로 처리합니다.)
 */
export async function extendBoardExpiry(boardId: string): Promise<Date | null> {
  const supabase = createClient()
  if (!supabase) return null

  const { data: row, error: fetchErr } = await supabase
    .from('boards')
    .select('expires_at')
    .eq('id', boardId)
    .single()

  if (fetchErr || row == null) {
    console.error('extendBoardExpiry fetch error:', fetchErr)
    return null
  }

  const current = row.expires_at
  const currentDate = typeof current === 'string' ? new Date(current) : current
  const newExpiresAt = new Date(currentDate.getTime() + ONE_HOUR_MS)

  const { error: updateErr } = await supabase
    .from('boards')
    .update({ expires_at: newExpiresAt.toISOString() })
    .eq('id', boardId)

  if (updateErr) {
    console.error('extendBoardExpiry update error:', updateErr)
    return null
  }

  return newExpiresAt
}
