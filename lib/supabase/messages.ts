import { createClient } from './client'
import { dbMessageToMessage, type DbMessage, type Message } from './types'

export async function fetchMessages(boardId: string): Promise<Message[]> {
  const supabase = createClient()
  if (!supabase) return []

  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('board_id', boardId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('fetchMessages error:', error)
    return []
  }
  return (data as DbMessage[]).map(dbMessageToMessage)
}

export async function sendMessage(params: {
  boardId: string
  authorCharacter: number
  authorNickname: string
  content: string
  imageUrl?: string | null
  /** 로그인 유저의 Auth UID (관리자 추적용). Supabase Auth user.id */
  userId?: string | null
}): Promise<Message | null> {
  const supabase = createClient()
  if (!supabase) return null

  const row: Record<string, unknown> = {
    board_id: params.boardId,
    author_character: params.authorCharacter,
    author_nickname: params.authorNickname,
    content: params.content.trim(),
    heart_count: 0,
    image_url: params.imageUrl ?? null,
  }
  if (params.userId != null && params.userId !== '') {
    row.user_id = params.userId
  }

  const { data, error } = await supabase
    .from('messages')
    .insert(row)
    .select()
    .single()

  if (error) {
    console.error('sendMessage error:', error)
    return null
  }
  return dbMessageToMessage(data as DbMessage)
}

/** 하트 수 1 증가. 반환: 갱신된 heart_count */
export async function incrementHeart(messageId: string): Promise<number | null> {
  const result = await updateHeartCount(messageId, 1)
  return result
}

/** 하트 수 1 감소 (최소 0). 반환: 갱신된 heart_count */
export async function decrementHeart(messageId: string): Promise<number | null> {
  const result = await updateHeartCount(messageId, -1)
  return result
}

/** messages.heart_count 를 delta만큼 변경. 반환: 갱신된 heart_count 또는 null. */
async function updateHeartCount(
  messageId: string,
  delta: number
): Promise<number | null> {
  const supabase = createClient()
  if (!supabase) return null

  const fetchResult = await supabase
    .from('messages')
    .select('heart_count')
    .eq('id', messageId)
    .single()

  if (fetchResult.error || fetchResult.data == null) {
    console.error('updateHeartCount fetch error:', fetchResult.error)
    return null
  }

  const current: number = Number(fetchResult.data.heart_count) || 0
  const newCount: number = Math.max(0, current + delta)

  const updateResult = await supabase
    .from('messages')
    .update({ heart_count: newCount })
    .eq('id', messageId)
    .select('heart_count')
    .single()

  if (updateResult.error) {
    console.error('updateHeartCount update error:', updateResult.error)
    return null
  }

  const next: number = Number(updateResult.data?.heart_count) ?? newCount
  return Number.isFinite(next) ? next : null
}

export function subscribeMessages(
  boardId: string,
  onInsert: (message: Message) => void,
  onUpdate: (id: string, heartCount: number) => void
): () => void {
  const supabase = createClient()
  if (!supabase) return () => {}

  const channel = supabase
    .channel(`messages:board_id=eq.${boardId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `board_id=eq.${boardId}`,
      },
      (payload) => {
        const row = payload.new as DbMessage
        onInsert(dbMessageToMessage(row))
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'messages',
        filter: `board_id=eq.${boardId}`,
      },
      (payload) => {
        const row = payload.new as DbMessage
        onUpdate(row.id, row.heart_count ?? 0)
      }
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}
