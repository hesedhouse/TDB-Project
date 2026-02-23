/**
 * 서버 시간 기준 동시 시청(Watch Together) 싱크용.
 * /api/time 으로 서버 시각을 받아 오프셋을 캐시하고, getServerTimeMs()로 현재 서버 시각(ms) 반환.
 */

let cachedOffsetMs: number | null = null
let lastFetchAt = 0
const REFETCH_INTERVAL_MS = 5 * 60 * 1000 // 5분마다 오프셋 재계산

export async function fetchServerTimeOffset(): Promise<number> {
  const clientNow = Date.now()
  try {
    const res = await fetch('/api/time', { cache: 'no-store' })
    if (!res.ok) return 0
    const data = await res.json()
    const serverTime = typeof data?.serverTime === 'number' ? data.serverTime : clientNow
    return serverTime - clientNow
  } catch {
    return 0
  }
}

/** 현재 서버 시각(Unix ms). 첫 호출 또는 5분마다 /api/time 으로 오프셋 갱신. */
export async function getServerTimeMs(): Promise<number> {
  const now = Date.now()
  if (cachedOffsetMs === null || now - lastFetchAt > REFETCH_INTERVAL_MS) {
    cachedOffsetMs = await fetchServerTimeOffset()
    lastFetchAt = now
  }
  return now + cachedOffsetMs
}

/**
 * pinned_at(고정 시작 시각, ms)과 현재 서버 시각을 비교해 영상 기준 재생 위치(초) 계산.
 * @param pinnedAtMs 고정 시작 시각 (Unix ms)
 * @param serverTimeMs 현재 서버 시각 (Unix ms)
 * @returns 초 단위 재생 위치 (0 이상)
 */
export function getCurrentVideoTimeSeconds(pinnedAtMs: number, serverTimeMs: number): number {
  const elapsedMs = serverTimeMs - pinnedAtMs
  return Math.max(0, elapsedMs / 1000)
}
