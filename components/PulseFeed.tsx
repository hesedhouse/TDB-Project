'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import DotCharacter from './DotCharacter'
import { mockBoards, mockPosts, getTimeProgress, extendBoardLifespan, formatRemainingTimer } from '@/lib/mockData'
import type { Post, Board } from '@/lib/mockData'
import { isSupabaseConfigured, isValidUuid } from '@/lib/supabase/client'
import { useBoardChat } from '@/lib/supabase/useBoardChat'
import { uploadChatImage } from '@/lib/supabase/storage'
import { extendBoardExpiry, EXTEND_MS_PER_HOURGLASS } from '@/lib/supabase/boards'
import { recordContribution, getTopContributors, subscribeToContributions, type TopContributor } from '@/lib/supabase/contributions'
import { getHourglasses, setHourglasses as persistHourglasses } from '@/lib/hourglass'
import { shareBoard } from '@/lib/shareBoard'
import { addOrUpdateSession, findSession } from '@/lib/activeSessions'
import type { Message } from '@/lib/supabase/types'

interface PulseFeedProps {
  boardId: string
  /** 사용자용 숫자 방 번호 (No. 123). Supabase public_id 또는 API 응답 */
  boardPublicId?: number | null
  /** URL 경로의 방 식별자 (예: /board/5 → "5"). 새 방 리다이렉트 시 배지에 즉시 반영용 */
  roomIdFromUrl?: string | null
  userCharacter: number
  userNickname: string
  /** 로그인 유저의 Auth UID. 게시글 저장 시 user_id로 Supabase에 전달 (관리자 추적용) */
  userId?: string | null
  onBack: () => void
  /** Supabase에서 조회한 방의 만료 시각 (UUID 보드일 때 타이머용) */
  initialExpiresAt?: Date | null
  /** Supabase에서 조회한 방의 생성 시각 */
  initialCreatedAt?: Date | null
  /** 방 표시명 (예: #키워드) */
  initialBoardName?: string | null
}

type SortType = 'latest' | 'popular'

/** 포스트/메시지별 댓글 (로컬 상태, image_c91edc 스타일) */
export interface Comment {
  id: string
  postId: string
  authorNickname: string
  authorCharacter: number
  content: string
  createdAt: Date
}

