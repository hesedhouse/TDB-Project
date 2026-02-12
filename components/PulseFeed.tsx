'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import DotCharacter from './DotCharacter'
import { mockBoards, mockPosts, getTimeProgress, extendBoardLifespan, formatRemainingTimer } from '@/lib/mockData'
import type { Post, Board } from '@/lib/mockData'
import { isSupabaseConfigured } from '@/lib/supabase/client'
import { useBoardChat } from '@/lib/supabase/useBoardChat'
import { uploadChatImage } from '@/lib/supabase/storage'
import { extendBoardExpiry } from '@/lib/supabase/boards'
import { getHourglasses, setHourglasses as persistHourglasses } from '@/lib/hourglass'
import { shareBoard } from '@/lib/shareBoard'
import type { Message } from '@/lib/supabase/types'

interface PulseFeedProps {
  boardId: string
  userCharacter: number
  userNickname: string
  onBack: () => void
}

type SortType = 'latest' | 'popular'

export default function PulseFeed({ boardId, userCharacter, userNickname, onBack }: PulseFeedProps) {
  const useSupabase = isSupabaseConfigured()

  const [sortType, setSortType] = useState<SortType>('latest')
  const [posts, setPosts] = useState<Post[]>(mockPosts.filter(p => p.boardId === boardId))
  const [progress, setProgress] = useState(100)
  const [lastClickTime, setLastClickTime] = useState<{ [key: string]: number }>({})
  const [board, setBoard] = useState<Board | undefined>(mockBoards.find(b => b.id === boardId))
  const [showLifespanExtended, setShowLifespanExtended] = useState(false)
  const [heartAnimations, setHeartAnimations] = useState<Set<string>>(new Set())
  const [chatInput, setChatInput] = useState('')
  const [uploadingImage, setUploadingImage] = useState(false)
  const [hourglasses, setHourglassesState] = useState(0)
  const [boardExpiresAtOverride, setBoardExpiresAtOverride] = useState<Date | null>(null)
  const [showHourglassToast, setShowHourglassToast] = useState(false)
  const [showShareToast, setShowShareToast] = useState(false)
  const [extendingHourglass, setExtendingHourglass] = useState(false)
  const [timerLabel, setTimerLabel] = useState('0:00:00')
  const [isUnderOneMinute, setIsUnderOneMinute] = useState(false)
  const [isExpired, setIsExpired] = useState(false)
  const feedEndRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setHourglassesState(getHourglasses())
  }, [])

  const HEARTED_STORAGE_KEY = 'tdb-hearted'

  const [heartedIds, setHeartedIds] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set()
    try {
      const raw = localStorage.getItem(HEARTED_STORAGE_KEY)
      return new Set((raw ? JSON.parse(raw) : []) as string[])
    } catch {
      return new Set()
    }
  })

  const { messages, send, toggleHeart, sending } = useBoardChat(boardId, {
    userCharacter,
    userNickname,
    enabled: useSupabase,
  })

  const handleSendMessage = useCallback(async () => {
    if ((!chatInput.trim()) || sending || uploadingImage || !useSupabase) return
    await send(chatInput)
    setChatInput('')
  }, [chatInput, sending, uploadingImage, useSupabase, send])

  const handlePhotoSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file || !useSupabase || sending || uploadingImage) return
      if (!file.type.startsWith('image/')) return
      e.target.value = ''
      setUploadingImage(true)
      const imageUrl = await uploadChatImage(file, boardId)
      setUploadingImage(false)
      if (imageUrl) await send(chatInput.trim(), imageUrl)
      if (chatInput.trim()) setChatInput('')
    },
    [useSupabase, boardId, send, sending, uploadingImage, chatInput]
  )

  const handleMessageHeart = useCallback(
    async (messageId: string) => {
      if (!useSupabase) return
      const isHearted = heartedIds.has(messageId)
      setHeartAnimations((prev) => new Set([...prev, messageId]))
      const result = await toggleHeart(messageId, isHearted)
      setTimeout(() => setHeartAnimations((prev) => {
        const next = new Set(prev)
        next.delete(messageId)
        return next
      }), 400)
      if (result) {
        setHeartedIds((prev) => {
          const next = new Set(prev)
          if (result.isHearted) next.add(messageId)
          else next.delete(messageId)
          try {
            localStorage.setItem(HEARTED_STORAGE_KEY, JSON.stringify([...next]))
          } catch (_) {}
          return next
        })
      }
    },
    [useSupabase, toggleHeart, heartedIds]
  )

  const handleHourglassExtend = useCallback(async () => {
    if (hourglasses <= 0 || extendingHourglass || !useSupabase) return
    setExtendingHourglass(true)
    const newExpiresAt = await extendBoardExpiry(boardId)
    setExtendingHourglass(false)
    if (newExpiresAt == null) return
    setHourglassesState((prev) => {
      const next = Math.max(0, prev - 1)
      persistHourglasses(next)
      return next
    })
    setBoardExpiresAtOverride(newExpiresAt)
    setShowHourglassToast(true)
    setTimeout(() => setShowHourglassToast(false), 3000)
  }, [hourglasses, extendingHourglass, useSupabase, boardId])

  // 스레드처럼 새 메시지 시 부드럽게 맨 아래로 스크롤
  useEffect(() => {
    if (!useSupabase || !listRef.current) return
    feedEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [useSupabase, messages.length])

  // 초 단위 타이머 + 프로그레스 (1초마다 갱신, unmount 시 clearInterval)
  useEffect(() => {
    const targetBoard = board ?? (useSupabase ? { createdAt: new Date(), expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) } : null)
    const effectiveExpiresAt: Date | undefined = boardExpiresAtOverride ?? targetBoard?.expiresAt
    if (!targetBoard || !effectiveExpiresAt) return

    const createdAt = targetBoard.createdAt instanceof Date ? targetBoard.createdAt : new Date(targetBoard.createdAt)
    const expiresAt = effectiveExpiresAt instanceof Date ? effectiveExpiresAt : new Date(effectiveExpiresAt)

    const tick = (): void => {
      const { label, remainingMs, isUnderOneMinute: under } = formatRemainingTimer(expiresAt)
      setTimerLabel(label)
      setIsUnderOneMinute(under)
      setProgress(getTimeProgress(createdAt, expiresAt))
      if (remainingMs <= 0) {
        setIsExpired(true)
      }
    }

    tick()
    const intervalId = setInterval(() => {
      const { remainingMs, ...rest } = formatRemainingTimer(expiresAt)
      setTimerLabel(rest.label)
      setIsUnderOneMinute(rest.isUnderOneMinute)
      setProgress(getTimeProgress(createdAt, expiresAt))
      if (remainingMs <= 0) {
        setIsExpired(true)
        clearInterval(intervalId)
      }
    }, 1000)

    return () => clearInterval(intervalId)
  }, [board, useSupabase, boardExpiresAtOverride])

  // 만료 시 "폭파" 메시지 후 메인으로
  useEffect(() => {
    if (!isExpired) return
    const t = setTimeout(() => {
      onBack()
    }, 2500)
    return () => clearTimeout(t)
  }, [isExpired, onBack])

  // 하트를 받으면 게시판 수명 연장
  useEffect(() => {
    if (!board) return
    
    const totalHearts = posts.reduce((sum, post) => sum + post.heartCount, 0)
    const originalHearts = board.heartCount
    
    if (totalHearts > originalHearts) {
      const newBoard = extendBoardLifespan(board, totalHearts - originalHearts)
      setBoard(newBoard)
      
      // 수명 연장 알림 표시
      setShowLifespanExtended(true)
      setTimeout(() => setShowLifespanExtended(false), 3000)
    }
  }, [posts, board])

  const sortedPosts = [...posts].sort((a, b) => {
    if (sortType === 'popular') {
      return b.heartCount - a.heartCount
    }
    return b.createdAt.getTime() - a.createdAt.getTime()
  })

  const handleHeart = (postId: string) => {
    setPosts(posts.map(post => 
      post.id === postId 
        ? { ...post, heartCount: post.heartCount + 1 }
        : post
    ))
    
    // 하트 애니메이션 효과
    setHeartAnimations(new Set([...heartAnimations, postId]))
    setTimeout(() => {
      setHeartAnimations(prev => {
        const newSet = new Set(prev)
        newSet.delete(postId)
        return newSet
      })
    }, 600)
    
    // 하트를 받으면 게시판 수명 연장
    if (board) {
      const newBoard = extendBoardLifespan(board, 1)
      setBoard(newBoard)
      setShowLifespanExtended(true)
      setTimeout(() => setShowLifespanExtended(false), 3000)
    }
  }

  const handleDoubleTap = (postId: string, e: React.MouseEvent | React.TouchEvent) => {
    const now = Date.now()
    const lastClick = lastClickTime[postId] || 0
    
    if (now - lastClick < 400) {
      // 더블탭 감지
      e.stopPropagation()
      handleHeart(postId)
      setLastClickTime({ ...lastClickTime, [postId]: 0 }) // 리셋
    } else {
      setLastClickTime({ ...lastClickTime, [postId]: now })
    }
  }

  const handleLongPress = (postId: string) => {
    let timer: NodeJS.Timeout | null = null
    
    const startPress = () => {
      timer = setTimeout(() => {
        handleHeart(postId)
        timer = null
      }, 600) // 600ms로 조정
    }
    
    const endPress = () => {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
    }
    
    return { 
      onMouseDown: startPress, 
      onMouseUp: endPress, 
      onMouseLeave: endPress,
      onTouchStart: startPress,
      onTouchEnd: endPress,
      onTouchCancel: endPress,
    }
  }

  const formatTimeAgo = (date: Date): string => {
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 1) return '방금 전'
    if (minutes < 60) return `${minutes}분 전`
    if (hours < 24) return `${hours}시간 전`
    return `${days}일 전`
  }

  const displayBoard = board ?? (useSupabase ? { name: `#${boardId}`, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), createdAt: new Date() } : null)
  if (!displayBoard) {
    return (
      <div className="min-h-screen bg-midnight-black flex items-center justify-center">
        <p className="text-gray-400">게시판을 찾을 수 없습니다.</p>
      </div>
    )
  }

  const effectiveExpiresAt = boardExpiresAtOverride ?? displayBoard.expiresAt

  const handleShare = useCallback(async () => {
    const result = await shareBoard(boardId, displayBoard.name)
    if (result === 'copied') {
      setShowShareToast(true)
      setTimeout(() => setShowShareToast(false), 2500)
    }
  }, [boardId, displayBoard.name])

  return (
    <div className="min-h-screen bg-midnight-black text-white safe-bottom">
      <AnimatePresence>
        {isExpired && (
          <motion.div
            className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/90 px-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.p
              className="text-xl sm:text-2xl font-bold text-red-500 text-center mb-2"
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', damping: 20 }}
            >
              이 방은 폭파되었습니다!
            </motion.p>
            <p className="text-sm text-gray-400">잠시 후 메인으로 이동합니다.</p>
          </motion.div>
        )}
        {showHourglassToast && (
          <motion.div
            className="fixed top-20 left-1/2 -translate-x-1/2 z-50 glass-strong px-5 py-3 rounded-2xl text-neon-orange font-bold text-center shadow-lg border border-neon-orange/40"
            initial={{ opacity: 0, y: -12, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.25 }}
          >
            ⏳ 모래가 채워졌습니다!
          </motion.div>
        )}
        {showShareToast && (
          <motion.div
            className="fixed top-20 left-1/2 -translate-x-1/2 z-50 glass-strong px-5 py-3 rounded-2xl text-white font-bold text-center shadow-lg border border-neon-orange/40"
            initial={{ opacity: 0, y: -12, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.25 }}
          >
            링크가 클립보드에 복사되었습니다!
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Bar with Progress */}
      <div className="sticky top-0 z-10 glass-strong border-b border-neon-orange/20 safe-top">
        <div className="px-3 py-3 sm:p-4">
          <div className="flex items-center justify-between mb-2 gap-2">
            <button
              onClick={onBack}
              className="text-gray-400 hover:text-white text-sm sm:text-base flex-shrink-0"
            >
              ← 뒤로
            </button>
            <h1 className="text-base sm:text-xl font-bold truncate flex-1 min-w-0">{displayBoard.name}</h1>
            <motion.button
              type="button"
              onClick={handleShare}
              className="flex-shrink-0 p-2 rounded-xl glass border border-neon-orange/30 text-neon-orange hover:bg-neon-orange/10 transition-colors"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              title="공유하기"
              aria-label="공유하기"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
            </motion.button>
            <div className="text-sm text-amber-400 flex items-center gap-1.5 flex-shrink-0">
              <span className="text-base leading-none flex-shrink-0" aria-hidden>⏳</span>
              <span>보유 모래시계: {hourglasses}개</span>
            </div>
          </div>
          
          {/* Progress Bar */}
          <div className="relative h-1 bg-gray-800 rounded-full overflow-hidden">
            <motion.div
              className="absolute top-0 left-0 h-full bg-neon-orange neon-glow"
              style={{ width: `${progress}%` }}
              initial={{ width: '100%' }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 1 }}
            />
          </div>
          
          <div className="text-xs text-neon-orange mt-2 text-center relative flex flex-col sm:flex-row items-center justify-center gap-2">
            <motion.span
              className={isUnderOneMinute ? 'text-red-500 font-bold' : ''}
              animate={isUnderOneMinute ? { scale: [1, 1.04, 1] } : {}}
              transition={{ duration: 1, repeat: Infinity, ease: 'easeInOut' }}
            >
              {timerLabel} 남음
            </motion.span>
            {useSupabase && (
              <motion.button
                type="button"
                onClick={handleHourglassExtend}
                disabled={hourglasses <= 0 || extendingHourglass}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-amber-500/20 text-amber-400 border border-amber-400/40 hover:bg-amber-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                whileHover={hourglasses > 0 && !extendingHourglass ? { scale: 1.03 } : {}}
                whileTap={hourglasses > 0 && !extendingHourglass ? { scale: 0.98 } : {}}
              >
                {extendingHourglass ? '연장 중…' : '⏳ 모래시계 채우기 (+1시간)'}
              </motion.button>
            )}
            {showLifespanExtended && (
              <motion.div
                className="absolute -top-8 left-1/2 transform -translate-x-1/2 glass-strong px-4 py-2 rounded-full text-neon-orange font-bold"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                ⚡ 수명 연장!
              </motion.div>
            )}
          </div>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-2 px-3 py-3 sm:p-4 border-b border-gray-800">
        <motion.button
          onClick={() => setSortType('latest')}
          className={`flex-1 py-2 rounded-xl font-semibold transition-all ${
            sortType === 'latest'
              ? 'bg-neon-orange text-white neon-glow'
              : 'glass text-gray-400'
          }`}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <span className="text-sm sm:text-base">최신순</span>
        </motion.button>
        <motion.button
          onClick={() => setSortType('popular')}
          className={`flex-1 py-2 rounded-xl font-semibold transition-all ${
            sortType === 'popular'
              ? 'bg-neon-orange text-white neon-glow'
              : 'glass text-gray-400'
          }`}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <span className="text-sm sm:text-base">인기순</span>
        </motion.button>
      </div>

      {/* 실시간 채팅 (Supabase 연동 시) */}
      {useSupabase && (
        <>
          <div
            ref={listRef}
            className="px-3 py-4 sm:p-4 space-y-3 pb-28 sm:pb-24 overflow-y-auto max-h-[calc(100vh-220px)] scrollbar-hide"
          >
            {[...messages]
              .sort((a, b) =>
                sortType === 'popular'
                  ? b.heartCount - a.heartCount
                  : a.createdAt.getTime() - b.createdAt.getTime()
              )
              .map((msg) => {
                const isMine =
                  msg.authorNickname === userNickname &&
                  msg.authorCharacter === userCharacter
                return (
                  <motion.div
                    key={msg.id}
                    className={`flex gap-2 ${isMine ? 'flex-row-reverse' : ''}`}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25 }}
                  >
                    {!isMine && (
                      <div className="flex-shrink-0 pt-0.5">
                        <DotCharacter characterId={msg.authorCharacter} size={36} />
                      </div>
                    )}
                    <div
                      className={`flex flex-col max-w-[85%] sm:max-w-[75%] ${isMine ? 'items-end' : 'items-start'}`}
                    >
                      {!isMine && (
                        <span className="text-xs text-gray-400 mb-0.5">
                          {msg.authorNickname}
                        </span>
                      )}
                      <div
                        className={`rounded-2xl px-4 py-2.5 glass-strong ${
                          isMine
                            ? 'bg-neon-orange/20 border-neon-orange/40'
                            : 'border-white/10'
                        }`}
                      >
                        {msg.imageUrl && (
                          <a
                            href={msg.imageUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block mb-2 rounded-xl overflow-hidden border border-white/10 focus:outline-none focus:ring-2 focus:ring-neon-orange/50"
                          >
                            <motion.img
                              src={msg.imageUrl}
                              alt=""
                              className="w-full max-w-[280px] sm:max-w-[320px] h-auto max-h-[240px] object-cover"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              transition={{ duration: 0.2 }}
                            />
                          </a>
                        )}
                        {(msg.content?.trim() ?? '') !== '' && (
                          <p className="text-sm sm:text-base text-white/95 whitespace-pre-wrap break-words">
                            {msg.content}
                          </p>
                        )}
                        <div className="flex items-center justify-end gap-1.5 mt-2">
                          <motion.button
                            type="button"
                            onClick={() => handleMessageHeart(msg.id)}
                            className={`flex items-center gap-1 text-xs ${
                              heartedIds.has(msg.id)
                                ? 'text-red-500 hover:text-red-400'
                                : 'text-neon-orange/90 hover:text-neon-orange'
                            }`}
                            whileTap={{ scale: 0.9 }}
                          >
                            <motion.span
                              animate={
                                heartAnimations.has(msg.id)
                                  ? { scale: [1, 1.3, 1] }
                                  : {}
                              }
                              transition={{ duration: 0.3 }}
                            >
                              ❤️
                            </motion.span>
                            <span className="font-semibold">{msg.heartCount}</span>
                          </motion.button>
                        </div>
                      </div>
                      <span className="text-[10px] text-gray-500 mt-0.5">
                        {formatTimeAgo(msg.createdAt)}
                      </span>
                    </div>
                    {isMine && (
                      <div className="flex-shrink-0 pt-0.5">
                        <DotCharacter characterId={msg.authorCharacter} size={36} />
                      </div>
                    )}
                  </motion.div>
                )
              })}
            <div ref={feedEndRef} />
          </div>

          {/* 하단 메시지 입력 */}
          <div className="fixed bottom-0 left-0 right-0 glass-strong border-t border-neon-orange/20 safe-bottom px-3 py-3 sm:px-4 sm:py-3">
            <div className="app-shell mx-auto flex gap-2 items-end">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePhotoSelect}
              />
              <motion.button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={sending || uploadingImage}
                className="flex-shrink-0 w-12 h-12 rounded-2xl glass border border-neon-orange/30 flex items-center justify-center text-neon-orange hover:bg-neon-orange/10 disabled:opacity-50 disabled:cursor-not-allowed"
                whileHover={!(sending || uploadingImage) ? { scale: 1.05 } : {}}
                whileTap={!(sending || uploadingImage) ? { scale: 0.95 } : {}}
                title="사진 추가"
              >
                {uploadingImage ? (
                  <span className="text-lg animate-pulse">⏳</span>
                ) : (
                  <span className="text-xl">📷</span>
                )}
              </motion.button>
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSendMessage()
                  }
                }}
                placeholder="메시지 입력..."
                className="flex-1 min-w-0 px-4 py-3 rounded-2xl glass border border-neon-orange/30 focus:border-neon-orange focus:outline-none text-white placeholder-gray-400 text-sm sm:text-base"
                maxLength={500}
              />
              <motion.button
                type="button"
                onClick={handleSendMessage}
                disabled={!chatInput.trim() || sending}
                className="flex-shrink-0 w-12 h-12 rounded-2xl bg-neon-orange text-white flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                whileHover={!sending ? { scale: 1.05 } : {}}
                whileTap={!sending ? { scale: 0.95 } : {}}
              >
                {sending ? (
                  <span className="text-lg">⏳</span>
                ) : (
                  <span className="text-lg">➤</span>
                )}
              </motion.button>
            </div>
          </div>
        </>
      )}

      {/* Feed - 왼쪽 정렬 말풍선 스타일 (Supabase 미사용 시 목업) */}
      {!useSupabase && (
      <div className="px-3 py-4 sm:p-4 space-y-4 pb-24 sm:pb-20">
        <AnimatePresence>
          {sortedPosts.map((post) => (
            <motion.div
              key={post.id}
              className="glass-strong rounded-3xl p-4 sm:p-5 relative"
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                backdropFilter: 'blur(20px)',
                border: '1px solid rgba(255, 95, 0, 0.2)',
              }}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              onClick={(e) => handleDoubleTap(post.id, e)}
              {...handleLongPress(post.id)}
              whileTap={{ scale: 0.98 }}
            >
              {/* Author Info - 왼쪽 정렬 */}
              <div className="flex items-start gap-3 mb-3">
                <DotCharacter characterId={post.authorCharacter} size={40} />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-white">{post.authorNickname}</div>
                  <div className="text-xs text-gray-400">
                    {formatTimeAgo(post.createdAt)}
                  </div>
                </div>
              </div>

              {/* Content - 말풍선 스타일 */}
              <div className="mb-3 text-white/95 leading-relaxed whitespace-pre-wrap break-words">
                {post.content}
              </div>

              {/* Images Carousel - 가로 슬라이드, 최대 5장 */}
              {post.images && post.images.length > 0 && (
                <div className="mb-3 overflow-x-auto scrollbar-hide snap-x snap-mandatory">
                  <div className="flex gap-3" style={{ width: 'max-content' }}>
                    {post.images.slice(0, 5).map((img, idx) => (
                      <motion.img
                        key={idx}
                        src={img}
                        alt={`Image ${idx + 1}`}
                        className="w-56 h-40 object-cover rounded-2xl flex-shrink-0 snap-start cursor-pointer"
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Links - 썸네일 카드 스타일 */}
              {post.links && post.links.length > 0 && (
                <div className="mb-3 space-y-2">
                  {post.links.map((link, idx) => (
                    <motion.a
                      key={idx}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block glass rounded-2xl p-4 hover:bg-white/10 transition-all border border-neon-orange/20 hover:border-neon-orange/40"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`w-16 h-16 rounded-xl flex items-center justify-center flex-shrink-0 ${
                          link.type === 'youtube' ? 'bg-red-500/20' :
                          link.type === 'instagram' ? 'bg-pink-500/20' :
                          'bg-neon-orange/20'
                        }`}>
                          {link.type === 'youtube' && <span className="text-3xl">▶️</span>}
                          {link.type === 'instagram' && <span className="text-3xl">📷</span>}
                          {link.type === 'other' && <span className="text-3xl">🔗</span>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-base mb-1">
                            {link.type === 'youtube' && 'YouTube 영상'}
                            {link.type === 'instagram' && 'Instagram 게시물'}
                            {link.type === 'other' && '외부 링크'}
                          </div>
                          <div className="text-xs text-gray-400 truncate">
                            {link.url.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                          </div>
                        </div>
                        <div className="text-neon-orange text-xl">→</div>
                      </div>
                    </motion.a>
                  ))}
                </div>
              )}

              {/* Heart Button with Animation */}
              <div className="flex items-center justify-between pt-2 border-t border-white/10 relative">
                <motion.button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleHeart(post.id)
                  }}
                  className="flex items-center gap-2 text-neon-orange hover:text-neon-orange/80 transition-colors relative z-10"
                  whileHover={{ scale: 1.15 }}
                  whileTap={{ scale: 0.85 }}
                >
                  <motion.span
                    className="text-2xl"
                    animate={heartAnimations.has(post.id) ? { 
                      scale: [1, 1.5, 1],
                      rotate: [0, -10, 10, 0]
                    } : {}}
                    transition={{ duration: 0.4 }}
                  >
                    ❤️
                  </motion.span>
                  <motion.span 
                    className="font-bold text-lg"
                    animate={heartAnimations.has(post.id) ? { 
                      scale: [1, 1.2, 1],
                      color: ['#FF5F00', '#FF8C42', '#FF5F00']
                    } : {}}
                    transition={{ duration: 0.4 }}
                  >
                    {post.heartCount}
                  </motion.span>
                </motion.button>
                
                {/* 더블탭 시 하트 이펙트 */}
                <AnimatePresence>
                  {heartAnimations.has(post.id) && (
                    <motion.div
                      className="absolute left-0 top-0 pointer-events-none"
                      initial={{ opacity: 0, scale: 0, y: 0 }}
                      animate={{ opacity: [0, 1, 0], scale: [0, 1.5, 2], y: -30 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.6 }}
                    >
                      <span className="text-4xl">❤️</span>
                    </motion.div>
                  )}
                </AnimatePresence>
                
                <span className="text-xs text-gray-500">
                  더블탭 또는 길게 눌러서 하트 보내기
                </span>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {sortedPosts.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            아직 게시물이 없습니다.
          </div>
        )}
      </div>
      )}
    </div>
  )
}
