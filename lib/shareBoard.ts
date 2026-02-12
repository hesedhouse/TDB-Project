/**
 * 현재 방의 공유 URL 생성 (브라우저 기준)
 */
export function getBoardShareUrl(boardId: string): string {
  if (typeof window === 'undefined') {
    return ''
  }
  const base = window.location.origin
  const path = `/board/${encodeURIComponent(boardId)}`
  return `${base}${path}`
}

export type ShareResult = 'shared' | 'copied' | 'unsupported'

/**
 * Web Share API 사용, 미지원 시 클립보드 복사.
 * 반환: 'shared' | 'copied' | 'unsupported'
 */
export async function shareBoard(
  boardId: string,
  boardName: string
): Promise<ShareResult> {
  const url = getBoardShareUrl(boardId)
  const title = `TDB - ${boardName}`
  const text = `떴다방 "${boardName}" 초대 링크예요.`

  if (typeof navigator === 'undefined') {
    return 'unsupported'
  }

  if (navigator.share != null) {
    try {
      await navigator.share({
        title,
        text,
        url,
      })
      return 'shared'
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        return 'unsupported'
      }
      return 'unsupported'
    }
  }

  try {
    await navigator.clipboard.writeText(url)
    return 'copied'
  } catch {
    return 'unsupported'
  }
}
