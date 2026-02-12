import { createClient } from './client'
import { isValidUuid } from './client'

const ONE_HOUR_MS = 60 * 60 * 1000

/** Supabase boards 행: id는 UUID, 검색은 keyword만 사용. 컬럼은 name으로 통일 (title 사용 안 함) */
export type BoardRow = {
  id: string
  keyword: string
  name: string | null
  expires_at: string
  created_at: string
}

/** BoardRow 별칭 (Board | null 리턴 타입용) */
export type Board = BoardRow

/**
 * 방 제목(키워드)으로 방을 조회하고, 없으면 새로 생성 후 반환합니다.
 * - DB 컬럼: id(uuid), keyword(text), name(text), expires_at(timestamptz), created_at(timestamptz)
 * - 검색은 keyword만 사용. id는 검색/입력하지 않음.
 */
export async function getOrCreateBoardByKeyword(keyword: string): Promise<BoardRow | null> {
  const supabase = createClient()
  if (!supabase) return null

  const normalizedKeyword = keyword.trim()
  if (!normalizedKeyword) return null

  // 1) keyword 컬럼으로만 조회 (DB에 keyword, name 컬럼이 있어야 함)
  const selectColumns = 'id, keyword, name, expires_at, created_at' as const
  const { data: existing, error: selectErr } = await supabase
    .from('boards')
    .select(selectColumns)
    .eq('keyword', normalizedKeyword)
    .maybeSingle()

  if (selectErr) {
    console.error('getOrCreateBoardByKeyword select error:', selectErr)
    return null
  }

  if (existing != null) {
    return {
      id: existing.id,
      keyword: existing.keyword,
      name: existing.name ?? null,
      expires_at: existing.expires_at,
      created_at: existing.created_at,
    }
  }

  // 2) 없으면 생성. id는 넣지 않음(DB 자동 생성). keyword, name만 넣음.
  const insertPayload = {
    keyword: normalizedKeyword,
    name: `#${normalizedKeyword}`,
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  }
  const { data: inserted, error: insertErr } = await supabase
    .from('boards')
    .insert(insertPayload)
    .select(selectColumns)
    .single()

  if (insertErr) {
    console.error('getOrCreateBoardByKeyword insert error:', insertErr)
    return null
  }

  if (inserted == null) return null
  return {
    id: inserted.id,
    keyword: inserted.keyword,
    name: inserted.name ?? null,
    expires_at: inserted.expires_at,
    created_at: inserted.created_at,
  }
}

/**
 * UUID로 방을 조회합니다. (URL이 /board/[uuid] 일 때 사용). 반환: Board | null
 */
export async function getBoardById(id: string): Promise<BoardRow | null> {
  if (!isValidUuid(id)) return null
  const supabase = createClient()
  if (!supabase) return null

  const { data, error } = await supabase
    .from('boards')
    .select('id, keyword, name, expires_at, created_at')
    .eq('id', id)
    .maybeSingle()

  if (error || data == null) {
    if (error) console.error('getBoardById error:', error)
    return null
  }
  return {
    id: data.id,
    keyword: data.keyword,
    name: data.name ?? null,
    expires_at: data.expires_at,
    created_at: data.created_at,
  }
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
