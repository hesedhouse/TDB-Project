import { createClient } from './client'
import { isValidUuid } from './client'

/** 모래시계 1개당 연장 시간(밀리초). 30분으로 설정. */
export const EXTEND_MS_PER_HOURGLASS = 30 * 60 * 1000

/** Supabase boards 행: id는 UUID, 검색은 keyword만 사용. 컬럼은 name으로 통일 (title 사용 안 함) */
export type BoardRow = {
  id: string
  /** 사용자용 숫자 방 번호 (직통 입장용). DB에 public_id 컬럼이 있을 때만 채워짐 */
  public_id?: number | null
  keyword: string
  name: string | null
  expires_at: string
  created_at: string
  /** true=활성 방, false=폭파(종료)된 방. 컬럼 없으면 undefined(활성으로 간주) */
  is_active?: boolean
  /** 폭파된 시각(ISO). null/없으면 미폭파 */
  exploded_at?: string | null
  /** 누적 모래시계 연장 횟수. 명예의 전당 폴백용 */
  total_recharged?: number | null
}

/** BoardRow 별칭 (Board | null 리턴 타입용) */
export type Board = BoardRow

type BoardRowSelected = {
  id: unknown
  keyword: string
  name: string | null
  expires_at: string
  created_at: string
  public_id?: unknown
  is_active?: unknown
  exploded_at?: unknown
  total_recharged?: unknown
}

function normalizeBoardRow(row: BoardRowSelected): BoardRow {
  const rawPublic = row.public_id
  const publicIdNum =
    rawPublic == null
      ? null
      : typeof rawPublic === 'number'
        ? rawPublic
        : Number.isFinite(Number(rawPublic))
          ? Number(rawPublic)
          : null
  const isActive = row.is_active === undefined ? true : Boolean(row.is_active)
  const explodedAt =
    row.exploded_at === undefined || row.exploded_at === null
      ? undefined
      : typeof row.exploded_at === 'string'
        ? row.exploded_at
        : undefined
  const totalRecharged =
    row.total_recharged !== undefined && row.total_recharged != null
      ? Number(row.total_recharged)
      : undefined
  return {
    id: String(row.id),
    keyword: row.keyword,
    name: row.name ?? null,
    expires_at: row.expires_at,
    created_at: row.created_at,
    ...(rawPublic !== undefined ? { public_id: publicIdNum } : {}),
    ...(row.is_active !== undefined ? { is_active: isActive } : {}),
    ...(row.exploded_at !== undefined ? { exploded_at: explodedAt ?? null } : {}),
    ...(totalRecharged !== undefined && Number.isFinite(totalRecharged) ? { total_recharged: totalRecharged } : {}),
  }
}

async function selectBoardMaybeWithPublicId<T extends { data: any; error: any }>(
  queryWithPublicId: () => Promise<T>,
  queryWithoutPublicId: () => Promise<T>
): Promise<T> {
  const r1 = await queryWithPublicId()
  if (!r1.error) return r1
  // public_id 컬럼이 없는 구버전 스키마에서도 동작하도록 fallback
  const r2 = await queryWithoutPublicId()
  return r2
}

/**
 * 방 조회·생성은 모두 keyword 컬럼 기준. id는 사용하지 않음.
 * - 조회: .eq('keyword', normalizedKeyword) 만 사용.
 * - 생성: insert 시 id 미포함 → DB의 gen_random_uuid() 자동 생성 (invalid uuid 방지).
 * - DB 컬럼: id(uuid), keyword(text), name(text), expires_at, created_at
 */
