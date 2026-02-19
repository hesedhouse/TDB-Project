/**
 * 워프존용 활성 세션 저장소 (localStorage tdb_active_sessions).
 * 방 입장 시 boardId, boardName, nickname, keyword(URL용) 저장·조회·삭제.
 */

const STORAGE_KEY = 'tdb_active_sessions'

export type ActiveSession = {
  boardId: string
  boardName: string
  nickname: string
  keyword: string
  visitedAt: number
  /** 방 만료 시각 (ms). 있으면 워프존에서 "폭파까지" 표시, 0 이하면 목록에서 제거 */
  expiresAt?: number
}

function getStorage(): ActiveSession[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.filter(
      (x): x is ActiveSession =>
        x != null &&
        typeof x.boardId === 'string' &&
        typeof x.boardName === 'string' &&
        typeof x.nickname === 'string' &&
        typeof x.keyword === 'string'
    ) : []
  } catch {
    return []
  }
}

/** 만료된 방(expiresAt <= now)을 저장소에서 제거 */
export function removeExpiredSessions(): void {
  const list = getStorage()
  const now = Date.now()
  const valid = list.filter((s) => s.expiresAt == null || s.expiresAt > now)
  if (valid.length < list.length) setStorage(valid)
}

function setStorage(list: ActiveSession[]): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {}
}

export function getActiveSessions(): ActiveSession[] {
  return getStorage()
}

/** 해당 방이 있으면 nickname/visitedAt만 갱신, 없으면 추가 */
export function addOrUpdateSession(session: Omit<ActiveSession, 'visitedAt'>): void {
  const list = getStorage()
  const now = Date.now()
  const idx = list.findIndex((s) => s.boardId === session.boardId || s.keyword === session.keyword)
  const entry: ActiveSession = { ...session, visitedAt: now }
  if (idx >= 0) {
    list[idx] = entry
  } else {
    list.push(entry)
  }
  setStorage(list)
}

export function removeSessionByBoardId(boardId: string): void {
  const list = getStorage().filter((s) => s.boardId !== boardId)
  setStorage(list)
}

export function removeSessionByKeyword(keyword: string): void {
  const list = getStorage().filter((s) => s.keyword !== keyword)
  setStorage(list)
}

/** boardId 또는 keyword로 세션 찾기 (워프존에서 이미 닉네임 있으면 모달 스킵용) */
export function findSession(boardId: string, keyword?: string | null): ActiveSession | undefined {
  const list = getStorage()
  return list.find((s) => s.boardId === boardId || (keyword != null && s.keyword === keyword))
}
