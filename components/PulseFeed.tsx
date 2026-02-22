'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { LogOut } from 'lucide-react'
import DotCharacter from './DotCharacter'
import { mockBoards, mockPosts, extendBoardLifespan, formatRemainingTimer } from '@/lib/mockData'
import type { Post, Board } from '@/lib/mockData'
import { isSupabaseConfigured, isValidUuid } from '@/lib/supabase/client'
import { useBoardChat } from '@/lib/supabase/useBoardChat'
import { checkNicknameAvailability, getNicknamesInBoard } from '@/lib/supabase/messages'
import { uploadChatImage } from '@/lib/supabase/storage'
import { extendBoardExpiry, EXTEND_MS_PER_HOURGLASS, markBoardExploded } from '@/lib/supabase/boards'
import { recordContribution, getTopContributors, subscribeToContributions, type TopContributor } from '@/lib/supabase/contributions'
import { subscribeBoardPresence, type PresenceUser } from '@/lib/supabase/presence'
import { joinRoom, leaveRoom, getActiveParticipants, getExistingParticipantForUser, subscribeToRoomParticipants, type RoomParticipant } from '@/lib/supabase/roomParticipants'
import { getHourglasses, setHourglasses as persistHourglasses } from '@/lib/hourglass'
import { shareBoard } from '@/lib/shareBoard'
import { addOrUpdateSession, findSession } from '@/lib/activeSessions'
import { getRandomNickname } from '@/lib/randomNicknames'
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
  const router = useRouter()
  /** 방/유저 정보가 아직 준비되지 않았을 때를 대비한 안전한 기본값 (클라이언트 에러 방지) */
  const boardId = typeof rawBoardId === 'string' && rawBoardId.trim() !== '' ? rawBoardId.trim() : ''
  const userNickname = (rawUserNickname ?? '').trim()
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
  /** 남은 시간 1시간(3600초) 미만일 때 true → 진행 바 빨간색 + 점멸, 타이머 텍스트 강조 */
  const [isEmergency, setIsEmergency] = useState(false)
  const [isExpired, setIsExpired] = useState(false)
  const [topContributors, setTopContributors] = useState<TopContributor[]>([])
  const [showWriteModal, setShowWriteModal] = useState(false)
  /** 카메라 버튼으로 모달을 연 경우, 모달이 뜨자마자 파일 선택창을 띄우기 위한 플래그 */
  const [openPhotoPickerWhenModalOpens, setOpenPhotoPickerWhenModalOpens] = useState(false)
  const [writeContent, setWriteContent] = useState('')
  const [writeImageFile, setWriteImageFile] = useState<File | null>(null)
  /** 모달 내 이미지 미리보기용 object URL (revoke 책임) */
  const [writePreviewUrl, setWritePreviewUrl] = useState<string | null>(null)
  /** 방 입장 시 닉네임 설정 모달: 클라이언트 마운트 후에만 표시 (Hydration 방지) */
  const ROOM_NICKNAME_KEY_PREFIX = 'tdb-room-nickname-'
  const ROOM_CHARACTER_KEY_PREFIX = 'tdb-room-character-'
  const [nicknameModalMounted, setNicknameModalMounted] = useState(false)
  const [showNicknameModal, setShowNicknameModal] = useState(false)
  const [effectiveNickname, setEffectiveNickname] = useState('')
  const [nicknameInput, setNicknameInput] = useState('')
  /** 모달에서 선택 중인 아이콘(캐릭터) 인덱스 0~9. 제출 시 effectiveCharacter로 반영 */
  const [selectedCharacterInModal, setSelectedCharacterInModal] = useState(0)
  /** 방별로 저장한 캐릭터. 채팅/참여자 표시에 사용 */
  const [effectiveCharacter, setEffectiveCharacter] = useState(userCharacter)
  /** 닉네임 제출 시 중복 검사 로딩 */
  const [nicknameSubmitLoading, setNicknameSubmitLoading] = useState(false)
  /** 닉네임 제출 시 중복 경고 메시지 */
  const [nicknameError, setNicknameError] = useState<string | null>(null)
  /** 실시간 닉네임 사용 가능 여부: idle | checking | available | taken */
  const [nicknameCheckStatus, setNicknameCheckStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle')
  /** 현재 방에서 활동 중인 닉네임 목록 (모달용) */
  const [roomNicknames, setRoomNicknames] = useState<string[]>([])
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editingContent, setEditingContent] = useState('')
  const [deleteConfirmMessageId, setDeleteConfirmMessageId] = useState<string | null>(null)
  /** 실시간 접속자 (Supabase Presence). DB 참여자와 병합해 참여자 목록 표시 */
  const [onlineUsers, setOnlineUsers] = useState<PresenceUser[]>([])
  /** Presence 기준 실시간 접속자 수 (presenceState 키 개수). 0이면 DB 참여자 수 사용 */
  const [presenceCount, setPresenceCount] = useState(0)
  /** DB 기준 참여자 (is_active = true). 리스트·인원수·왕관 필터에 사용 */
  const [activeParticipants, setActiveParticipants] = useState<RoomParticipant[]>([])
  const [showPresencePopover, setShowPresencePopover] = useState(false)
  const presencePopoverRef = useRef<HTMLDivElement>(null)
  const [leaving, setLeaving] = useState(false)
  const feedEndRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const writeModalFileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setHourglassesState(getHourglasses())
  }, [])

  /** Supabase Presence: 방 접속자 실시간 동기화. track에 nickname·user_id 포함, sync에서 presenceState 키 개수 반영 */
  useEffect(() => {
    if (!useSupabaseWithUuid || !boardId) return
    const displayName = (effectiveNickname || '').trim() || userNickname
    const unsub = subscribeBoardPresence(boardId, displayName, (users, keyCount) => {
      setOnlineUsers(users)
      setPresenceCount(keyCount)
    }, userId ?? null)
    return unsub
  }, [useSupabaseWithUuid, boardId, effectiveNickname, userNickname, userId])

  /** 참여자 리스트: DB room_participants (is_active = true) 조회 + Realtime 구독. join/leave 시 즉시 반영 */
  useEffect(() => {
    if (!useSupabaseWithUuid || !boardId) return
    const refetch = () => getActiveParticipants(boardId).then(setActiveParticipants)
    refetch()
    const unsub = subscribeToRoomParticipants(boardId, () => refetch())
    return () => unsub()
  }, [useSupabaseWithUuid, boardId])

  /** 닉네임 모달: ESC 키로 닫기 */
  useEffect(() => {
    if (!showNicknameModal) return
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setShowNicknameModal(false)
      }
    }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [showNicknameModal])

  /** 접속자 팝오버: 외부 클릭 시 닫기 */
  useEffect(() => {
    if (!showPresencePopover) return
    const handleClickOutside = (e: MouseEvent) => {
      if (presencePopoverRef.current && !presencePopoverRef.current.contains(e.target as Node)) {
        setShowPresencePopover(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showPresencePopover])

  /** 클라이언트 마운트 완료 후에만 닉네임 모달 로직 실행 (Vercel/SSR Hydration 방지) */
  useEffect(() => {
    setNicknameModalMounted(true)
  }, [])

  /** 글쓰기 모달이 카메라로 열렸을 때, 모달이 뜬 뒤 파일 선택창 자동 오픈 */
  useEffect(() => {
    if (!showWriteModal || !openPhotoPickerWhenModalOpens) return
    const t = setTimeout(() => {
      writeModalFileRef.current?.click()
      setOpenPhotoPickerWhenModalOpens(false)
    }, 300)
    return () => clearTimeout(t)
  }, [showWriteModal, openPhotoPickerWhenModalOpens])

  /** 모달 내 선택 사진에 대한 미리보기 URL 생성/해제 */
  useEffect(() => {
    if (!writeImageFile) {
      setWritePreviewUrl(prev => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
      return
    }
    const url = URL.createObjectURL(writeImageFile)
    setWritePreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [writeImageFile])

  /** 닉네임 모달이 열릴 때 해당 방 참여자 명단 조회 및 에러/상태 초기화 */
  useEffect(() => {
    if (showNicknameModal && useSupabaseWithUuid && boardId) {
      setNicknameError(null)
      setNicknameCheckStatus('idle')
      getNicknamesInBoard(boardId).then(setRoomNicknames)
    } else if (!showNicknameModal) {
      setRoomNicknames([])
    }
  }, [showNicknameModal, useSupabaseWithUuid, boardId])

  /** 실시간 닉네임 사용 가능 여부 (디바운스) */
  const nicknameCheckTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    const name = nicknameInput.trim()
    if (!name || !useSupabaseWithUuid || !boardId || !showNicknameModal) {
      setNicknameCheckStatus('idle')
      return
    }
    if (nicknameCheckTimeoutRef.current) clearTimeout(nicknameCheckTimeoutRef.current)
    nicknameCheckTimeoutRef.current = setTimeout(() => {
      nicknameCheckTimeoutRef.current = null
      setNicknameCheckStatus('checking')
      checkNicknameAvailability(boardId, name, userId ?? null)
        .then((r) => setNicknameCheckStatus(r.available ? 'available' : 'taken'))
        .catch(() => setNicknameCheckStatus('idle'))
    }, 450)
    return () => {
      if (nicknameCheckTimeoutRef.current) clearTimeout(nicknameCheckTimeoutRef.current)
    }
  }, [nicknameInput, useSupabaseWithUuid, boardId, showNicknameModal, userId])

  /** 방 입장 시: 1) DB에서 현재 유저(ID) 기존 참여 여부 확인 → 있으면 그 닉네임으로 즉시 입장 2) 없으면 session/워프존 저장값 사용 3) 없으면 "이 방에서 사용할 닉네임을 정해주세요!" 모달 필수 */
  useEffect(() => {
    if (!nicknameModalMounted || typeof window === 'undefined') return
    if (!boardId) {
      setEffectiveNickname(userNickname)
      setShowNicknameModal(false)
      return
    }
    let cancelled = false
    const key = `${ROOM_NICKNAME_KEY_PREFIX}${boardId}`
    const charKey = `${ROOM_CHARACTER_KEY_PREFIX}${boardId}`
    const applySaved = (saved: string) => {
      if (cancelled) return
      setNicknameInput(saved)
      setEffectiveNickname(saved)
      setShowNicknameModal(false)
    }
    if (userId && useSupabaseWithUuid) {
      getExistingParticipantForUser(boardId, userId).then((existing) => {
        if (cancelled) return
        if (existing?.user_display_name) {
          try {
            window.sessionStorage.setItem(key, existing.user_display_name)
          } catch {}
          setNicknameInput(existing.user_display_name)
          setEffectiveNickname(existing.user_display_name)
          setShowNicknameModal(false)
          const savedChar = window.sessionStorage.getItem(charKey)
          const charNum = savedChar !== null ? parseInt(savedChar, 10) : NaN
          if (!Number.isNaN(charNum) && charNum >= 0 && charNum <= 9) setEffectiveCharacter(charNum)
          return
        }
        const fromWarp = findSession(boardId, roomIdFromUrl ?? undefined)
        if (fromWarp?.nickname) {
          window.sessionStorage.setItem(key, fromWarp.nickname)
          applySaved(fromWarp.nickname)
          return
        }
        const saved = (window.sessionStorage.getItem(key) ?? '').trim()
        if (saved) {
          setNicknameInput(saved)
          setEffectiveNickname(saved)
          setShowNicknameModal(false)
        } else {
          setNicknameInput('')
          setEffectiveNickname('')
          setShowNicknameModal(true)
        }
      })
    } else {
      try {
        let saved = (window.sessionStorage.getItem(key) ?? '').trim()
        const savedChar = window.sessionStorage.getItem(charKey)
        const charNum = savedChar !== null ? parseInt(savedChar, 10) : NaN
        if (!Number.isNaN(charNum) && charNum >= 0 && charNum <= 9) setEffectiveCharacter(charNum)
        const fromWarp = findSession(boardId, roomIdFromUrl ?? undefined)
        if (fromWarp?.nickname) {
          saved = fromWarp.nickname
          window.sessionStorage.setItem(key, saved)
        }
        if (saved) {
          setNicknameInput(saved)
          setEffectiveNickname(saved)
          setShowNicknameModal(false)
        } else {
          setNicknameInput('')
          setEffectiveNickname('')
          setShowNicknameModal(true)
        }
      } catch {
        setEffectiveNickname('')
        setShowNicknameModal(true)
      }
    }
    return () => { cancelled = true }
  }, [nicknameModalMounted, boardId, userNickname, roomIdFromUrl, userId, useSupabaseWithUuid])

  /** 모달이 열릴 때: 저장된 아이콘 선택 반영, 닉네임 비어 있으면 랜덤으로 한 번 채움 */
  useEffect(() => {
    if (!showNicknameModal || !boardId) return
    if (typeof window === 'undefined') return
    const charKey = `${ROOM_CHARACTER_KEY_PREFIX}${boardId}`
    const savedChar = window.sessionStorage.getItem(charKey)
    const charNum = savedChar !== null ? parseInt(savedChar, 10) : NaN
    setSelectedCharacterInModal(Number.isNaN(charNum) || charNum < 0 || charNum > 9 ? 0 : charNum)
  }, [showNicknameModal, boardId])
  useEffect(() => {
    if (!showNicknameModal || nicknameInput.trim() !== '') return
    setNicknameInput(getRandomNickname())
  }, [showNicknameModal, nicknameInput])

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

  /** 글/댓글 작성자 이름: 모달/세션/DB에서 확정된 닉네임만 사용 (기본값 없음) */
  const authorNickname = (effectiveNickname || '').trim() || userNickname

  /** 방 입장: 닉네임 확정 후에만 room_participants 등록. 팝업에서 입력한 닉네임이 그대로 user_display_name으로 저장됨. */
  const prevJoinNameRef = useRef<string | null>(null)
  useEffect(() => {
    if (!useSupabaseWithUuid || !boardId) return
    if (showNicknameModal && !(effectiveNickname || '').trim()) return
    const name = (authorNickname || '').trim()
    if (!name) return
    let cancelled = false
    joinRoom(boardId, name, userId ?? undefined).then((ok) => {
      if (cancelled || !ok) return
      prevJoinNameRef.current = name
      getActiveParticipants(boardId).then((list) => {
        if (!cancelled) setActiveParticipants(list)
      })
    })
    return () => {
      cancelled = true
      const leaveName = prevJoinNameRef.current
      if (leaveName) leaveRoom(boardId, leaveName, userId ?? undefined)
      prevJoinNameRef.current = null
    }
  }, [useSupabaseWithUuid, boardId, authorNickname, userNickname, showNicknameModal, effectiveNickname, userId])

  const nicknameConfirmed = !showNicknameModal || !!(effectiveNickname || '').trim()
  const { messages, send, toggleHeart, deleteMessage, updateMessage, sending } = useBoardChat(boardId, {
    userCharacter: effectiveCharacter,
    userNickname: authorNickname,
    enabled: useSupabaseWithUuid && !!boardId && nicknameConfirmed,
    userId: userId ?? undefined,
  })

  const handleSendMessage = useCallback(async () => {
    if ((!chatInput.trim()) || sending || uploadingImage || !useSupabaseWithUuid) return
    const sent = await send(chatInput)
    if (sent && 'error' in sent) {
      alert(sent.error)
      return
    }
    if (sent) {
      setChatInput('')
      // 새 글이 등록되면 목록 최상단으로 부드럽게 스크롤
      setTimeout(() => {
        listRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
      }, 100)
    }
  }, [chatInput, sending, uploadingImage, useSupabaseWithUuid, send])

  const handleCloseWriteModal = useCallback(() => {
    setShowWriteModal(false)
    setOpenPhotoPickerWhenModalOpens(false)
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
      if (sent && 'error' in sent) {
        alert(sent.error)
        return
      }
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
      authorCharacter: effectiveCharacter,
      authorNickname,
      content: text,
      images: writeImageFile ? [URL.createObjectURL(writeImageFile)] : undefined,
      heartCount: 0,
      createdAt: new Date(),
    }
    setPosts((prev) => [newPost, ...prev])
    handleCloseWriteModal()
  }, [writeContent, writeImageFile, useSupabaseWithUuid, boardId, send, effectiveCharacter, authorNickname, handleCloseWriteModal])

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

  const handleLeaveRoom = useCallback(async () => {
    if (!useSupabaseWithUuid || !boardId || leaving) return
    const name = (effectiveNickname || '').trim() || userNickname
    if (!name && !userId) return
    if (typeof window !== 'undefined' && !window.confirm('방을 나가시겠어요?')) return
    setLeaving(true)
    const { ok } = await leaveRoom(boardId, name || '', userId ?? undefined)
    setLeaving(false)
    if (ok) router.push('/')
  }, [useSupabaseWithUuid, boardId, effectiveNickname, userNickname, userId, leaving, router])

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
          const roomNick = window.sessionStorage.getItem(`${ROOM_NICKNAME_KEY_PREFIX}${boardId}`) ?? ''
          if (roomNick.trim()) displayName = roomNick.trim()
        } catch {}
      }
      const name = (displayName || '').trim() || '이름 없음'
      await recordContribution(boardId, name, minutesPerHourglass, userId ?? undefined)
      getTopContributors(boardId).then(setTopContributors)
    } finally {
      setExtendingHourglass(false)
    }
  }, [extendingHourglass, useSupabaseWithUuid, boardId, userId])

  // 메시지 리스트 자동 스크롤: 새 메시지 추가 시·처음 방 진입 시 맨 아래로 부드럽게 스크롤
  useEffect(() => {
    if (!useSupabaseWithUuid) return
    const scrollToBottom = () => {
      feedEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
    const t = setTimeout(scrollToBottom, 50)
    return () => clearTimeout(t)
  }, [useSupabaseWithUuid, messages.length, boardId])

  // 24시간 기준 진행률: T_rem / T_max * 100 (최대 100%). 1초마다 갱신.
  const T_MAX_MS = 24 * 60 * 60 * 1000

  useEffect(() => {
    const fallbackExpires = initialExpiresAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    const fallbackCreated = initialCreatedAt ?? new Date()
    const targetBoard = board ?? (useSupabase ? { createdAt: fallbackCreated, expiresAt: fallbackExpires } : null)
    const effectiveExpiresAt: Date | undefined = boardExpiresAtOverride ?? targetBoard?.expiresAt
    if (!targetBoard || !effectiveExpiresAt) return

    const expiresAt = effectiveExpiresAt instanceof Date ? effectiveExpiresAt : new Date(effectiveExpiresAt)

    const EMERGENCY_MS = 60 * 60 * 1000 // 1시간

    const tick = (): void => {
      const now = Date.now()
      const remainingMs = Math.max(0, expiresAt.getTime() - now)
      const percentage = Math.min((remainingMs / T_MAX_MS) * 100, 100)
      const { label, isUnderOneMinute: under } = formatRemainingTimer(expiresAt)
      setTimerLabel(label)
      setIsUnderOneMinute(under)
      setIsEmergency(remainingMs > 0 && remainingMs < EMERGENCY_MS)
      setProgress(percentage)
      if (remainingMs <= 0) {
        setIsExpired(true)
      }
    }

    tick()
    setTimerMounted(true)
    const intervalId = setInterval(() => {
      const now = Date.now()
      const remainingMs = Math.max(0, expiresAt.getTime() - now)
      const percentage = Math.min((remainingMs / T_MAX_MS) * 100, 100)
      const { label, isUnderOneMinute } = formatRemainingTimer(expiresAt)
      setTimerLabel(label)
      setIsUnderOneMinute(isUnderOneMinute)
      setIsEmergency(remainingMs > 0 && remainingMs < EMERGENCY_MS)
      setProgress(percentage)
      if (remainingMs <= 0) {
        setIsExpired(true)
        clearInterval(intervalId)
      }
    }, 1000)

    return () => clearInterval(intervalId)
  }, [board, useSupabase, boardExpiresAtOverride, initialExpiresAt, initialCreatedAt])

  // 만료 시 DB에 폭파 기록(is_active=false, exploded_at=now) 후 메인으로
  const explodedMarkedRef = useRef(false)
  useEffect(() => {
    if (!isExpired) return
    if (useSupabaseWithUuid && isValidUuid(boardId) && !explodedMarkedRef.current) {
      explodedMarkedRef.current = true
      markBoardExploded(boardId).catch(() => {})
    }
    const t = setTimeout(() => {
      onBack()
    }, 2500)
    return () => clearTimeout(t)
  }, [isExpired, onBack, useSupabaseWithUuid, boardId])

  // 명예의 전당 TOP 3 조회 + Realtime 구독
  useEffect(() => {
    if (!useSupabaseWithUuid) return
    getTopContributors(boardId).then(setTopContributors)
    const unsubscribe = subscribeToContributions(boardId, () => {
      getTopContributors(boardId).then(setTopContributors)
    })
    return unsubscribe
  }, [useSupabaseWithUuid, boardId])

  /** 표시용 참여자 수: room_participants 테이블의 is_active=true 행 개수가 실제 참여자 수. DB 조회 전에는 Presence 수로 대체 */
  const displayParticipantCount = activeParticipants.length > 0 ? activeParticipants.length : Math.max(presenceCount, 0)

  /** 참여자 리스트 UI용: DB user_display_name 우선, 없을 때만 Presence. 빈 닉네임은 '이름 없음'으로 표시(디버깅용) */
  const displayParticipantList = useMemo(() => {
    const fromDb = activeParticipants
    const fromPresence = presenceCount > 0 ? onlineUsers : []
    const raw = fromDb.length > 0 ? fromDb : fromPresence
    const seen = new Set<string>()
    return raw.filter((p) => {
      const name = ('nickname' in p ? p.nickname : p.user_display_name) ?? ''
      const key = (name || '').trim().toLowerCase() || '__empty'
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [presenceCount, onlineUsers, activeParticipants])

  /** 닉네임 → 왕관(1~3위) 매핑. 방에 남아있는 참여자(is_active) 중에서만 적용 */
  const crownByDisplayName = useMemo(() => {
    const activeSet = new Set(activeParticipants.map((p) => (p.user_display_name ?? '').trim()).filter(Boolean))
    const map = new Map<string, { rank: 1 | 2 | 3; color: string }>()
    const colors: Record<number, string> = { 1: '#FFD700', 2: '#C0C0C0', 3: '#CD7F32' }
    for (const c of topContributors) {
      const name = (c.user_display_name ?? '').trim()
      if (name && activeSet.has(name) && c.rank >= 1 && c.rank <= 3) map.set(name, { rank: c.rank as 1 | 2 | 3, color: colors[c.rank] ?? '#FFD700' })
    }
    return map
  }, [topContributors, activeParticipants])

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
  const headerTitle = String(displayTitle).replace(/^#\s*/, '').trim() || '방'

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

  const handleNicknameSubmit = useCallback(async () => {
    const name = nicknameInput.trim()
    if (!name) return
    setNicknameError(null)

    if (useSupabaseWithUuid) {
      setNicknameSubmitLoading(true)
      const { available } = await checkNicknameAvailability(boardId, name, userId ?? null)
      if (!available) {
        setNicknameError('이미 이 방에서 사용 중인 닉네임입니다.')
        setNicknameSubmitLoading(false)
        return
      }
      setNicknameSubmitLoading(false)
    }

    if (typeof window !== 'undefined') {
      try {
        window.sessionStorage.setItem(`${ROOM_NICKNAME_KEY_PREFIX}${boardId}`, name)
        window.sessionStorage.setItem(`${ROOM_CHARACTER_KEY_PREFIX}${boardId}`, String(selectedCharacterInModal))
      } catch {}
      addOrUpdateSession({
        boardId,
        boardName: (initialBoardName ?? '').trim() || `#${boardId}`,
        nickname: name,
        keyword: (roomIdFromUrl ?? boardId).toString().trim(),
        expiresAt: initialExpiresAt != null ? new Date(initialExpiresAt).getTime() : undefined,
      })
    }
    setEffectiveCharacter(selectedCharacterInModal)
    setEffectiveNickname(name)
    setShowNicknameModal(false)
  }, [nicknameInput, boardId, initialBoardName, roomIdFromUrl, initialExpiresAt, useSupabaseWithUuid, userId, selectedCharacterInModal])

  return (
    <div className="min-h-screen bg-midnight-black text-white safe-bottom pt-6">
      <AnimatePresence>
        {nicknameModalMounted && showNicknameModal && (
          <motion.div
            role="presentation"
            className="fixed inset-0 z-[90] flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ background: 'rgba(0,0,0,0.92)' }}
            onClick={() => setShowNicknameModal(false)}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="nickname-modal-title"
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
              onClick={(e) => e.stopPropagation()}
            >
              <h2 id="nickname-modal-title" className="text-lg sm:text-xl font-black text-center mb-1 text-white" style={{ textShadow: '0 0 12px rgba(255,255,255,0.15)' }}>
                이 방에서 사용할 닉네임을 정해주세요!
              </h2>
              <p className="text-center text-gray-400 text-sm mb-3">
                이 방에서 당신의 부캐(이름)를 정해주세요
              </p>
              {/* 아이콘(캐릭터) 선택 그리드 — 10개, 선택 시 주황 테두리 */}
              <p className="text-xs text-gray-500 mb-1.5">아이콘 선택</p>
              <div className="grid grid-cols-5 gap-2 mb-4">
                {Array.from({ length: 10 }, (_, i) => (
                  <motion.button
                    key={i}
                    type="button"
                    onClick={() => setSelectedCharacterInModal(i)}
                    className={`rounded-xl p-2 flex items-center justify-center transition-colors ${
                      selectedCharacterInModal === i
                        ? 'border-2 border-[#FF6B00] bg-[#FF6B00]/15 ring-2 ring-[#FF6B00]/40'
                        : 'border-2 border-transparent bg-black/40 hover:bg-white/5'
                    }`}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.98 }}
                    aria-pressed={selectedCharacterInModal === i}
                    aria-label={`아이콘 ${i + 1} 선택`}
                  >
                    <DotCharacter characterId={i} size={36} className="flex-shrink-0" />
                  </motion.button>
                ))}
              </div>
              {useSupabaseWithUuid && roomNicknames.length > 0 && (
                <p className="text-center text-gray-500 text-xs mb-2 truncate px-1" title={roomNicknames.join(', ')}>
                  현재 활동 중인 부캐들: {roomNicknames.slice(0, 8).join(', ')}{roomNicknames.length > 8 ? '…' : ''}
                </p>
              )}
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={nicknameInput}
                  onChange={(e) => { setNicknameInput(e.target.value); setNicknameError(null) }}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setShowNicknameModal(false)
                    else if (e.key === 'Enter' && !nicknameSubmitLoading && nicknameInput.trim()) handleNicknameSubmit()
                  }}
                  placeholder="닉네임 입력"
                  maxLength={20}
                  className="flex-1 min-w-0 px-4 py-3 rounded-xl bg-black/60 border-2 border-[#FF6B00]/50 focus:border-[#FF6B00] focus:outline-none focus:ring-2 focus:ring-[#FF6B00]/40 text-white placeholder-gray-500 text-sm sm:text-base"
                  style={{ boxShadow: '0 0 12px rgba(255,107,0,0.15)' }}
                />
                <motion.button
                  type="button"
                  onClick={() => { setNicknameInput(getRandomNickname()); setNicknameError(null) }}
                  className="flex-shrink-0 p-3 rounded-xl border-2 border-[#FF6B00]/50 bg-black/60 text-[#FF6B00] hover:bg-[#FF6B00]/20 transition-colors"
                  title="랜덤 닉네임"
                  aria-label="랜덤 닉네임 뽑기"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <span className="text-xl leading-none" aria-hidden>🎲</span>
                </motion.button>
              </div>
              {useSupabaseWithUuid && nicknameInput.trim() && (
                <p className="text-xs mb-3 min-h-[1rem]">
                  {nicknameCheckStatus === 'checking' && <span className="text-gray-500">확인 중...</span>}
                  {nicknameCheckStatus === 'available' && <span className="text-emerald-400">사용 가능한 닉네임입니다</span>}
                  {nicknameCheckStatus === 'taken' && <span className="text-amber-400">이미 사용 중입니다</span>}
                </p>
              )}
              {nicknameError && (
                <p className="text-sm text-red-400 mb-3" role="alert">
                  {nicknameError}
                </p>
              )}
              <div className="flex gap-3 mt-1">
                <motion.button
                  type="button"
                  onClick={() => setShowNicknameModal(false)}
                  className="flex-1 py-3 rounded-xl font-semibold text-sm sm:text-base text-gray-400 border-2 border-gray-500 bg-transparent hover:bg-white/5 hover:border-gray-400 hover:text-gray-300 transition-colors"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  취소
                </motion.button>
                <motion.button
                  type="button"
                  onClick={() => handleNicknameSubmit()}
                  disabled={!nicknameInput.trim() || nicknameSubmitLoading}
                  className="flex-1 py-3 rounded-xl font-bold text-sm sm:text-base text-white disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    background: nicknameInput.trim() && !nicknameSubmitLoading ? '#FF6B00' : '#555',
                    boxShadow: nicknameInput.trim() && !nicknameSubmitLoading ? '0 0 14px rgba(255,107,0,0.4), 0 0 24px rgba(255,107,0,0.2)' : 'none',
                  }}
                  whileHover={nicknameInput.trim() && !nicknameSubmitLoading ? { scale: 1.02 } : {}}
                  whileTap={nicknameInput.trim() && !nicknameSubmitLoading ? { scale: 0.98 } : {}}
                >
                  {nicknameSubmitLoading ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" aria-hidden />
                      확인 중...
                    </span>
                  ) : (
                    '입장하기'
                  )}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
        {deleteConfirmMessageId && (
          <motion.div
            className="fixed inset-0 z-[95] flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ background: 'rgba(0,0,0,0.88)' }}
            onClick={() => setDeleteConfirmMessageId(null)}
          >
            <motion.div
              className="w-full max-w-sm rounded-2xl p-6"
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              style={{
                background: '#0a0a0a',
                border: '2px solid rgba(255,107,0,0.5)',
                boxShadow: '0 0 24px rgba(255,107,0,0.2)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-center text-white font-medium mb-6">정말 삭제하시겠습니까?</p>
              <div className="flex gap-3">
                <motion.button
                  type="button"
                  onClick={() => setDeleteConfirmMessageId(null)}
                  className="flex-1 py-2.5 rounded-xl border-2 border-gray-500 text-gray-300 hover:border-gray-400 transition-colors text-sm font-medium"
                >
                  취소
                </motion.button>
                <motion.button
                  type="button"
                  onClick={async () => {
                    if (deleteConfirmMessageId) {
                      await deleteMessage(deleteConfirmMessageId)
                      setDeleteConfirmMessageId(null)
                    }
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-neon-orange text-white text-sm font-medium hover:opacity-90 transition-opacity"
                >
                  삭제
                </motion.button>
              </div>
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
              className="text-xl sm:text-2xl font-black text-red-500 text-center mb-2"
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
      <div className="sticky top-0 z-10 glass-strong border-b border-neon-orange/20 safe-top pt-4 sm:pt-5 pb-3 md:pb-2">
        <div className="px-2 py-2 sm:px-4 sm:py-3">
          <div className="flex flex-wrap items-center justify-between gap-y-2 gap-x-2 mb-4">
            {/* 왼쪽 그룹: 뒤로 + 방 제목 + No. 배지 */}
            <div className="flex items-center gap-1.5 sm:gap-3 min-w-0 flex-1">
              <button
                onClick={onBack}
                className="text-gray-400 hover:text-white text-xs sm:text-base flex-shrink-0"
              >
                ← 뒤로
              </button>
              <h1 className="text-sm sm:text-xl font-black truncate min-w-0 text-white">
                {headerTitle}
              </h1>
              <button
                type="button"
                onClick={handleCopyRoomLink}
                className="inline-flex items-center shrink-0 text-[10px] sm:text-sm font-bold select-none transition-all hover:brightness-110 rounded px-1.5 py-0.5 sm:px-2 sm:py-0.5 cursor-pointer border-0"
                style={{
                  background: '#FF6B00',
                  color: '#fff',
                  boxShadow: roomNoReady ? '0 0 10px rgba(255,107,0,0.5), 0 0 18px rgba(255,107,0,0.25)' : '0 0 8px rgba(255,107,0,0.35)',
                }}
                title="방 링크 복사"
                aria-label={roomNoReady ? `방 번호 No. ${roomNo} - 클릭 시 방 링크 복사` : '방 링크 복사'}
              >
                {roomNoReady ? (
                  <span className="tabular-nums whitespace-nowrap">No.{roomNo}</span>
                ) : (
                  <motion.span
                    className="tabular-nums opacity-80 whitespace-nowrap"
                    animate={{ opacity: [0.6, 1, 0.6] }}
                    transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
                  >
                    No.…
                  </motion.span>
                )}
              </button>
            </div>
            {/* 오른쪽 그룹: 공유 + 참여자 + 모래시계 + 닉네임 + 나가기 */}
            <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
              <motion.button
                type="button"
                onClick={handleShare}
                className="flex-shrink-0 p-1.5 sm:p-2 rounded-lg sm:rounded-xl glass border border-neon-orange/30 text-neon-orange hover:bg-neon-orange/10 transition-colors"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                title="공유하기"
                aria-label="공유하기"
              >
                <svg className="w-4 h-4 sm:w-5 sm:h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <circle cx="18" cy="5" r="3" />
                  <circle cx="6" cy="12" r="3" />
                  <circle cx="18" cy="19" r="3" />
                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                  <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                </svg>
              </motion.button>
              {/* 참여자 리스트 (DB is_active=true) + Realtime */}
              <div className="relative flex-shrink-0" ref={presencePopoverRef}>
                <motion.button
                  type="button"
                  onClick={() => setShowPresencePopover((v) => !v)}
                  className="flex items-center gap-1 px-1.5 py-1 rounded-lg glass border border-neon-orange/30 text-neon-orange hover:bg-neon-orange/10 transition-colors min-w-0"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  title="참여 중인 사람"
                  aria-label={`참여 중 ${displayParticipantCount}명. 클릭하면 목록을 볼 수 있습니다.`}
                >
                  <span className="text-sm sm:text-base leading-none" aria-hidden>👥</span>
                  <span className="font-bold tabular-nums text-white text-xs sm:text-sm">{displayParticipantCount}</span>
                </motion.button>
                <AnimatePresence>
                  {showPresencePopover && (
                    <motion.div
                      className="absolute right-0 top-full mt-1.5 z-50 min-w-[180px] max-w-[220px] p-4 rounded-xl border border-gray-700 bg-gradient-to-br from-gray-800 to-gray-900 shadow-2xl"
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.15 }}
                    >
                      <p className="text-lg font-bold text-white pb-3 mb-2 border-b border-gray-600/80">
                        참여 중 ({displayParticipantCount}명)
                      </p>
                      <ul className="max-h-40 overflow-y-auto space-y-1">
                        {displayParticipantCount === 0 ? (
                          <li className="text-sm text-gray-500 py-2 px-3 rounded-lg">아무도 없음</li>
                        ) : (
                          displayParticipantList.map((p, i) => {
                            const raw = ('nickname' in p ? (p as PresenceUser).nickname : (p as RoomParticipant).user_display_name) ?? ''
                            const displayName = (raw || '').trim() || '이름 없음'
                            const crown = crownByDisplayName.get(displayName)
                            return (
                              <li
                                key={`${displayName}-${i}`}
                                className="flex items-center gap-2.5 py-2 px-3 rounded-lg text-gray-200 font-sans text-sm transition-colors hover:bg-white/10"
                              >
                                <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-gray-600/80 overflow-hidden">
                                  <DotCharacter characterId={i % 10} size={20} className="flex-shrink-0" />
                                </span>
                                <span className="truncate flex-1 min-w-0">{displayName}</span>
                                {crown && (
                                  <span
                                    style={{ color: crown.color }}
                                    className="flex-shrink-0 text-sm leading-none"
                                    aria-label={`${crown.rank}위`}
                                    title={`기여도 ${crown.rank}위`}
                                  >
                                    👑
                                  </span>
                                )}
                              </li>
                            )
                          })
                        )}
                      </ul>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <div
                className="flex items-center gap-1 text-amber-400 flex-shrink-0 min-w-0"
                role="status"
                aria-label={`보유 모래시계 ${hourglasses}개`}
              >
                <span className="text-sm sm:text-base leading-none flex-shrink-0" aria-hidden>⏳</span>
                <span className="font-medium text-amber-400/90 text-xs sm:text-sm" aria-hidden>×</span>
                <span className="font-bold tabular-nums text-white text-xs sm:text-sm">{hourglasses}</span>
              </div>
              <button
                type="button"
                onClick={() => setShowNicknameModal(true)}
                className="flex-shrink-0 min-w-0 max-w-[72px] sm:max-w-[140px] flex items-center gap-0.5 sm:gap-1 text-xs sm:text-sm text-neon-orange hover:brightness-110 truncate"
                title="닉네임 변경"
                aria-label={`활동명: ${authorNickname}. 클릭하면 닉네임을 변경할 수 있습니다.`}
              >
                <span className="flex-shrink-0" aria-hidden>👤</span>
                <span className="truncate">{authorNickname || '이름 없음'}</span>
              </button>
              {useSupabaseWithUuid && (
                <motion.button
                  type="button"
                  onClick={handleLeaveRoom}
                  disabled={leaving}
                  className="flex items-center gap-1 px-1.5 py-1 sm:px-2 sm:py-1.5 rounded-lg border border-red-500/40 text-red-500 hover:bg-red-500/10 transition-colors flex-shrink-0 disabled:opacity-50"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  title="방 나가기"
                  aria-label="방 나가기"
                >
                  <LogOut className="w-4 h-4 sm:w-4 sm:h-4 flex-shrink-0" aria-hidden />
                  <span className="hidden sm:inline text-xs font-medium">나가기</span>
                </motion.button>
              )}
            </div>
          </div>
          
          {/* Progress Bar (24h 기준, 1시간 미만 시 긴급: 빨간색 + 점멸) */}
          <div className="relative h-1 bg-gray-800 rounded-full overflow-hidden">
            <div
              className={`absolute top-0 left-0 h-full transition-[width] duration-1000 ease-linear ${isEmergency ? 'bg-red-600 animate-emergency-blink' : 'bg-neon-orange neon-glow'}`}
              style={{ width: `${progress}%` }}
            />
          </div>
          
          <div className="text-neon-orange mt-2 text-center relative flex flex-col sm:flex-row items-center justify-center gap-2 min-w-0 overflow-hidden">
            <motion.span
              className={`inline-flex items-baseline gap-1 shrink min-w-0 whitespace-nowrap ${isEmergency || isUnderOneMinute ? 'text-red-500 font-bold' : ''}`}
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
            <div className="mt-4 pt-4 border-t border-white/10">
              <p className="text-center text-sm font-semibold text-white/90 mb-3 tracking-wide">
                명예의 전당
              </p>
              <ul className="space-y-3">
                {topContributors.map((c) => {
                  const medal = c.rank === 1 ? '🥇' : c.rank === 2 ? '🥈' : '🥉'
                  const nameColor =
                    c.rank === 1
                      ? 'text-amber-200'
                      : c.rank === 2
                        ? 'text-gray-300'
                        : 'text-amber-600/90'
                  return (
                    <li
                      key={`${c.rank}-${c.user_display_name}`}
                      className="flex items-center justify-center gap-3"
                    >
                      <span className="flex-shrink-0 text-lg leading-none" aria-hidden>
                        {medal}
                      </span>
                      <span
                        className={`font-medium text-base truncate max-w-[140px] ${nameColor}`}
                        title={c.user_display_name ?? ''}
                      >
                        {c.user_display_name ?? '—'}
                      </span>
                    </li>
                  )
                })}
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
            className="px-2 py-1 sm:px-3 sm:py-2 space-y-1 pb-32 sm:pb-28 overflow-y-auto max-h-[calc(100vh-220px)] scrollbar-hide"
          >
            {[...messages]
              .sort((a, b) =>
                sortType === 'popular'
                  ? b.heartCount - a.heartCount
                  : a.createdAt.getTime() - b.createdAt.getTime()
              )
              .map((msg) => {
                const isOwnMessage = userId != null && msg.userId != null && userId === msg.userId
                return (
                <motion.div
                  key={msg.id}
                  className="flex flex-col"
                  initial={{ opacity: 0, y: 2 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  <div className={`flex items-end gap-1 ${isOwnMessage ? 'flex-row-reverse' : ''}`}>
                  <DotCharacter characterId={msg.authorCharacter} size={24} className="flex-shrink-0" />
                  <div className={`flex flex-col max-w-[85%] ${isOwnMessage ? 'items-end' : 'items-start'}`}>
                    {/* 말풍선 - 컴팩트 */}
                    <div
                      className={`inline-block rounded-2xl px-2.5 py-1 ${
                        isOwnMessage
                          ? 'bg-neon-orange/25 border border-neon-orange/40 text-white'
                          : 'bg-white/10 border border-white/10 text-white/95'
                      }`}
                    >
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="text-[11px] font-semibold text-white/90 flex items-center gap-0.5">
                          {msg.authorNickname}
                          {crownByDisplayName.get((msg.authorNickname ?? '').trim()) && (
                            <span
                              style={{ color: crownByDisplayName.get((msg.authorNickname ?? '').trim())!.color }}
                              className="flex-shrink-0"
                              aria-label={`기여도 ${crownByDisplayName.get((msg.authorNickname ?? '').trim())!.rank}위`}
                            >
                              👑
                            </span>
                          )}
                        </span>
                        <span className="text-[9px] text-gray-400">{formatTimeAgo(msg.createdAt)}</span>
                      </div>
                      {editingMessageId === msg.id ? (
                        <div className="mt-1">
                          <textarea
                            value={editingContent}
                            onChange={(e) => setEditingContent(e.target.value)}
                            className="w-full min-h-[60px] px-2 py-1.5 rounded-xl bg-black/40 border border-neon-orange/40 focus:border-neon-orange focus:outline-none text-white text-sm"
                            placeholder="내용"
                            autoFocus
                          />
                          <div className="flex gap-1.5 mt-1.5">
                            <motion.button type="button" onClick={() => setEditingMessageId(null)} className="px-2 py-1 rounded-lg text-xs text-gray-400 border border-gray-500 hover:border-gray-400">
                              취소
                            </motion.button>
                            <motion.button
                              type="button"
                              onClick={async () => {
                                const trimmed = editingContent.trim()
                                if (trimmed !== (msg.content ?? '').trim()) await updateMessage(msg.id, trimmed)
                                setEditingMessageId(null)
                              }}
                              className="px-2 py-1 rounded-lg text-xs font-medium bg-neon-orange text-white hover:opacity-90"
                            >
                              저장
                            </motion.button>
                          </div>
                        </div>
                      ) : (
                        <>
                          {(msg.content?.trim() ?? '') !== '' && (
                            <p className="text-xs leading-tight whitespace-pre-wrap break-words mt-0.5">{msg.content}</p>
                          )}
                          {msg.imageUrl && (
                            <a href={msg.imageUrl} target="_blank" rel="noopener noreferrer" className="block mt-0.5 rounded-lg overflow-hidden border border-white/10 focus:ring-2 focus:ring-neon-orange/50">
                              <img src={msg.imageUrl} alt="" className="max-h-[200px] max-w-full object-contain" />
                            </a>
                          )}
                        </>
                      )}
                    </div>
                    {/* 액션: 수정/삭제(본인), 하트/댓글 */}
                    <div className={`flex items-center gap-1 mt-0.5 ${isOwnMessage ? 'flex-row-reverse' : ''}`}>
                      {isOwnMessage && (
                        <>
                          <motion.button type="button" onClick={(e) => { e.stopPropagation(); setEditingMessageId(msg.id); setEditingContent(msg.content ?? '') }} className="p-1 rounded text-neon-orange hover:bg-neon-orange/10 text-xs" title="수정">✏️</motion.button>
                          <motion.button type="button" onClick={(e) => { e.stopPropagation(); setDeleteConfirmMessageId(msg.id) }} className="p-1 rounded text-gray-400 hover:text-red-400 hover:bg-red-500/10 text-xs" title="삭제">🗑️</motion.button>
                        </>
                      )}
                      <motion.button type="button" onClick={() => handleMessageHeart(msg.id)} className={`flex items-center gap-0.5 ${heartedIds.has(msg.id) ? 'text-neon-orange' : 'text-gray-500 hover:text-gray-400'}`} whileTap={{ scale: 0.9 }}>
                        <motion.span className="text-sm" animate={heartAnimations.has(msg.id) ? { scale: [1, 1.2, 1] } : {}} transition={{ duration: 0.25 }}>
                          {heartedIds.has(msg.id) ? '❤️' : '🤍'}
                        </motion.span>
                        <span className="text-xs font-bold">{msg.heartCount}</span>
                      </motion.button>
                      <button type="button" onClick={(e) => { e.stopPropagation(); setExpandedComments((prev) => { const n = new Set(prev); if (n.has(msg.id)) n.delete(msg.id); else n.add(msg.id); return n }); }} className="flex items-center gap-0.5 text-[10px] text-gray-500 hover:text-neon-orange">
                        💬 {(commentsByTargetId[msg.id]?.length ?? 0)}
                      </button>
                    </div>
                  </div>
                  </div>
                  {expandedComments.has(msg.id) && (
                    <div className="w-full mt-1 ml-8 sm:ml-9 mr-0 space-y-1 py-1 border-t border-white/5">
                      {(commentsByTargetId[msg.id] ?? []).map((c) => (
                        <div key={c.id} className="flex items-start gap-1.5">
                          <DotCharacter characterId={c.authorCharacter} size={20} className="flex-shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <span className="text-[10px] font-medium text-gray-400 inline-flex items-center gap-0.5">
                              {c.authorNickname}
                              {crownByDisplayName.get((c.authorNickname ?? '').trim()) && (
                                <span style={{ color: crownByDisplayName.get((c.authorNickname ?? '').trim())!.color }} className="flex-shrink-0">👑</span>
                              )}
                            </span>
                            <p className="text-xs text-white/90 break-words leading-tight">{c.content}</p>
                            <span className="text-[9px] text-gray-500">{formatTimeAgo(c.createdAt)}</span>
                          </div>
                        </div>
                      ))}
                      <div className="flex gap-1.5 pt-0.5">
                        <input
                          type="text"
                          value={commentInputByTarget[msg.id] ?? ''}
                          onChange={(e) => setCommentInputByTarget((prev) => ({ ...prev, [msg.id]: e.target.value }))}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              const text = (commentInputByTarget[msg.id] ?? '').trim()
                              if (!text) return
                              const newComment: Comment = { id: `c-${Date.now()}-${msg.id}`, postId: msg.id, authorNickname, authorCharacter: effectiveCharacter, content: text, createdAt: new Date() }
                              setCommentsByTargetId((prev) => ({ ...prev, [msg.id]: [...(prev[msg.id] ?? []), newComment] }))
                              setCommentInputByTarget((prev) => ({ ...prev, [msg.id]: '' }))
                            }
                          }}
                          placeholder="댓글 입력"
                          className="flex-1 min-w-0 px-2 py-1.5 rounded-lg bg-black/30 border border-neon-orange/30 focus:border-neon-orange focus:outline-none text-white placeholder-gray-500 text-xs"
                        />
                        <motion.button
                          type="button"
                          onClick={() => {
                            const text = (commentInputByTarget[msg.id] ?? '').trim()
                            if (!text) return
                            const newComment: Comment = { id: `c-${Date.now()}-${msg.id}`, postId: msg.id, authorNickname, authorCharacter: effectiveCharacter, content: text, createdAt: new Date() }
                            setCommentsByTargetId((prev) => ({ ...prev, [msg.id]: [...(prev[msg.id] ?? []), newComment] }))
                            setCommentInputByTarget((prev) => ({ ...prev, [msg.id]: '' }))
                          }}
                          className="px-2 py-1.5 rounded-lg bg-neon-orange/80 text-white text-xs font-medium"
                        >
                          입력
                        </motion.button>
                      </div>
                    </div>
                  )}
                </motion.div>
              ); })}
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
              <motion.button
                type="button"
                onClick={() => {
                  setOpenPhotoPickerWhenModalOpens(true)
                  setShowWriteModal(true)
                }}
                disabled={sending || uploadingImage}
                className="flex-shrink-0 w-10 h-10 rounded-xl glass border border-neon-orange/30 flex items-center justify-center text-neon-orange hover:bg-neon-orange/10 disabled:opacity-50"
                title="사진·글쓰기"
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
              className="post-card p-4 sm:p-5 relative flex flex-col gap-y-3"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              onClick={(e) => handleDoubleTap(post.id, e)}
              {...handleLongPress(post.id)}
              whileTap={{ scale: 0.98 }}
            >
              <div className="flex items-start gap-3">
                <DotCharacter characterId={post.authorCharacter} size={40} className="flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-white flex items-center gap-1">
                    {post.authorNickname}
                    {crownByDisplayName.get((post.authorNickname ?? '').trim()) && (
                      <span
                        style={{ color: crownByDisplayName.get((post.authorNickname ?? '').trim())!.color }}
                        className="flex-shrink-0"
                        aria-label={`기여도 ${crownByDisplayName.get((post.authorNickname ?? '').trim())!.rank}위`}
                      >
                        👑
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400">{formatTimeAgo(post.createdAt)}</div>
                </div>
              </div>

              <div className="text-white/95 text-sm sm:text-base leading-relaxed whitespace-pre-wrap break-words">
                {post.content}
              </div>

              {post.images && post.images.length > 0 && (
                <div className="space-y-3">
                  {post.images.slice(0, 5).map((img, idx) => (
                    <motion.div
                      key={idx}
                      className="rounded-xl overflow-hidden border border-white/10 bg-black/20"
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <img
                        src={img}
                        alt={`Image ${idx + 1}`}
                        className="max-h-[500px] w-full object-contain"
                      />
                    </motion.div>
                  ))}
                </div>
              )}

              {/* Links - 썸네일 카드 스타일 */}
              {post.links && post.links.length > 0 && (
                <div className="space-y-2">
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
                        <span className="text-xs font-medium text-gray-300 inline-flex items-center gap-1">
                          {c.authorNickname}
                          {crownByDisplayName.get((c.authorNickname ?? '').trim()) && (
                            <span style={{ color: crownByDisplayName.get((c.authorNickname ?? '').trim())!.color }} className="flex-shrink-0">👑</span>
                          )}
                        </span>
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
                            authorCharacter: effectiveCharacter,
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
                          authorCharacter: effectiveCharacter,
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
                <h2 className="text-lg font-black text-white">글쓰기</h2>
                <button
                  type="button"
                  onClick={handleCloseWriteModal}
                  className="text-gray-400 hover:text-white p-1"
                  aria-label="닫기"
                >
                  ✕
                </button>
              </div>
              {writePreviewUrl && (
                <div className="relative mb-3 rounded-xl overflow-hidden bg-black/30 border border-neon-orange/30 inline-block">
                  <img
                    src={writePreviewUrl}
                    alt="미리보기"
                    className="max-h-48 w-auto object-contain"
                  />
                  <button
                    type="button"
                    onClick={() => setWriteImageFile(null)}
                    className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-neon-orange text-sm"
                    aria-label="사진 취소"
                  >
                    ✕
                  </button>
                </div>
              )}
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
                  className={`px-4 py-2.5 rounded-xl glass border text-sm font-medium hover:bg-neon-orange/10 ${writeImageFile ? 'border-neon-orange bg-neon-orange/20 text-neon-orange' : 'border-neon-orange/30 text-neon-orange'}`}
                >
                  {writeImageFile ? '📷 사진 변경' : '📷 사진 추가'}
                </motion.button>
              </div>
              <motion.button
                type="button"
                onClick={handleSubmitWriteModal}
                disabled={(!writeContent.trim() && !writeImageFile) || uploadingImage}
                className="w-full mt-4 py-3.5 rounded-xl font-semibold bg-neon-orange text-white disabled:opacity-50 disabled:cursor-not-allowed"
                whileHover={writeContent.trim() || writeImageFile ? { scale: 1.01 } : {}}
                whileTap={writeContent.trim() || writeImageFile ? { scale: 0.99 } : {}}
              >
                {uploadingImage ? '업로드 중...' : '작성하기'}
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
