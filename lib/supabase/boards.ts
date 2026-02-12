import { createClient } from './client'

const ONE_HOUR_MS = 60 * 60 * 1000

/**
 * 해당 방의 expires_at을 1시간 연장하고, 갱신된 expires_at을 반환합니다.
 * Supabase `boards` 테이블에 id, expires_at 컬럼이 있어야 합니다.
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