export default function PulseFeed({ boardId: rawBoardId, boardPublicId, roomIdFromUrl, userCharacter: rawUserCharacter, userNickname: rawUserNickname, userId, onBack, initialExpiresAt, initialCreatedAt, initialBoardName }: PulseFeedProps) {
  /** 방/유저 정보가 아직 준비되지 않았을 때를 대비한 안전한 기본값 (클라이언트 에러 방지) */
  const boardId = typeof rawBoardId === 'string' && rawBoardId.trim() !== '' ? rawBoardId.trim() : ''
  const userNickname = rawUserNickname ?? '게스트'
  const userCharacter = rawUserCharacter ?? 0

  const useSupabase = isSupabaseConfigured()
  /** Supabase 사용 시 반드시 UUID인 경우만 API 호출 (400 에러 방지) */
  const useSupabaseWithUuid = useSupabase && isValidUuid(boardId)

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
  const [noCopyToast, setNoCopyToast] = useState<string | null>(null)
  const [showRoomNoCopyToast, setShowRoomNoCopyToast] = useState(false)
  const [extendingHourglass, setExtendingHourglass] = useState(false)
  const [timerLabel, setTimerLabel] = useState('0:00:00')
  const [timerMounted, setTimerMounted] = useState(false)
  const [isUnderOneMinute, setIsUnderOneMinute] = useState(false)
  const [isExpired, setIsExpired] = useState(false)
  const [topContributors, setTopContributors] = useState<TopContributor[]>([])
  const [showWriteModal, setShowWriteModal] = useState(false)
  const [writeContent, setWriteContent] = useState('')
  const [writeImageFile, setWriteImageFile] = useState<File | null>(null)
  /** 방 입장 시 닉네임 설정 모달: 클라이언트 마운트 후에만 표시 (Hydration 방지) */
  const ROOM_NICKNAME_KEY_PREFIX = 'tdb-room-nickname-'
  const [nicknameModalMounted, setNicknameModalMounted] = useState(false)
  const [showNicknameModal, setShowNicknameModal] = useState(false)
  const [effectiveNickname, setEffectiveNickname] = useState('')
  const [nicknameInput, setNicknameInput] = useState('')
  const feedEndRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const writeModalFileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setHourglassesState(getHourglasses())
  }, [])

  /** 클라이언트 마운트 완료 후에만 닉네임 모달 로직 실행 (Vercel/SSR Hydration 방지) */
  useEffect(() => {
    setNicknameModalMounted(true)
  }, [])

  /** 방 입장 시 세션/워프존 저장 닉네임 있으면 pre-fill; 워프존으로 입장 시 모달 스킵 */
  useEffect(() => {
    if (!nicknameModalMounted || typeof window === 'undefined') return
    if (!boardId) {
      setEffectiveNickname(userNickname)
      setShowNicknameModal(false)
      return
    }
    try {
      const key = `${ROOM_NICKNAME_KEY_PREFIX}${boardId}`
      let saved = (window.sessionStorage.getItem(key) ?? '').trim()
      const fromWarp = findSession(boardId, roomIdFromUrl ?? undefined)
      if (fromWarp?.nickname) {
        saved = fromWarp.nickname
        window.sessionStorage.setItem(key, saved)
        setNicknameInput(saved)
        setEffectiveNickname(saved)
        setShowNicknameModal(false)
        return
      }
      setNicknameInput(saved)
      setEffectiveNickname(saved || userNickname)
      setShowNicknameModal(true)
    } catch {
      setEffectiveNickname(userNickname)
      setShowNicknameModal(true)
    }
  }, [nicknameModalMounted, boardId, userNickname, roomIdFromUrl])

  useEffect(() => {
    if (!noCopyToast) return
    const t = setTimeout(() => setNoCopyToast(null), 1200)
    return () => clearTimeout(t)
  }, [noCopyToast])

  useEffect(() => {
    if (!showRoomNoCopyToast) return
    const t = setTimeout(() => setShowRoomNoCopyToast(false), 2200)
    return () => clearTimeout(t)
  }, [showRoomNoCopyToast])

  const HEARTED_STORAGE_KEY = 'tdb-hearted'
  const POST_HEARTED_STORAGE_KEY = 'tdb-hearted-posts'

  const [heartedIds, setHeartedIds] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set()
    try {
      const raw = localStorage.getItem(HEARTED_STORAGE_KEY)
      return new Set((raw ? JSON.parse(raw) : []) as string[])
    } catch {
      return new Set()
    }
  })

  /** 목업 포스트: 사용자가 좋아요 한 postId 집합 (토글용, 로컬 저장) */
  const [postHeartedIds, setPostHeartedIds] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set()
    try {
      const raw = localStorage.getItem(POST_HEARTED_STORAGE_KEY)
      return new Set((raw ? JSON.parse(raw) : []) as string[])
    } catch {
      return new Set()
    }
  })

  /** 포스트/메시지별 댓글 목록 (postId 또는 messageId → Comment[]) */
  const [commentsByTargetId, setCommentsByTargetId] = useState<Record<string, Comment[]>>({})
  /** 댓글 펼침 여부 (아코디언) */
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set())
  /** 댓글 입력값 (targetId → text) */
  const [commentInputByTarget, setCommentInputByTarget] = useState<Record<string, string>>({})

  /** 글/댓글 작성자 이름: 모달 또는 localStorage 저장값 우선, 없으면 prop(게스트) */
  const authorNickname = (effectiveNickname || '').trim() || userNickname

  const { messages, send, toggleHeart, sending } = useBoardChat(boardId, {
    userCharacter,
    userNickname: authorNickname,
    enabled: useSupabaseWithUuid && !!boardId,
    userId: userId ?? undefined,
  })

  const handleSendMessage = useCallback(async () => {
    if ((!chatInput.trim()) || sending || uploadingImage || !useSupabaseWithUuid) return
    const sent = await send(chatInput)
    if (sent) {
      setChatInput('')
      // 새 글이 등록되면 목록 최상단으로 부드럽게 스크롤
      setTimeout(() => {
        listRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
      }, 100)
    }
  }, [chatInput, sending, uploadingImage, useSupabaseWithUuid, send])

  const handlePhotoSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file || !useSupabaseWithUuid || sending || uploadingImage) return
      if (!file.type.startsWith('image/')) return
      e.target.value = ''
      setUploadingImage(true)
      const imageUrl = await uploadChatImage(file, boardId)
      setUploadingImage(false)
      if (imageUrl) await send(chatInput.trim(), imageUrl)
      if (chatInput.trim()) setChatInput('')
    },
    [useSupabaseWithUuid, boardId, send, sending, uploadingImage, chatInput]
  )

  const handleCloseWriteModal = useCallback(() => {
    setShowWriteModal(false)
    setWriteContent('')
    setWriteImageFile(null)
  }, [])

  const handleSubmitWriteModal = useCallback(async () => {
    const text = writeContent.trim()
    if (useSupabaseWithUuid) {
      if (!text && !writeImageFile) return
      setUploadingImage(true)
      let imageUrl: string | undefined
      if (writeImageFile) {
        imageUrl = (await uploadChatImage(writeImageFile, boardId)) ?? undefined
      }
      setUploadingImage(false)
      const sent = await send(text || '', imageUrl)
      if (sent) {
        handleCloseWriteModal()
        // 새 글이 등록되면 목록 최상단으로 부드럽게 스크롤
        setTimeout(() => {
          listRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
        }, 100)
      }
      return
    }
    if (!text) return
    const newPost: Post = {
      id: `post-${Date.now()}`,
      boardId,
      authorCharacter: userCharacter,
      authorNickname,
      content: text,
      images: writeImageFile ? [URL.createObjectURL(writeImageFile)] : undefined,
      heartCount: 0,
      createdAt: new Date(),
    }
    setPosts((prev) => [newPost, ...prev])
    handleCloseWriteModal()
  }, [writeContent, writeImageFile, useSupabaseWithUuid, boardId, send, userCharacter, authorNickname, handleCloseWriteModal])

  const handleMessageHeart = useCallback(
    async (messageId: string) => {
      if (!useSupabaseWithUuid) return
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
          if (typeof window !== 'undefined') {
            try {
              window.localStorage.setItem(HEARTED_STORAGE_KEY, JSON.stringify([...next]))
            } catch (_) {}
          }
          return next
        })
      }
    },
    [useSupabaseWithUuid, toggleHeart, heartedIds]
  )

  const handleHourglassExtend = useCallback(async () => {
    if (extendingHourglass || !useSupabaseWithUuid || !isValidUuid(boardId)) return
    const current = getHourglasses()
    if (current <= 0) {
      setHourglassesState(0)
      alert('모래시계가 부족합니다!')
      return
    }
    setExtendingHourglass(true)
    try {
      const newExpiresAt = await extendBoardExpiry(boardId)
      if (newExpiresAt == null) return
      const next = Math.max(0, current - 1)
      persistHourglasses(next)
      setHourglassesState(next)
      setBoardExpiresAtOverride(newExpiresAt)
      setShowHourglassToast(true)
      setTimeout(() => setShowHourglassToast(false), 3000)
      const minutesPerHourglass = Math.round(EXTEND_MS_PER_HOURGLASS / (60 * 1000))
      let displayName = ''
      if (typeof window !== 'undefined') {
        try {
          displayName = window.localStorage.getItem('tdb-user-nickname') ?? ''
        } catch {}
      }
      const name = (displayName || '').trim() || '익명의 수호자'
      await recordContribution(boardId, name, minutesPerHourglass)
      getTopContributors(boardId).then(setTopContributors)
    } finally {
      setExtendingHourglass(false)
    }
  }, [extendingHourglass, useSupabaseWithUuid, boardId])

  // 스레드처럼 새 메시지 시 부드럽게 맨 아래로 스크롤
  useEffect(() => {
    if (!useSupabaseWithUuid || !listRef.current) return
    feedEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [useSupabaseWithUuid, messages.length])

  // 초 단위 타이머 + 프로그레스 (1초마다 갱신, unmount 시 clearInterval)
  useEffect(() => {
    const fallbackExpires = initialExpiresAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    const fallbackCreated = initialCreatedAt ?? new Date()
    const targetBoard = board ?? (useSupabase ? { createdAt: fallbackCreated, expiresAt: fallbackExpires } : null)
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
    setTimerMounted(true)
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
  }, [board, useSupabase, boardExpiresAtOverride, initialExpiresAt, initialCreatedAt])

  // 만료 시 "폭파" 메시지 후 메인으로
  useEffect(() => {
    if (!isExpired) return
    const t = setTimeout(() => {
      onBack()
    }, 2500)
    return () => clearTimeout(t)
  }, [isExpired, onBack])

  // 명예의 전당 TOP 3 조회 + Realtime 구독
  useEffect(() => {
    if (!useSupabaseWithUuid) return
    getTopContributors(boardId).then(setTopContributors)
    const unsubscribe = subscribeToContributions(boardId, () => {
      getTopContributors(boardId).then(setTopContributors)
    })
    return unsubscribe
  }, [useSupabaseWithUuid, boardId])

  // 하트를 받으면 게시판 수명 연장
  useEffect(() => {
    if (!board) return
    const totalHearts = (posts ?? []).reduce((sum, post) => sum + (post?.heartCount ?? 0), 0)
    const originalHearts = board?.heartCount ?? 0
    if (totalHearts > originalHearts) {
      const newBoard = extendBoardLifespan(board, totalHearts - originalHearts)
      setBoard(newBoard)
      
      // 수명 연장 알림 표시
      setShowLifespanExtended(true)
      setTimeout(() => setShowLifespanExtended(false), 3000)
    }
  }, [posts, board])

  const sortedPosts = [...(posts ?? [])].sort((a, b) => {
    if (sortType === 'popular') {
      return (b?.heartCount ?? 0) - (a?.heartCount ?? 0)
    }
    return (b?.createdAt ? new Date(b.createdAt).getTime() : 0) - (a?.createdAt ? new Date(a.createdAt).getTime() : 0)
  })

  /** 목업 포스트: 하트 토글 (+1 / -1), 로컬에 선택 저장 */
  const handleHeart = (postId: string) => {
    const isHearted = postHeartedIds.has(postId)
    setPostHeartedIds((prev) => {
      const next = new Set(prev)
      if (isHearted) next.delete(postId)
      else next.add(postId)
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(POST_HEARTED_STORAGE_KEY, JSON.stringify([...next]))
        } catch {}
      }
      return next
    })
    setPosts((posts ?? []).map(post =>
      post.id === postId
        ? { ...post, heartCount: Math.max(0, post.heartCount + (isHearted ? -1 : 1)) }
        : post
    ))
    setHeartAnimations((prev) => new Set([...prev, postId]))
    setTimeout(() => setHeartAnimations((p) => { const n = new Set(p); n.delete(postId); return n }), 500)
    if (board && !isHearted) {
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

  const displayBoard =
    board ??
    (useSupabase
      ? { name: initialBoardName ?? `#${boardId}`, expiresAt: initialExpiresAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), createdAt: initialCreatedAt ?? new Date() }
      : initialBoardName != null
        ? { name: initialBoardName, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), createdAt: new Date() }
        : null)

  if (!displayBoard) {
    return (
      <div className="min-h-screen bg-midnight-black flex items-center justify-center">
        <p className="text-gray-400">게시판을 찾을 수 없습니다.</p>
      </div>
    )
  }

  /** 헤더용: ID(#board-4 등) 제거, 깔끔한 방 제목만 */
  const displayTitle =
    displayBoard.name != null && /^#?board-\d+$/i.test(displayBoard.name.trim())
      ? '새 방'
      : (displayBoard.name ?? '방')
  const headerTitle = String(displayTitle).replace(/^#\s*/, '').trim() || '익명의 떴다방'

  /** 방 번호: DB room_no(→ boardPublicId) → URL 숫자(roomIdFromUrl) → board-N. 로딩 끝나면 No. {room_no} 표시 */
  const roomNo =
    boardPublicId != null
      ? String(boardPublicId)
      : (roomIdFromUrl != null && roomIdFromUrl !== '' && /^\d+$/.test(String(roomIdFromUrl))
          ? String(roomIdFromUrl)
          : (boardId.match(/^board-(\d+)$/i)?.[1] ?? null))
  const roomNoReady = roomNo != null && roomNo !== ''

  const effectiveExpiresAt = boardExpiresAtOverride ?? displayBoard.expiresAt

  const handleShare = useCallback(async () => {
    const result = await shareBoard(boardId, displayBoard.name)
    if (result === 'copied') {
      setShowShareToast(true)
      setTimeout(() => setShowShareToast(false), 2500)
    }
  }, [boardId, displayBoard.name])

  /** 방 번호 클릭 시 전체 방 URL 복사 + 토스트 */
  const handleCopyRoomLink = useCallback(async () => {
    try {
      const url = typeof window !== 'undefined' ? window.location.href : ''
      if (!url) return
      await navigator.clipboard.writeText(url)
      setShowShareToast(true)
      setTimeout(() => setShowShareToast(false), 2500)
    } catch {
      setNoCopyToast('복사 실패')
    }
  }, [])

  const handleNicknameSubmit = useCallback(() => {
    const name = nicknameInput.trim()
    if (!name) return
    if (typeof window !== 'undefined') {
      try {
        window.sessionStorage.setItem(`${ROOM_NICKNAME_KEY_PREFIX}${boardId}`, name)
      } catch {}
      addOrUpdateSession({
        boardId,
        boardName: (initialBoardName ?? '').trim() || `#${boardId}`,
        nickname: name,
        keyword: (roomIdFromUrl ?? boardId).toString().trim(),
        expiresAt: initialExpiresAt != null ? new Date(initialExpiresAt).getTime() : undefined,
      })
    }
    setEffectiveNickname(name)
    setShowNicknameModal(false)
  }, [nicknameInput, boardId, initialBoardName, roomIdFromUrl, initialExpiresAt])

  return (
    <div className="min-h-screen bg-midnight-black text-white safe-bottom">
      <AnimatePresence>
        {nicknameModalMounted && showNicknameModal && (
          <motion.div
            className="fixed inset-0 z-[90] flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ background: 'rgba(0,0,0,0.92)' }}
          >
            <motion.div
              className="w-full max-w-sm rounded-2xl p-6"
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: 'spring', damping: 24, stiffness: 300 }}
              style={{
                background: '#0a0a0a',
                border: '2px solid rgba(255,107,0,0.6)',
                boxShadow: '0 0 20px rgba(255,107,0,0.25), 0 0 40px rgba(255,107,0,0.12), inset 0 0 0 1px rgba(255,107,0,0.15)',
              }}
            >
              <h2 className="text-lg sm:text-xl font-bold text-center mb-1 text-white" style={{ textShadow: '0 0 12px rgba(255,255,255,0.15)' }}>
                닉네임 설정
              </h2>
              <p className="text-center text-gray-400 text-sm mb-4">
                이 방에서 당신의 부캐(이름)를 정해주세요
              </p>
              <input
                type="text"
                value={nicknameInput}
                onChange={(e) => setNicknameInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleNicknameSubmit()}
                placeholder="닉네임 입력"
                maxLength={20}
                className="w-full px-4 py-3 rounded-xl bg-black/60 border-2 border-[#FF6B00]/50 focus:border-[#FF6B00] focus:outline-none focus:ring-2 focus:ring-[#FF6B00]/40 text-white placeholder-gray-500 text-sm sm:text-base mb-4"
                style={{ boxShadow: '0 0 12px rgba(255,107,0,0.15)' }}
              />
              <motion.button
                type="button"
                onClick={handleNicknameSubmit}
                disabled={!nicknameInput.trim()}
                className="w-full py-3.5 rounded-xl font-bold text-base text-white disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background: nicknameInput.trim() ? '#FF6B00' : '#555',
                  boxShadow: nicknameInput.trim() ? '0 0 14px rgba(255,107,0,0.4), 0 0 24px rgba(255,107,0,0.2)' : 'none',
                }}
                whileHover={nicknameInput.trim() ? { scale: 1.02 } : {}}
                whileTap={nicknameInput.trim() ? { scale: 0.98 } : {}}
              >
                확인
              </motion.button>
            </motion.div>
          </motion.div>
        )}
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
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 glass-strong px-5 py-3 rounded-2xl text-neon-orange font-bold text-center shadow-lg border border-neon-orange/40 safe-bottom"
            initial={{ opacity: 0, y: 12, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.25 }}
          >
            시간의 모래가 채워졌습니다! (+30분)
          </motion.div>
        )}
        {showShareToast && (
          <motion.div
            className="fixed top-20 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl font-bold text-center safe-top"
            style={{
              background: 'rgba(18,18,18,0.95)',
              border: '1px solid rgba(255,107,0,0.5)',
              color: '#FF6B00',
              boxShadow: '0 0 20px rgba(255,107,0,0.3), 0 0 40px rgba(255,107,0,0.15)',
            }}
            initial={{ opacity: 0, y: -12, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.25 }}
          >
            방 링크가 복사되었습니다!
          </motion.div>
        )}
        {showRoomNoCopyToast && (
          <motion.div
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl font-bold text-center safe-bottom"
            style={{
              background: 'rgba(18,18,18,0.95)',
              border: '1px solid rgba(255,107,0,0.5)',
              color: '#FF6B00',
              boxShadow: '0 0 20px rgba(255,107,0,0.3), 0 0 40px rgba(255,107,0,0.15)',
            }}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.25 }}
          >
            방 번호가 복사되었습니다!
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Bar with Progress */}
      <div className="sticky top-0 z-10 glass-strong border-b border-neon-orange/20 safe-top pt-8">
        <div className="px-3 py-3 sm:p-4">
          <div className="flex items-center justify-between mb-2 gap-2">
            <button
              onClick={onBack}
              className="text-gray-400 hover:text-white text-sm sm:text-base flex-shrink-0"
            >
              ← 뒤로
            </button>
            <div className="flex-1 min-w-0 flex items-center gap-2 sm:gap-3 flex-wrap items-center">
              <h1 className="text-base sm:text-xl font-bold truncate min-w-0 text-white">
                {headerTitle}
              </h1>
              {/* 오렌지 No. room_no 배지: DB room_no 반영, 로딩 중엔 … 표시, 클릭 시 방 링크 복사 */}
              <button
                type="button"
                onClick={handleCopyRoomLink}
                className="inline-flex items-center shrink-0 text-xs sm:text-sm font-bold select-none transition-all hover:brightness-110 rounded-md px-2 py-0.5 cursor-pointer border-0"
                style={{
                  background: '#FF6B00',
                  color: '#fff',
                  boxShadow: roomNoReady ? '0 0 10px rgba(255,107,0,0.5), 0 0 18px rgba(255,107,0,0.25)' : '0 0 8px rgba(255,107,0,0.35)',
                }}
                title="방 링크 복사"
                aria-label={roomNoReady ? `방 번호 No. ${roomNo} - 클릭 시 방 링크 복사` : '방 링크 복사'}
              >
                {roomNoReady ? (
                  <span className="tabular-nums">No. {roomNo}</span>
                ) : (
                  <motion.span
                    className="tabular-nums opacity-80"
                    animate={{ opacity: [0.6, 1, 0.6] }}
                    transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
                  >
                    No. …
                  </motion.span>
                )}
              </button>
            </div>
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
          
          <div className="text-neon-orange mt-2 text-center relative flex flex-col sm:flex-row items-center justify-center gap-2 min-w-0 overflow-hidden">
            <motion.span
              className={`inline-flex items-baseline gap-1 shrink min-w-0 whitespace-nowrap ${isUnderOneMinute ? 'text-red-500 font-bold' : ''}`}
              style={{
                fontSize:
                  timerLabel.length > 18
                    ? '0.5rem'
                    : timerLabel.length > 14
                      ? '0.6rem'
                      : timerLabel.length > 11
                        ? '0.65rem'
                        : 'clamp(0.5rem, 2.5vw, 0.75rem)',
              }}
              animate={isUnderOneMinute ? { scale: [1, 1.04, 1] } : {}}
              transition={{ duration: 1, repeat: Infinity, ease: 'easeInOut' }}
            >
              <span className="font-mono tabular-nums text-left" aria-label="남은 시간">
                {timerMounted ? timerLabel : '\u00A0'}
              </span>
              <span>남음</span>
            </motion.span>
            {useSupabaseWithUuid && (
              <motion.button
                type="button"
                onClick={handleHourglassExtend}
                disabled={hourglasses <= 0 || extendingHourglass}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-amber-500/20 text-amber-400 border border-amber-400/40 hover:bg-amber-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                whileHover={hourglasses > 0 && !extendingHourglass ? { scale: 1.03 } : {}}
                whileTap={hourglasses > 0 && !extendingHourglass ? { scale: 0.98 } : {}}
              >
                {extendingHourglass ? '연장 중…' : '⏳ 모래시계 채우기 (+30분)'}
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
          {useSupabaseWithUuid && topContributors.length > 0 && (
            <div className="mt-3 pt-3 border-t border-amber-500/20">
              <p className="text-xs text-amber-400/80 mb-1.5">명예의 전당 TOP 3</p>
              <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-300">
                {topContributors.map((c) => (
                  <li key={`${c.rank}-${c.user_display_name}`} className="flex items-center gap-1.5">
                    <span aria-hidden>
                      {c.rank === 1 ? '👑' : c.rank === 2 ? '🥈' : '🥉'}
                    </span>
                    <span className="font-medium text-white truncate max-w-[100px]" title={c.user_display_name}>
                      {c.user_display_name}
                    </span>
                    <span className="text-amber-400/90 tabular-nums">+{c.total_minutes}분</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
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

      {/* 포스트/메시지 리스트 (Supabase 연동 시 포스트 스타일 카드로 통일) */}
      {useSupabaseWithUuid && (
        <>
          <div
            ref={listRef}
            className="px-3 py-4 sm:p-4 space-y-4 pb-32 sm:pb-28 overflow-y-auto max-h-[calc(100vh-220px)] scrollbar-hide"
          >
            {[...messages]
              .sort((a, b) =>
                sortType === 'popular'
                  ? b.heartCount - a.heartCount
                  : a.createdAt.getTime() - b.createdAt.getTime()
              )
              .map((msg) => (
                <motion.div
                  key={msg.id}
                  className="post-card p-4 sm:p-5"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25 }}
                >
                  <div className="flex items-start gap-3 mb-3">
                    <DotCharacter characterId={msg.authorCharacter} size={40} className="flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-white">{msg.authorNickname}</div>
                      <div className="text-xs text-gray-400">{formatTimeAgo(msg.createdAt)}</div>
                    </div>
                  </div>
                  {(msg.content?.trim() ?? '') !== '' && (
                    <div className="mb-3 text-white/95 text-sm sm:text-base leading-relaxed whitespace-pre-wrap break-words">
                      {msg.content}
                    </div>
                  )}
                  {msg.imageUrl && (
                    <div className="mb-3 overflow-x-auto scrollbar-hide">
                      <div className="flex gap-3" style={{ width: 'max-content' }}>
                        <a
                          href={msg.imageUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block rounded-xl overflow-hidden border border-white/10 focus:outline-none focus:ring-2 focus:ring-neon-orange/50"
                        >
                          <img
                            src={msg.imageUrl}
                            alt=""
                            className="w-56 h-40 object-cover flex-shrink-0"
                          />
                        </a>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center justify-between pt-2 border-t border-white/10 flex-wrap gap-y-2">
                    <motion.button
                      type="button"
                      onClick={() => handleMessageHeart(msg.id)}
                      className={`flex items-center gap-2 ${heartedIds.has(msg.id) ? 'text-[#FF6B00]' : 'text-gray-500 hover:text-gray-400'}`}
                      whileTap={{ scale: 0.9 }}
                    >
                      <motion.span
                        className={`text-xl ${heartedIds.has(msg.id) ? 'drop-shadow-[0_0_6px_rgba(255,107,0,0.6)]' : ''}`}
                        animate={heartAnimations.has(msg.id) ? { scale: [1, 1.3, 1] } : {}}
                        transition={{ duration: 0.3 }}
                      >
                        {heartedIds.has(msg.id) ? '❤️' : '🤍'}
                      </motion.span>
                      <span className="font-bold">{msg.heartCount}</span>
                    </motion.button>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span>클릭하여 하트 보내기</span>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setExpandedComments((prev) => { const n = new Set(prev); if (n.has(msg.id)) n.delete(msg.id); else n.add(msg.id); return n }); }}
                        className="flex items-center gap-1 text-gray-400 hover:text-neon-orange transition-colors"
                      >
                        <span>💬</span>
                        <span>댓글 {(commentsByTargetId[msg.id]?.length ?? 0)}개</span>
                      </button>
                    </div>
                  </div>
                  {expandedComments.has(msg.id) && (
                    <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
                      {(commentsByTargetId[msg.id] ?? []).map((c) => (
                        <div key={c.id} className="flex items-start gap-2">
                          <DotCharacter characterId={c.authorCharacter} size={24} className="flex-shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <span className="text-xs font-medium text-gray-300">{c.authorNickname}</span>
                            <p className="text-sm text-white/90 break-words">{c.content}</p>
                            <span className="text-[10px] text-gray-500">{formatTimeAgo(c.createdAt)}</span>
                          </div>
                        </div>
                      ))}
                      <div className="flex gap-2 pt-1">
                        <input
                          type="text"
                          value={commentInputByTarget[msg.id] ?? ''}
                          onChange={(e) => setCommentInputByTarget((prev) => ({ ...prev, [msg.id]: e.target.value }))}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              const text = (commentInputByTarget[msg.id] ?? '').trim()
                              if (!text) return
                              const newComment: Comment = {
                                id: `c-${Date.now()}-${msg.id}`,
                                postId: msg.id,
                                authorNickname,
                                authorCharacter: userCharacter,
                                content: text,
                                createdAt: new Date(),
                              }
                              setCommentsByTargetId((prev) => ({ ...prev, [msg.id]: [...(prev[msg.id] ?? []), newComment] }))
                              setCommentInputByTarget((prev) => ({ ...prev, [msg.id]: '' }))
                            }
                          }}
                          placeholder=""
                          className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-black/30 border border-neon-orange/30 focus:border-neon-orange focus:outline-none text-white placeholder-gray-500 text-sm"
                        />
                        <motion.button
                          type="button"
                          onClick={() => {
                            const text = (commentInputByTarget[msg.id] ?? '').trim()
                            if (!text) return
                            const newComment: Comment = {
                              id: `c-${Date.now()}-${msg.id}`,
                              postId: msg.id,
                              authorNickname,
                              authorCharacter: userCharacter,
                              content: text,
                              createdAt: new Date(),
                            }
                            setCommentsByTargetId((prev) => ({ ...prev, [msg.id]: [...(prev[msg.id] ?? []), newComment] }))
                            setCommentInputByTarget((prev) => ({ ...prev, [msg.id]: '' }))
                          }}
                          className="px-3 py-2 rounded-lg bg-neon-orange/80 text-white text-sm font-medium"
                        >
                          입력
                        </motion.button>
                      </div>
                    </div>
                  )}
                </motion.div>
              ))}
            {messages.length === 0 && (
              <div className="text-center py-14 px-4">
                <p className="text-white/90 text-base sm:text-lg font-medium mb-1">
                  첫 번째 글을 남겨보세요!
                </p>
                <p className="text-neon-orange/90 text-sm">✨</p>
              </div>
            )}
            <div ref={feedEndRef} />
          </div>

          {/* 하단 간단 댓글 입력 */}
          <div className="fixed bottom-0 left-0 right-0 glass-strong border-t border-neon-orange/20 safe-bottom px-3 py-2.5 sm:px-4 sm:py-3">
            <div className="app-shell mx-auto flex gap-2 items-center">
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
                className="flex-shrink-0 w-10 h-10 rounded-xl glass border border-neon-orange/30 flex items-center justify-center text-neon-orange hover:bg-neon-orange/10 disabled:opacity-50"
                title="사진 추가"
              >
                {uploadingImage ? <span className="text-sm animate-pulse">⏳</span> : <span>📷</span>}
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
                placeholder=""
                className="flex-1 min-w-0 px-3 py-2.5 rounded-xl glass border border-neon-orange/30 focus:border-neon-orange focus:outline-none text-white placeholder-gray-400 text-sm"
                maxLength={500}
              />
              <motion.button
                type="button"
                onClick={handleSendMessage}
                disabled={!chatInput.trim() || sending}
                className="flex-shrink-0 w-10 h-10 rounded-xl bg-neon-orange/80 text-white flex items-center justify-center disabled:opacity-50"
              >
                {sending ? <span className="text-sm animate-pulse">⏳</span> : <span>➤</span>}
              </motion.button>
            </div>
          </div>
        </>
      )}

      {/* Feed - 포스트 리스트 (Supabase 미사용 시 목업, image_c91edc 스타일) */}
      {!useSupabase && (
      <div className="px-3 py-4 sm:p-4 space-y-4 pb-28 sm:pb-24">
        <AnimatePresence>
          {sortedPosts.map((post) => (
            <motion.div
              key={post.id}
              className="post-card p-4 sm:p-5 relative"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              onClick={(e) => handleDoubleTap(post.id, e)}
              {...handleLongPress(post.id)}
              whileTap={{ scale: 0.98 }}
            >
              <div className="flex items-start gap-3 mb-3">
                <DotCharacter characterId={post.authorCharacter} size={40} className="flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-white">{post.authorNickname}</div>
                  <div className="text-xs text-gray-400">{formatTimeAgo(post.createdAt)}</div>
                </div>
              </div>

              <div className="mb-3 text-white/95 text-sm sm:text-base leading-relaxed whitespace-pre-wrap break-words">
                {post.content}
              </div>

              {post.images && post.images.length > 0 && (
                <div className="mb-3 overflow-x-auto scrollbar-hide">
                  <div className="flex gap-3" style={{ width: 'max-content' }}>
                    {post.images.slice(0, 5).map((img, idx) => (
                      <motion.img
                        key={idx}
                        src={img}
                        alt={`Image ${idx + 1}`}
                        className="w-56 h-40 object-cover rounded-xl flex-shrink-0 cursor-pointer border border-white/10"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
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

              <div className="flex items-center justify-between pt-2 border-t border-white/10 relative flex-wrap gap-y-2">
                <motion.button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleHeart(post.id)
                  }}
                  className={`flex items-center gap-2 relative z-10 ${postHeartedIds.has(post.id) ? 'text-[#FF6B00]' : 'text-gray-500 hover:text-gray-400'}`}
                  whileHover={{ scale: 1.08 }}
                  whileTap={{ scale: 0.92 }}
                >
                  <motion.span
                    className={`text-xl ${postHeartedIds.has(post.id) ? 'drop-shadow-[0_0_6px_rgba(255,107,0,0.6)]' : ''}`}
                    animate={heartAnimations.has(post.id) ? { scale: [1, 1.4, 1] } : {}}
                    transition={{ duration: 0.4 }}
                  >
                    {postHeartedIds.has(post.id) ? '❤️' : '🤍'}
                  </motion.span>
                  <span className="font-bold">{post.heartCount}</span>
                </motion.button>
                <AnimatePresence>
                  {heartAnimations.has(post.id) && (
                    <motion.div
                      className="absolute left-0 top-0 pointer-events-none"
                      initial={{ opacity: 0, scale: 0 }}
                      animate={{ opacity: [0, 1, 0], scale: [0, 1.5, 2], y: -24 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.5 }}
                    >
                      <span className="text-3xl">❤️</span>
                    </motion.div>
                  )}
                </AnimatePresence>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span>클릭하여 하트 보내기</span>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setExpandedComments((prev) => { const n = new Set(prev); if (n.has(post.id)) n.delete(post.id); else n.add(post.id); return n }); }}
                    className="flex items-center gap-1 text-gray-400 hover:text-neon-orange transition-colors"
                  >
                    <span>💬</span>
                    <span>댓글 {(commentsByTargetId[post.id]?.length ?? 0)}개</span>
                  </button>
                </div>
              </div>
              {expandedComments.has(post.id) && (
                <div className="mt-3 pt-3 border-t border-white/10 space-y-2" onClick={(e) => e.stopPropagation()}>
                  {(commentsByTargetId[post.id] ?? []).map((c) => (
                    <div key={c.id} className="flex items-start gap-2">
                      <DotCharacter characterId={c.authorCharacter} size={24} className="flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-medium text-gray-300">{c.authorNickname}</span>
                        <p className="text-sm text-white/90 break-words">{c.content}</p>
                        <span className="text-[10px] text-gray-500">{formatTimeAgo(c.createdAt)}</span>
                      </div>
                    </div>
                  ))}
                  <div className="flex gap-2 pt-1">
                    <input
                      type="text"
                      value={commentInputByTarget[post.id] ?? ''}
                      onChange={(e) => setCommentInputByTarget((prev) => ({ ...prev, [post.id]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          const text = (commentInputByTarget[post.id] ?? '').trim()
                          if (!text) return
                          const newComment: Comment = {
                            id: `c-${Date.now()}-${post.id}`,
                            postId: post.id,
                            authorNickname,
                            authorCharacter: userCharacter,
                            content: text,
                            createdAt: new Date(),
                          }
                          setCommentsByTargetId((prev) => ({ ...prev, [post.id]: [...(prev[post.id] ?? []), newComment] }))
                          setCommentInputByTarget((prev) => ({ ...prev, [post.id]: '' }))
                        }
                      }}
                      placeholder=""
                      className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-black/30 border border-neon-orange/30 focus:border-neon-orange focus:outline-none text-white placeholder-gray-500 text-sm"
                    />
                    <motion.button
                      type="button"
                      onClick={() => {
                        const text = (commentInputByTarget[post.id] ?? '').trim()
                        if (!text) return
                        const newComment: Comment = {
                          id: `c-${Date.now()}-${post.id}`,
                          postId: post.id,
                          authorNickname,
                          authorCharacter: userCharacter,
                          content: text,
                          createdAt: new Date(),
                        }
                        setCommentsByTargetId((prev) => ({ ...prev, [post.id]: [...(prev[post.id] ?? []), newComment] }))
                        setCommentInputByTarget((prev) => ({ ...prev, [post.id]: '' }))
                      }}
                      className="px-3 py-2 rounded-lg bg-neon-orange/80 text-white text-sm font-medium"
                    >
                      입력
                    </motion.button>
                  </div>
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        {sortedPosts.length === 0 && (
          <div className="text-center py-14 px-4">
            <p className="text-white/90 text-base sm:text-lg font-medium mb-1">
              첫 번째 글을 남겨보세요!
            </p>
            <p className="text-neon-orange/90 text-sm">✨</p>
          </div>
        )}
      </div>
      )}

      {/* FAB 글쓰기 버튼 (오렌지 원형 + 글로우) */}
      <motion.button
        type="button"
        onClick={() => setShowWriteModal(true)}
        className="fab-write fixed right-4 sm:right-6 bottom-20 sm:bottom-24 safe-bottom flex items-center justify-center z-40"
        style={{ marginBottom: 'env(safe-area-inset-bottom, 0)' }}
        aria-label="글쓰기"
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.95 }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 5v14M5 12h14" />
        </svg>
      </motion.button>

      {/* 글쓰기 모달 */}
      <AnimatePresence>
        {showWriteModal && (
          <motion.div
            className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleCloseWriteModal}
          >
            <motion.div
              className="w-full sm:max-w-lg glass-strong rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 max-h-[85vh] overflow-y-auto safe-bottom"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-white">글쓰기</h2>
                <button
                  type="button"
                  onClick={handleCloseWriteModal}
                  className="text-gray-400 hover:text-white p-1"
                  aria-label="닫기"
                >
                  ✕
                </button>
              </div>
              <textarea
                value={writeContent}
                onChange={(e) => setWriteContent(e.target.value)}
                placeholder="내용을 입력하세요..."
                className="w-full px-4 py-3 rounded-xl glass border border-neon-orange/30 focus:border-neon-orange focus:outline-none text-white placeholder-gray-400 text-sm sm:text-base min-h-[120px] resize-y"
                maxLength={2000}
              />
              <input
                ref={writeModalFileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => setWriteImageFile(e.target.files?.[0] ?? null)}
              />
              <div className="flex gap-2 mt-3">
                <motion.button
                  type="button"
                  onClick={() => writeModalFileRef.current?.click()}
                  className="px-4 py-2.5 rounded-xl glass border border-neon-orange/30 text-neon-orange text-sm font-medium hover:bg-neon-orange/10"
                >
                  {writeImageFile ? '📷 사진 변경' : '📷 사진 추가'}
                </motion.button>
                {writeImageFile && (
                  <span className="text-xs text-gray-400 self-center truncate max-w-[140px]">
                    {writeImageFile.name}
                  </span>
                )}
              </div>
              <motion.button
                type="button"
                onClick={handleSubmitWriteModal}
                disabled={(!writeContent.trim() && !writeImageFile) || uploadingImage}
                className="w-full mt-4 py-3.5 rounded-xl font-semibold bg-neon-orange text-white disabled:opacity-50 disabled:cursor-not-allowed"
                whileHover={writeContent.trim() || writeImageFile ? { scale: 1.01 } : {}}
                whileTap={writeContent.trim() || writeImageFile ? { scale: 0.99 } : {}}
              >
                {uploadingImage ? '업로드 중...' : '올리기'}
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