export async function getOrCreateBoardByKeyword(keyword: string): Promise<BoardRow | null> {
  const supabase = createClient()
  if (!supabase) return null

  const normalizedKeyword = keyword.trim()
  if (!normalizedKeyword) return null

  // 1) keyword 컬럼으로만 조회 (DB에 keyword, name 컬럼이 있어야 함)
  const selectColumns = 'id, keyword, name, expires_at, created_at' as const
  const selectColumnsWithPublicId = 'id, keyword, name, expires_at, created_at, public_id' as const
  const existingRes = await selectBoardMaybeWithPublicId(
    async () =>
      await supabase
        .from('boards')
        .select(selectColumnsWithPublicId)
        .eq('keyword', normalizedKeyword)
        .maybeSingle(),
    async () =>
      await supabase
        .from('boards')
        .select(selectColumns)
        .eq('keyword', normalizedKeyword)
        .maybeSingle()
  )
  const existing = existingRes.data as BoardRowSelected | null
  const selectErr = existingRes.error

  if (selectErr) {
    console.error('getOrCreateBoardByKeyword select error:', selectErr)
    return null
  }

  if (existing != null) return normalizeBoardRow(existing)

  // 2) 없으면 생성. id는 넣지 않음(DB 자동 생성). public_id는 DB IDENTITY로 자동 부여·반환.
  const displayTitle = `#${normalizedKeyword}`
  const insertPayload = {
    keyword: normalizedKeyword,
    name: displayTitle,
    title: displayTitle,
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  }
  const insertedRes = await selectBoardMaybeWithPublicId(
    async () =>
      await supabase
        .from('boards')
        .insert(insertPayload)
        .select(selectColumnsWithPublicId)
        .single(),
    async () =>
      await supabase
        .from('boards')
        .insert(insertPayload)
        .select(selectColumns)
        .single()
  )
  const inserted = insertedRes.data as BoardRowSelected | null
  const insertErr = insertedRes.error

  if (insertErr) {
    console.error('getOrCreateBoardByKeyword insert error:', insertErr)
    return null
  }

  if (inserted == null) return null
  return normalizeBoardRow(inserted)
}

/**
 * 키워드로 활성 방 1개 조회 (남은 시간이 있는 방만). 없으면 null.
 */
export async function getActiveBoardByKeyword(keyword: string): Promise<BoardRow | null> {
  const supabase = createClient()
  if (!supabase) return null
  const normalized = keyword.trim()
  if (!normalized) return null

  const now = new Date().toISOString()
  const cols = 'id, keyword, name, expires_at, created_at, public_id, is_active, exploded_at'
  const { data, error } = await supabase
    .from('boards')
    .select(cols)
    .eq('keyword', normalized)
    .gt('expires_at', now)
    .order('expires_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    const legacy = await supabase.from('boards').select('id, keyword, name, expires_at, created_at, public_id').eq('keyword', normalized).gt('expires_at', now).order('expires_at', { ascending: false }).limit(1).maybeSingle()
    if (legacy.error || !legacy.data) return null
    return normalizeBoardRow(legacy.data as BoardRowSelected)
  }
  if (!data) return null
  const row = data as BoardRowSelected
  if (row.is_active === false) return null
  return normalizeBoardRow(row)
}

/**
 * 방 새로 생성 (키워드·표시명·만료 시각 지정). 서버 전용.
 */
export async function createBoard(keyword: string, options: { expiresInMs?: number; name?: string }): Promise<BoardRow | null> {
  const supabase = createClient()
  if (!supabase) return null
  const normalized = keyword.trim()
  if (!normalized) return null

  const expiresInMs = options?.expiresInMs ?? 7 * 24 * 60 * 60 * 1000
  const expiresAt = new Date(Date.now() + expiresInMs).toISOString()
  const name = options?.name ?? `#${normalized}`

  const insertPayload = {
    keyword: normalized,
    name,
    title: name,
    expires_at: expiresAt,
  }
  const selectCols = 'id, keyword, name, expires_at, created_at, public_id'
  const { data, error } = await supabase.from('boards').insert(insertPayload).select(selectCols).single()
  if (error) {
    const fallback = await supabase.from('boards').insert(insertPayload).select('id, keyword, name, expires_at, created_at').single()
    if (fallback.error || !fallback.data) return null
    return normalizeBoardRow(fallback.data as BoardRowSelected)
  }
  return normalizeBoardRow((data as BoardRowSelected))
}

/**
 * UUID로 방을 조회합니다. (URL이 /board/[uuid] 일 때 사용). 반환: Board | null
 */
