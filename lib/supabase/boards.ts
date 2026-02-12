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
 * - 검색은 keyword 컬럼만 사용. id는 검색/입력하지 않음.
 * - DB에는 name 컬럼 사용 (title 아님). 400 나면 boards_migration_add_name.sql 실행.
 * - 반환 타입: Board | null
 */
export async function getOrCreateBoardByKeyword(keyword: string): Promise<BoardRow | null> {
  const supabase = createClient()
  if (!supabase) return null

  const normalizedKeyword = keyword.trim()
  if (!normalizedKeyword) return null

  // 1) keyword 컬럼으로만 조회 (id 사용 금지). 컬럼명은 name 통일.
  const { data: existing, error: selectErr } = await supabase
    .from('boards')
    .select('id, keyword, name, expires_at, created_at')
    .eq('keyword', normalizedKeyword)
    .maybeSingle()

  if (selectErr) {
    console.error('getOrCreateBoardByKeyword select error:', selectErr)
    return null
  }

  if (existing) {
    return existing as BoardRow
  }

  // 2) 새 방 생성 시 id는 넣지 않음 → DB가 UUID 자동 생성. name 컬럼 사용.
  const { data: inserted, error: insertErr } = await supabase
    .from('boards')
    .insert({
      keyword: normalizedKeyword,
      name: `#${normalizedKeyword}`,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    })
    .select('id, keyword, name, expires_at, created_at')
    .single()

  if (insertErr) {
    console.error('getOrCreateBoardByKeyword insert error:', insertErr)
    return null
  }

  return (inserted as BoardRow) ?? null
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

  if (error) {
    console.error('getBoardById error:', error)
    return null
  }
  return data != null ? (data as BoardRow) : null
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
