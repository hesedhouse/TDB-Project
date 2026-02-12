import { createClient } from './client'
import { isValidUuid } from './client'

const ONE_HOUR_MS = 60 * 60 * 1000

/** Supabase boards 행: id는 UUID */
export type BoardRow = {
  id: string
  keyword: string
  name: string | null
  expires_at: string
  created_at: string
}

/**
 * 키워드로 방을 조회하고, 없으면 생성 후 반환합니다.
 * id는 Supabase가 자동 생성한 UUID입니다.
 * (PromiseLike 방지를 위해 모든 비동기 호출은 await로 처리합니다.)
 */
export async function getOrCreateBoardByKeyword(keyword: string): Promise<BoardRow | null> {
  const supabase = createClient()
  if (!supabase) return null

  const { data: existing, error: selectErr } = await supabase
    .from('boards')
    .select('id, keyword, name, expires_at, created_at')
    .eq('keyword', keyword)
    .maybeSingle()

  if (selectErr) {
    console.error('getOrCreateBoardByKeyword select error:', selectErr)
    return null
  }

  if (existing) {
    return existing as BoardRow
  }

  const { data: inserted, error: insertErr } = await supabase
    .from('boards')
    .insert({
      keyword,
      name: `#${keyword}`,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    })
    .select('id, keyword, name, expires_at, created_at')
    .single()

  if (insertErr) {
    console.error('getOrCreateBoardByKeyword insert error:', insertErr)
    return null
  }

  return inserted as BoardRow
}

/**
 * 해당 방의 expires_at을 현재 저장된 값에서 정확히 1시간 뒤로 업데이트합니다.
 * boardId는 boards.id (UUID)를 넣어야 합니다.
 * 갱신된 expires_at을 반환하며, 실패 시 null을 반환합니다.
 * (PromiseLike 타입 이슈 방지를 위해 모든 비동기 호출은 await로 처리합니다.)
 */
export async function extendBoardExpiry(boardId: string): Promise<Date | null> {
  if (!isValidUuid(boardId)) {
    console.error('extendBoardExpiry: boardId must be a valid UUID', boardId)
    return null
  }
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
  // 정확히 1시간(3600초) 연장
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