export async function getBoardById(id: string): Promise<BoardRow | null> {
  if (!isValidUuid(id)) return null
  const supabase = createClient()
  if (!supabase) return null

  const res = await selectBoardMaybeWithPublicId(
    async () =>
      await supabase
        .from('boards')
        .select('id, keyword, name, expires_at, created_at, public_id')
        .eq('id', id)
        .maybeSingle(),
    async () =>
      await supabase
        .from('boards')
        .select('id, keyword, name, expires_at, created_at')
        .eq('id', id)
        .maybeSingle()
  )
  const data = res.data as BoardRowSelected | null
  const error = res.error

  if (error || data == null) {
    if (error) console.error('getBoardById error:', error)
    return null
  }
  return normalizeBoardRow(data)
}

const SEARCH_SELECT_COLS = 'id, keyword, name, expires_at, created_at, public_id, is_active, exploded_at' as const
const SEARCH_SELECT_COLS_LEGACY = 'id, keyword, name, expires_at, created_at, public_id' as const

/** 폭파된 지 24시간 이내면 검색 결과에 포함 */
function isVisibleInSearch(row: BoardRow): boolean {
  if (row.is_active !== false) return true
  if (!row.exploded_at) return true
  const explodedMs = new Date(row.exploded_at).getTime()
  return Date.now() - explodedMs < 24 * 60 * 60 * 1000
}

/**
 * 통합 검색: 방 번호(public_id) 정확 일치 + 제목(name/keyword) ilike.
 * - is_active true 전부 표시, false는 exploded_at 24시간 이내만 표시.
 */
export async function searchBoards(query: string): Promise<BoardRow[]> {
  const q = query.trim()
  if (!q) return []
  const supabase = createClient()
  if (!supabase) return []

  const byId = new Map<string, BoardRowSelected>()
  const add = (row: BoardRowSelected) => byId.set(String(row.id), row)

  const runQueries = async (cols: string) => {
    byId.clear()
    let idMatch: BoardRowSelected | null = null
    const isNumeric = /^\d+$/.test(q)
    if (isNumeric) {
      const num = Number(q)
      const { data, error: numErr } = await supabase.from('boards').select(cols).eq('public_id', num as never).maybeSingle()
      if (numErr) return { idMatch: null as BoardRowSelected | null, columnError: numErr.code }
      if (data) {
        idMatch = data as unknown as BoardRowSelected
        add(idMatch)
      }
    }
    const escapeLike = (s: string) => String(s).replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
    const pattern = `%${escapeLike(q)}%`
    const { data: byName, error: nameErr } = await supabase.from('boards').select(cols).ilike('name', pattern).order('created_at', { ascending: false }).limit(20)
    if (nameErr) return { idMatch: null as BoardRowSelected | null, columnError: nameErr.code }
    ;(byName ?? []).forEach((r) => add(r as unknown as BoardRowSelected))
    const { data: byKeyword, error: kwErr } = await supabase.from('boards').select(cols).ilike('keyword', pattern).order('created_at', { ascending: false }).limit(20)
    if (kwErr) return { idMatch: null as BoardRowSelected | null, columnError: kwErr.code }
    ;(byKeyword ?? []).forEach((r) => add(r as unknown as BoardRowSelected))
    return { idMatch, columnError: null as string | null }
  }

  let idMatch: BoardRowSelected | null = null
  let useFilter = true
  let run = await runQueries(SEARCH_SELECT_COLS)
  if (run.columnError === '42703') {
    run = await runQueries(SEARCH_SELECT_COLS_LEGACY)
    useFilter = false
  }
  idMatch = run.idMatch

  const rest = [...byId.values()]
    .filter((r) => !idMatch || String(r.id) !== String(idMatch!.id))
    .sort(
      (a, b) =>
        new Date((b as { created_at: string }).created_at).getTime() -
        new Date((a as { created_at: string }).created_at).getTime()
    )
  const ordered = idMatch ? [idMatch, ...rest] : rest
  const normalized = ordered.slice(0, 20).map(normalizeBoardRow)
  const filtered = useFilter ? normalized.filter(isVisibleInSearch) : normalized
  return filtered.slice(0, 15)
}

