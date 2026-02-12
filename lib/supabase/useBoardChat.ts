'use client'

import { useState, useEffect, useCallback } from 'react'
import { fetchMessages, sendMessage, incrementHeart, subscribeMessages } from './messages'
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
  }
) {
  const { userCharacter, userNickname, enabled = true } = options
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
      }
    )

    return () => unsubscribe()
  }, [enabled, boardId])

  const send = useCallback(
    async (content: string, imageUrl?: string | null) => {
      const text = content.trim()
      if (!text && !imageUrl) return null
      if (sending) return null
      setSending(true)
      const sent = await sendMessage({
        boardId,
        authorCharacter: userCharacter,
        authorNickname: userNickname,
        content: text || ' ',
        imageUrl: imageUrl ?? undefined,
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
    },
    [boardId, userCharacter, userNickname, sending]
  )

  const addHeart = useCallback(async (messageId: string) => {
    const newCount = await incrementHeart(messageId)
    if (newCount != null) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, heartCount: newCount } : m
        )
      )
      return newCount
    }
    return null
  }, [])

  return { messages, send, addHeart, sending }
}
