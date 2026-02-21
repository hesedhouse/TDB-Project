import { createClient } from './client'

export type PresenceUser = { nickname: string; user_id?: string; avatar_url?: string }

const DEFAULT_NICKNAME = '익명의 팝핀'

/**
 * 방 채널에 Presence를 구독하고, 현재 접속 중인 유저 목록을 실시간으로 반영합니다.
 * DB 조회 없이 Realtime Presence만 사용해 서버 부하를 최소화합니다.
 * @param boardId 방(보드) UUID
 * @param myNickname 현재 유저의 방 내 닉네임 (track에 포함, 없으면 '익명의 팝핀')
 * @param onPresence 접속자 목록이 바뀔 때마다 호출
 * @param userId 로그인 유저 ID (선택, track에 포함)
 * @returns unsubscribe 함수
 */
export function subscribeBoardPresence(
  boardId: string,
  myNickname: string,
  onPresence: (users: PresenceUser[]) => void,
  userId?: string | null
): () => void {
  const supabase = createClient()
  if (!supabase) return () => {}

  const channel = supabase.channel(`board-presence:${boardId}`)

  const toDisplayNickname = (n: unknown): string => {
    if (typeof n === 'string' && n.trim()) return n.trim()
    return DEFAULT_NICKNAME
  }

  /** presenceState() 값 배열에서 nickname 추출 (Supabase는 [ref]: [payload[]] 형태) */
  const getNicknameFromPayload = (p: unknown): string => {
    if (p == null || typeof p !== 'object') return DEFAULT_NICKNAME
    const o = p as Record<string, unknown>
    if (typeof o.nickname === 'string') return toDisplayNickname(o.nickname)
    const presence = o.presence as Record<string, unknown> | undefined
    if (presence && typeof presence.nickname === 'string') return toDisplayNickname(presence.nickname)
    return DEFAULT_NICKNAME
  }

  channel
    .on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState()
      const users: PresenceUser[] = []
      Object.values(state).forEach((presences) => {
        if (!Array.isArray(presences)) return
        presences.forEach((p) => {
          const nickname = getNicknameFromPayload(p)
          const o = (p as Record<string, unknown>) || {}
          users.push({
            nickname,
            user_id: typeof o.user_id === 'string' ? o.user_id : undefined,
            avatar_url: typeof o.avatar_url === 'string' ? o.avatar_url : undefined,
          })
        })
      })
      onPresence(users)
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        const nickname = toDisplayNickname(myNickname)
        await channel.track({
          nickname,
          ...(userId ? { user_id: userId } : {}),
        })
      }
    })

  return () => {
    channel.untrack()
    supabase.removeChannel(channel)
  }
}
