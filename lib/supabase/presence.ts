import { createClient } from './client'

export type PresenceUser = { nickname: string; user_id?: string; avatar_url?: string }

const EMPTY_LABEL = '이름 없음'

export type PresenceCallback = (users: PresenceUser[], presenceKeyCount: number) => void

/**
 * 방 채널에 Presence를 구독하고, 현재 접속 중인 유저 목록을 실시간으로 반영합니다.
 * DB 조회 없이 Realtime Presence만 사용해 서버 부하를 최소화합니다.
 * @param boardId 방(보드) UUID
 * @param myNickname 현재 유저의 방 내 닉네임 (track에 포함, 비어있으면 빈 문자열 전송)
 * @param onPresence 접속자 목록·키 개수(참여자 수)가 바뀔 때마다 호출
 * @param userId 로그인 유저 ID (track에 포함)
 * @returns unsubscribe 함수
 */
export function subscribeBoardPresence(
  boardId: string,
  myNickname: string,
  onPresence: PresenceCallback,
  userId?: string | null
): () => void {
  const supabase = createClient()
  if (!supabase) return () => {}

  const channel = supabase.channel(`board-presence:${boardId}`)

  const toDisplayNickname = (n: unknown): string => {
    if (typeof n === 'string' && n.trim()) return n.trim()
    return ''
  }

  /** presenceState() 값 배열에서 nickname 추출 (Supabase는 [ref]: [payload[]] 형태) */
  const getNicknameFromPayload = (p: unknown): string => {
    if (p == null || typeof p !== 'object') return ''
    const o = p as Record<string, unknown>
    if (typeof o.nickname === 'string') return toDisplayNickname(o.nickname)
    const presence = o.presence as Record<string, unknown> | undefined
    if (presence && typeof presence.nickname === 'string') return toDisplayNickname(presence.nickname)
    return ''
  }

  channel
    .on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState()
      const keyCount = Object.keys(state).length
      const users: PresenceUser[] = []
      const seenNicknames = new Set<string>()
      Object.values(state).forEach((presences) => {
        if (!Array.isArray(presences)) return
        presences.forEach((p) => {
          const nickname = getNicknameFromPayload(p)
          const dedupeKey = nickname.trim().toLowerCase() || '__empty'
          if (seenNicknames.has(dedupeKey)) return
          seenNicknames.add(dedupeKey)
          const o = (p as Record<string, unknown>) || {}
          users.push({
            nickname: nickname.trim() || EMPTY_LABEL,
            user_id: typeof o.user_id === 'string' ? o.user_id : undefined,
            avatar_url: typeof o.avatar_url === 'string' ? o.avatar_url : undefined,
          })
        })
      })
      if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
        console.log('현재 참여자 실시간 데이터:', state)
        console.log('[Presence] 참여자 수(Object.keys):', keyCount, '중복 제거 후 목록:', users)
      }
      onPresence(users, keyCount)
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        const nickname = (typeof myNickname === 'string' && myNickname.trim()) ? myNickname.trim() : ''
        const payload: Record<string, unknown> = {
          nickname,
          user_id: userId ?? undefined,
        }
        await channel.track(payload)
        if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
          console.log('[Presence] track 호출됨 (닉네임·ID 전송):', { boardId: boardId.slice(0, 8) + '…', nickname, user_id: userId ?? null })
        }
      }
    })

  return () => {
    channel.untrack()
    supabase.removeChannel(channel)
  }
}
