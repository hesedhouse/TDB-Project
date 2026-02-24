import { createClient, isValidUuid } from './client'
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

/** 해당 방에서 닉네임 사용 여부 확인. 본인(userId 일치)이 이미 쓴 경우 통과. */
export async function checkNicknameAvailability(
  boardId: string,
  nickname: string,
  currentUserId: string | null | undefined
): Promise<{ available: boolean; isOwn?: boolean }> {
  const supabase = createClient()
  if (!supabase) return { available: true }

  const name = (nickname || '').trim()
  if (!name) return { available: true }

  const { data, error } = await supabase
    .from('messages')
    .select('user_id')
    .eq('board_id', boardId)
    .eq('author_nickname', name)
    .limit(50)

  if (error) {
    console.error('checkNicknameAvailability error:', error)
    return { available: true }
  }
  if (!data?.length) return { available: true }

  const userIds = [...new Set(data.map((r: { user_id?: string | null }) => r.user_id ?? null))]
  const onlyCurrentUser =
    currentUserId != null &&
    currentUserId !== '' &&
    userIds.length === 1 &&
    userIds[0] === currentUserId
  if (onlyCurrentUser) return { available: true, isOwn: true }

  return { available: false }
}

/** 해당 방에서 메시지를 남긴 적 있는 닉네임 목록 (중복 제거). */
export async function getNicknamesInBoard(boardId: string): Promise<string[]> {
  const supabase = createClient()
  if (!supabase) return []

  const { data, error } = await supabase
    .from('messages')
    .select('author_nickname')
    .eq('board_id', boardId)

  if (error) {
    console.error('getNicknamesInBoard error:', error)
    return []
  }
  const names = new Set<string>()
  for (const row of data ?? []) {
    const n = (row as { author_nickname?: string }).author_nickname
    if (typeof n === 'string' && n.trim()) names.add(n.trim())
  }
  return [...names].sort((a, b) => a.localeCompare(b))
}

/** DB/네트워크 오류 시 사용자에게 보여줄 메시지로 변환. 세션 만료와 스키마 오류 구분. */
function toSendMessageErrorMessage(err: { code?: string; message?: string } | null): string {
  if (!err) return '메시지 전송에 실패했습니다. 잠시 후 다시 시도해 주세요.'
  const code = err.code ?? ''
  const msg = (err.message ?? '').toLowerCase()
  if (code === '42703' || msg.includes('column') && msg.includes('does not exist')) {
    return '서비스 설정이 반영 중일 수 있습니다. 잠시 후 다시 시도해 주세요.'
  }
  if (code === '42P01' || msg.includes('relation') && msg.includes('does not exist')) {
    return '일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'
  }
  if (code === 'PGRST301' || msg.includes('jwt') || msg.includes('session') || msg.includes('expired')) {
    return '로그인 세션이 만료되었을 수 있습니다. 다시 로그인해 주세요.'
  }
  if (code === '23503' || msg.includes('foreign key')) {
    return '일시적인 오류가 발생했습니다. 다시 로그인하거나 잠시 후 시도해 주세요.'
  }
  return '메시지 전송에 실패했습니다. 네트워크를 확인하거나 잠시 후 다시 시도해 주세요.'
}

export async function sendMessage(params: {
  boardId: string
  authorCharacter: number
  authorNickname: string
  content: string
  imageUrl?: string | null
  /** 로그인 유저 ID. public.users(id) FK 참조 → NextAuth session.user.id(DB UUID)만 사용해야 함 (23503 방지) */
  userId?: string | null
}): Promise<Message | { error: string } | null> {
  const supabase = createClient()
  if (!supabase) return { error: '연결할 수 없습니다. 잠시 후 다시 시도해 주세요.' }

  const rawUid = params.userId != null && params.userId !== '' ? String(params.userId).trim() : null
  if (rawUid !== null && rawUid !== '') {
    if (!isValidUuid(rawUid)) {
      console.error('[sendMessage] user_id가 UUID가 아닙니다.', { userId: rawUid })
      return { error: '로그인 세션이 올바르지 않습니다. 다시 로그인해 주세요.' }
    }
    if (rawUid.includes('@')) {
      console.error('[sendMessage] user_id에 이메일이 들어갈 수 없습니다.', { userId: rawUid })
      return { error: '로그인 세션이 올바르지 않습니다. 다시 로그인해 주세요.' }
    }
  } else {
    console.error('[sendMessage] user_id가 null 또는 빈 값입니다.')
    return { error: '로그인이 필요합니다.' }
  }

  const content = params.content.trim()
  const { data: bannedRows } = await supabase.from('banned_words').select('word')
  const bannedWords = (bannedRows ?? [])
    .map((r: { word?: string | null }) => (r.word ?? '').trim())
    .filter(Boolean)
  /**if (bannedWords.length > 0) {
    const lower = content.toLowerCase()
    for (const w of bannedWords) {
      if (w && lower.includes(w.toLowerCase())) {
        throw new Error(`포함된 금지어: [${w}] - 부적절한 단어가 포함되어 전송할 수 없습니다.`)
      }
    }
  }**/

  // id는 넣지 않음 → Supabase가 자동 UUID 생성 (409 Conflict 방지). upsert 사용 안 함.
  // user_id에는 session.user.id(DB UUID)가 전달된 params.userId가 사용됨.
  console.log('최종 전송 UUID:', rawUid)
  const row: Record<string, unknown> = {
    board_id: params.boardId,
    author_character: params.authorCharacter,
    author_nickname: params.authorNickname,
    content,
    heart_count: 0,
    image_url: params.imageUrl ?? null,
    user_id: rawUid,
  }

  console.log('전송 데이터:', row)
  let result = await supabase.from('messages').insert(row).select().single()

  if (result.error?.code === 'PGRST204' && row.user_id != null) {
    delete row.user_id
    console.log('전송 데이터(user_id 제외 재시도):', row)
    result = await supabase.from('messages').insert(row).select().single()
  }

  if (result.error) {
    console.error('sendMessage error:', result.error)
    return { error: toSendMessageErrorMessage(result.error) }
  }
  return dbMessageToMessage(result.data as DbMessage)
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
  onUpdate: (id: string, heartCount: number) => void,
  onDelete?: (messageId: string) => void
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
  if (onDelete) {
    channel.on(
      'postgres_changes',
      {
        event: 'DELETE',
        schema: 'public',
        table: 'messages',
        filter: `board_id=eq.${boardId}`,
      },
      (payload) => {
        const old = payload.old as { id?: string }
        if (old?.id) onDelete(old.id)
      }
    )
  }
  channel.subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}

/** 메시지 삭제. 성공 시 true */
export async function deleteMessage(messageId: string): Promise<boolean> {
  const supabase = createClient()
  if (!supabase) return false
  const { error } = await supabase.from('messages').delete().eq('id', messageId)
  if (error) {
    console.error('deleteMessage error:', error)
    return false
  }
  return true
}

/** 메시지 내용 수정. 성공 시 갱신된 메시지 반환 */
export async function updateMessage(
  messageId: string,
  content: string
): Promise<Message | null> {
  const supabase = createClient()
  if (!supabase) return null
  const { data, error } = await supabase
    .from('messages')
    .update({ content: content.trim() })
    .eq('id', messageId)
    .select()
    .single()
  if (error) {
    console.error('updateMessage error:', error)
    return null
  }
  return dbMessageToMessage(data as DbMessage)
}
