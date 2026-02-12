const STORAGE_KEY = 'tdb-user-hourglasses'
const DEFAULT_COUNT = 3

export function getHourglasses(): number {
  if (typeof window === 'undefined') return DEFAULT_COUNT
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const n = raw != null ? parseInt(raw, 10) : DEFAULT_COUNT
    return Number.isFinite(n) && n >= 0 ? n : DEFAULT_COUNT
  } catch {
    return DEFAULT_COUNT
  }
}

export function setHourglasses(count: number): void {
  const n = Math.max(0, Math.floor(count))
  try {
    localStorage.setItem(STORAGE_KEY, String(n))
  } catch (_) {}
}