/**
 * 숫자 방 번호(public_id)로 방을 조회합니다.
 * - DB의 boards.id(UUID)는 그대로 유지하면서, 사용자에게는 public_id로 직통 입장을 제공합니다.
 * - public_id 컬럼이 아직 없는 경우(null/에러)에는 null을 반환하여 상위 로직이 기존 플로우로 fallback 합니다.
 */
export async function getBoardByPublicId(rawId: string): Promise<BoardRow | null> {
  const publicIdRaw = rawId.trim()
  if (!/^\d+$/.test(publicIdRaw)) return null
  const supabase = createClient()
  if (!supabase) return null

  const publicId = Number(publicIdRaw)
  if (!Number.isFinite(publicId)) return null

  const res = await supabase
    .from('boards')
    .select('id, keyword, name, expires_at, created_at, public_id')
    .eq('public_id', publicId as never)
    .maybeSingle()

  const data = res.data as BoardRowSelected | null
  const error = res.error
  if (error || data == null) {
    if (error) console.error('getBoardByPublicId error:', error)
    return null
  }
  return normalizeBoardRow(data)
}

const HALL_SELECT = 'id, keyword, name, expires_at, created_at, public_id, is_active, exploded_at, total_recharged' as const
const HALL_SELECT_LEGACY = 'id, keyword, name, expires_at, created_at, public_id' as const

/**
 * 명예의 전당 [불멸의 방]: expires_at이 가장 많이 남은 상위 5개 방.
 */
export async function getImmortalBoards(limit = 5): Promise<BoardRow[]> {
  const supabase = createClient()
  if (!supabase) return []
  const cols = HALL_SELECT
  const { data, error } = await supabase
    .from('boards')
    .select(cols)
    .order('expires_at', { ascending: false })
    .limit(limit)
  if (error) {
    if (error.code === '42703') {
      const { data: legacy, error: legacyErr } = await supabase
        .from('boards')
        .select(HALL_SELECT_LEGACY)
        .order('expires_at', { ascending: false })
        .limit(limit)
      if (legacyErr || !legacy) return []
      return (legacy as BoardRowSelected[]).map(normalizeBoardRow)
    }
    console.error('getImmortalBoards error:', error)
    return []
  }
  return (data as BoardRowSelected[]).map(normalizeBoardRow)
}

export type HotPlaceEntry = { board: BoardRow; heatScoreP: number }

/**
 * 명예의 전당 [핫플레이스]: 최근 24시간 화력 점수 상위 5개 방.
 * 화력 = 연장(extension) 1P/개 + 전광판(billboard) 2P/개.
 * RPC get_hot_places_24h_heat 사용, 없으면 get_hot_places_24h → total_recharged 폴백.
 */
