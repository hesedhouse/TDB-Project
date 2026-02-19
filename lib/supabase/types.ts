/** Supabase messages 테이블 행 타입 */
export interface DbMessage {
  id: string
  board_id: string
  author_character: number
  author_nickname: string
  content: string
  heart_count: number
  created_at: string
  image_url?: string | null
  images?: string[] | null
  links?: { url: string; type: string }[] | null
  /** 로그인 유저의 Auth UID (관리자 추적용). nullable */
  user_id?: string | null
}

/** 클라이언트에서 쓰기 편한 메시지 타입 (created_at을 Date처럼 다룸) */
export interface Message {
  id: string
  boardId: string
  authorCharacter: number
  authorNickname: string
  content: string
  heartCount: number
  createdAt: Date
  imageUrl?: string | null
  images?: string[]
  links?: { url: string; type: string }[]
  /** 작성자 Auth UID (본인 메시지 수정/삭제 판별용) */
  userId?: string | null
}

export function dbMessageToMessage(row: DbMessage): Message {
  return {
    id: row.id,
    boardId: row.board_id,
    authorCharacter: row.author_character,
    authorNickname: row.author_nickname,
    content: row.content,
    heartCount: row.heart_count ?? 0,
    createdAt: new Date(row.created_at),
    imageUrl: row.image_url ?? undefined,
    images: row.images ?? undefined,
    links: row.links ?? undefined,
    userId: row.user_id ?? undefined,
  }
}
