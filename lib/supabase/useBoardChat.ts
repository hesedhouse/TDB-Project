'use client'

import { useState, useEffect, useCallback } from 'react'
import { fetchMessages, sendMessage, incrementHeart, decrementHeart, subscribeMessages, deleteMessage as deleteMessageApi, updateMessage as updateMessageApi } from './messages'
import type { Message } from './types'

/**
 * 게시판(방) 기준으로 메시지를 보내고 실시간으로 받는 훅.
 * - 마운트 시 해당 board_id 메시지 조회
 * - Realtime 구독으로 새 메시지·하트 업데이트 즉시 반영
 */
export function useBoardChat(
  boardId: string,
  options: {
    userCharacter: number
    userNickname: string
    enabled?: boolean
    /** 로그인 유저의 Auth UID (관리자 추적용). posts/messages에 user_id로 저장 */
    userId?: string | null
  }
) {
  const { userCharacter, userNickname, enabled = true, userId } = options
  const [messages, setMessages] = useState<Message[]>([])
  const [sending, setSending] = useState(false)

  // 1) 초기 로드 + 2) Realtime 구독
  useEffect(() => {
    if (!enabled || !boardId) return

    fetchMessages(boardId).then((list) => setMessages(list))

    const unsubscribe = subscribeMessages(
      boardId,
      (newMsg) => {
        setMessages((prev) => {
          if (prev.some((m) => m.id === newMsg.id)) return prev
          return [...prev, newMsg]
        })
      },
      (id, heartCount) => {
        setMessages((prev) =>
          prev.map((m) => (m.id === id ? { ...m, heartCount } : m))
        )
      },
      (deletedId) => {
        setMessages((prev) => prev.filter((m) => m.id !== deletedId))
      }
    )

    return () => unsubscribe()
  }, [enabled, boardId])

  const send = useCallback(
    async (content: string, imageUrl?: string | null): Promise<Message | { error: string } | null> => {
      const text = content.trim()
      if (!text && !imageUrl) return null
      if (sending) return null
      // useSession()으로 전달된 session.user.id가 없으면 전송 불가 (로그인 필요)
      if (userId == null || String(userId).trim() === '') {
        if (typeof window !== 'undefined') window.alert('로그인이 필요합니다.')
        return { error: '로그인이 필요합니다.' }
      }
      console.log('전송되는 UUID:', userId)
      setSending(true)
      try {
        const sent = await sendMessage({
          boardId,
          authorCharacter: userCharacter,
          authorNickname: userNickname,
          content: text || ' ',
          imageUrl: imageUrl ?? undefined,
          userId: userId ?? undefined,
        })
        setSending(false)
        if (sent) {
          setMessages((prev) => {
            if (prev.some((m) => m.id === sent.id)) return prev
            return [...prev, sent]
          })
          return sent
        }
        return null
      } catch (err) {
        setSending(false)
        const message = err instanceof Error ? err.message : '메시지 전송에 실패했습니다.'
        return { error: message }
      }
    },
    [boardId, userCharacter, userNickname, userId, sending]
  )

  /** 하트 토글: 이미 누른 메시지면 -1, 아니면 +1. 반환값으로 UI(빨간 하트 등) 갱신용 */
  const toggleHeart = useCallback(
    async (
      messageId: string,
      isCurrentlyHearted: boolean
    ): Promise<{ newCount: number; isHearted: boolean } | null> => {
      const newCount = isCurrentlyHearted
        ? await decrementHeart(messageId)
        : await incrementHeart(messageId)
      if (newCount == null) return null
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, heartCount: newCount } : m
        )
      )
      return { newCount, isHearted: !isCurrentlyHearted }
    },
    []
  )

  const deleteMessage = useCallback(async (messageId: string): Promise<boolean> => {
    const ok = await deleteMessageApi(messageId)
    if (ok) setMessages((prev) => prev.filter((m) => m.id !== messageId))
    return ok
  }, [])

  const updateMessage = useCallback(
    async (messageId: string, content: string): Promise<Message | null> => {
      const updated = await updateMessageApi(messageId, content)
      if (updated) {
        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? { ...m, content: updated.content } : m))
        )
        return updated
      }
      return null
    },
    []
  )

  return { messages, send, toggleHeart, deleteMessage, updateMessage, sending }
}
