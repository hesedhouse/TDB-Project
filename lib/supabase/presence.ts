import { createClient } from './client'

export type PresenceUser = { nickname: string }

/**
 * 방 채널에 Presence를 구독하고, 현재 접속 중인 유저 목록을 실시간으로 반영합니다.
 * DB 조회 없이 Realtime Presence만 사용해 서버 부하를 최소화합니다.
 * @param boardId 방(보드) UUID
 * @param myNickname 현재 유저의 방 내 닉네임 (track에 포함)
 * @param onPresence 접속자 목록이 바뀔 때마다 호출 (닉네임 없으면 '익명의 대화가'로 표시용)
 * @returns unsubscribe 함수
 */
export function subscribeBoardPresence(
  boardId: string,
  myNickname: string,
  onPresence: (users: PresenceUser[]) => void
): () => void {
  const supabase = createClient()
  if (!supabase) return () => {}

  const channel = supabase.channel(`board-presence:${boardId}`)

  const toDisplayNickname = (n: string | undefined): string =>
    (n && n.trim()) ? n.trim() : '익명의 대화가'

  channel
    .on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState<{ nickname?: string }>()
      const users: PresenceUser[] = []
      Object.values(state).forEach((presences) => {
        presences.forEach((p) => {
          users.push({ nickname: toDisplayNickname(p?.nickname) })
        })
      })
      onPresence(users)
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({ nickname: myNickname || '익명의 대화가' })
      }
    })

  return () => {
    channel.untrack()
    supabase.removeChannel(channel)
  }
}