export async function getHotPlacesBoards(limit = 5): Promise<HotPlaceEntry[]> {
  const supabase = createClient()
  if (!supabase) return []

  // 1) 화력 RPC (extension + billboard*2) 우선
  const { data: heatData, error: heatErr } = await supabase.rpc('get_hot_places_24h_heat', { lim: limit })
  if (!heatErr && heatData && Array.isArray(heatData) && heatData.length > 0) {
    const entries = heatData as { board_id: string; heat_score: number }[]
    const ids = entries.map((e) => e.board_id)
    const cols = HALL_SELECT
    const { data: rows, error: selErr } = await supabase.from('boards').select(cols).in('id', ids)
    if (selErr) {
      const { data: legacy } = await supabase.from('boards').select(HALL_SELECT_LEGACY).in('id', ids)
      if (!legacy) return []
      const byId = new Map((legacy as BoardRowSelected[]).map((r) => [String(r.id), normalizeBoardRow(r)]))
      return entries
        .map((e) => {
          const board = byId.get(e.board_id)
          return board ? { board, heatScoreP: Number(e.heat_score) || 0 } : null
        })
        .filter((x): x is HotPlaceEntry => x != null)
    }
    const byId = new Map((rows as BoardRowSelected[]).map((r) => [String(r.id), normalizeBoardRow(r)]))
    return entries
      .map((e) => {
        const board = byId.get(e.board_id)
        return board ? { board, heatScoreP: Number(e.heat_score) || 0 } : null
      })
      .filter((x): x is HotPlaceEntry => x != null)
  }

  // 2) 폴백: 구 RPC (연장만 집계)
  const { data: rpcData, error: rpcErr } = await supabase.rpc('get_hot_places_24h', { lim: limit })
  if (!rpcErr && rpcData && Array.isArray(rpcData) && rpcData.length > 0) {
    const entries = rpcData as { board_id: string; recharge_count: number }[]
    const ids = entries.map((e) => e.board_id)
    const { data: rows } = await supabase.from('boards').select(HALL_SELECT).in('id', ids)
    const byIdMap = new Map(((rows ?? []) as BoardRowSelected[]).map((r) => [String(r.id), normalizeBoardRow(r)] as const))
    return entries
      .map((e) => {
        const board = byIdMap.get(e.board_id)
        return board ? { board, heatScoreP: Number(e.recharge_count) || 0 } : null
      })
      .filter((x): x is HotPlaceEntry => x != null)
  }

  // 3) 폴백: total_recharged 기준
  const { data: fallback, error: fallbackErr } = await supabase
    .from('boards')
    .select(HALL_SELECT)
    .order('total_recharged', { ascending: false })
    .limit(limit)
  if (fallbackErr) {
    const { data: leg } = await supabase.from('boards').select(HALL_SELECT_LEGACY).order('expires_at', { ascending: false }).limit(limit)
    if (!leg) return []
    return (leg as BoardRowSelected[]).map((r) => ({ board: normalizeBoardRow(r), heatScoreP: 0 }))
  }
  return (fallback as BoardRowSelected[]).map((r) => ({
    board: normalizeBoardRow(r),
    heatScoreP: typeof (r as { total_recharged?: number }).total_recharged === 'number' ? (r as { total_recharged: number }).total_recharged : 0,
  }))
}

/**
 * 해당 방의 expires_at을 현재 저장된 값에서 모래시계 1개당 30분 연장합니다.
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
  const newExpiresAt = new Date(currentDate.getTime() + EXTEND_MS_PER_HOURGLASS)

  const { error: updateErr } = await supabase
    .from('boards')
    .update({ expires_at: newExpiresAt.toISOString() })
    .eq('id', boardId)

  if (updateErr) {
    console.error('extendBoardExpiry update error:', updateErr)
    return null
  }

  // 명예의 전당: 충전 로그 기록 (트리거가 boards.total_recharged 자동 증가)
  await supabase.from('board_recharge_log').insert({ board_id: boardId }).then((r) => {
    if (r.error && process.env.NODE_ENV === 'development') {
      console.warn('extendBoardExpiry: board_recharge_log insert skipped', r.error.code)
    }
  })

  // 화력 점수: hourglass_transactions에 extension 기록
  await supabase.from('hourglass_transactions').insert({ board_id: boardId, type: 'extension', amount: 1 }).then((r) => {
    if (r.error && process.env.NODE_ENV === 'development') {
      console.warn('extendBoardExpiry: hourglass_transactions insert skipped', r.error.code)
    }
  })

  return newExpiresAt
}

/**
 * 방 폭파(종료) 처리: is_active = false, exploded_at = now().
 * PulseFeed에서 만료 감지 시 한 번 호출.
 * board_id는 반드시 boards.id(UUID)여야 함 (400 방지).
 */
export async function markBoardExploded(boardId: string): Promise<boolean> {
  const id = typeof boardId === 'string' ? boardId.trim() : ''
  if (!id || !isValidUuid(id)) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('markBoardExploded: board_id가 유효한 UUID가 아님', { boardId: id || boardId })
    }
    return false
  }
  const supabase = createClient()
  if (!supabase) return false
  const now = new Date().toISOString()
  const payload = { is_active: false, exploded_at: now }
  console.log('전송 데이터:', { board_id: id, update: payload })
  const { error } = await supabase
    .from('boards')
    .update(payload as Record<string, unknown>)
    .eq('id', id)
  if (error) {
    if (error.code === '42703' || error.code === '42P01') {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[boards] markBoardExploded 스키마 오류(컬럼/테이블 없음). exploded_at 컬럼 추가 후 재시도.', error.code, error.message)
      }
      return false
    }
    console.error('markBoardExploded error:', error)
    return false
  }
  return true
}
