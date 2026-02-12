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
}): Promise<Message | null> {
  const supabase = createClient()
  if (!supabase) return null

  const { data, error } = await supabase
    .from('messages')
    .insert({
      board_id: params.boardId,
      author_character: params.authorCharacter,
      author_nickname: params.authorNickname,
      content: params.content.trim(),
      heart_count: 0,
      image_url: params.imageUrl ?? null,
    })
    .select()
    .single()

  if (error) {
    console.error('sendMessage error:', error)
    return null
  }
  return dbMessageToMessage(data as DbMessage)
}

export async function incrementHeart(messageId: string): Promise<number | null> {
  const supabase = createClient()
  if (!supabase) return null

  const { data: row, error: fetchErr } = await supabase
    .from('messages')
    .select('heart_count')
    .eq('id', messageId)
    .single()

  if (fetchErr || row == null) {
    console.error('incrementHeart fetch error:', fetchErr)
    return null
  }

  const newCount = (row.heart_count ?? 0) + 1
  const { error: updateErr } = await supabase
    .from('messages')
    .update({ heart_count: newCount })
    .eq('id', messageId)

  if (updateErr) {
    console.error('incrementHeart update error:', updateErr)
    return null
  }
  return newCount
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
