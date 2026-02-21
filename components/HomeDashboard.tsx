'use client'

import { useState, useEffect, useCallback, useRef, memo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRight, Eye, EyeOff } from 'lucide-react'
import DotCharacter from './DotCharacter'
import { mockBoards, getTrendKeywords, filterActiveBoards, formatRemainingTimer } from '@/lib/mockData'
import { getHourglasses } from '@/lib/hourglass'
import { isSupabaseConfigured } from '@/lib/supabase/client'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/supabase/auth'
import { getFloatingTags, type FloatingTag } from '@/lib/supabase/trendingKeywords'
import { searchBoards, type BoardRow } from '@/lib/supabase/boards'
import { getActiveParticipants } from '@/lib/supabase/roomParticipants'
import { useTick } from '@/lib/TickContext'
import { getActiveSessions, removeExpiredSessions, removeSessionByBoardId, type ActiveSession } from '@/lib/activeSessions'
import type { Board } from '@/lib/mockData'

/** 남은 시간 라벨. 하이드레이션 방지: 마운트된 후에만 시간 표시(서버/클라이언트 동일 초기값) */
const BoardTimeLabel = memo(function BoardTimeLabel({ expiresAt }: { expiresAt: Date }) {
  const [mounted, setMounted] = useState(false)
  useTick() /* 1초마다 리렌더로 타이머 갱신 */
  useEffect(() => setMounted(true), [])
  const date = expiresAt instanceof Date ? expiresAt : new Date(expiresAt)
  const label = mounted ? formatRemainingTimer(date).label : ''
  return (
    <span className="font-mono tabular-nums text-neon-orange" aria-hidden={!mounted}>
      {label || '\u00A0'}
    </span>
  )
})

interface HomeDashboardProps {
  onEnterBoard: (boardId: string) => void
}

/** 이메일 마스킹: 앞 5자 + *** + @ 이후 (예: hesed***@gmail.com) */
function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return email
  const [local, domain] = email.split('@')
  if (local.length <= 5) return `${local}***@${domain}`
  return `${local.slice(0, 5)}***@${domain}`
}

function HomeDashboardInner({ onEnterBoard }: HomeDashboardProps) {
  const router = useRouter()
  const { user, signOut } = useAuth()
  const useSupabase = isSupabaseConfigured()
  const [searchQuery, setSearchQuery] = useState('')
  const [floatingTags, setFloatingTags] = useState<FloatingTag[]>(() =>
    getTrendKeywords().map((word) => ({ word, source: 'board' as const }))
  )
  const [featuredKeywords, setFeaturedKeywords] = useState<Set<string>>(new Set(['맛집', '데이트', '카페']))
  const [userBoards] = useState<Board[]>(filterActiveBoards(mockBoards.slice(0, 2)))
  const [liveBoards] = useState<Board[]>(filterActiveBoards(mockBoards))
  const [warpingBoardId, setWarpingBoardId] = useState<string | null>(null)
  const [warpingKeyword, setWarpingKeyword] = useState<string | null>(null)
  const [activeSessions, setActiveSessions] = useState<ActiveSession[]>([])
  const [hourglasses, setHourglasses] = useState(0)
  const [creatingRoom, setCreatingRoom] = useState(false)
  /** 실시간 검색 결과 (debounce 적용) */
  const [searchResults, setSearchResults] = useState<BoardRow[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchFetched, setSearchFetched] = useState(false)
  /** 검색 결과 드롭다운 포커스 인덱스 (키보드 방향키용) */
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  /** 방별 참여 인원수 (boardId -> count) */
  const [participantCounts, setParticipantCounts] = useState<Record<string, number>>({})
  const searchInputRef = useRef<HTMLInputElement>(null)
  const searchDropdownRef = useRef<HTMLDivElement>(null)
  /** 방 만들기 모달: 열림 여부 + 모달 내 제목 입력값 + 25자 초과 시 셰이크 트리거 */
  const [showCreateRoomModal, setShowCreateRoomModal] = useState(false)
  const [createRoomTitle, setCreateRoomTitle] = useState('')
  const [createRoomPassword, setCreateRoomPassword] = useState('')
  const [showCreateRoomPassword, setShowCreateRoomPassword] = useState(false)
  const [inputShakeTrigger, setInputShakeTrigger] = useState(0)
  const createRoomInputRef = useRef<HTMLInputElement>(null)

  const MAX_ROOM_TITLE_LENGTH = 25

  /** 드롭다운 외부 클릭 시 하이라이트만 초기화 (입력값은 유지) */
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const el = searchDropdownRef.current ?? searchInputRef.current
      if (el && !el.contains(e.target as Node) && !searchInputRef.current?.contains(e.target as Node)) {
        setHighlightedIndex(-1)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    setHourglasses(getHourglasses())
  }, [])

  useEffect(() => {
    removeExpiredSessions()
    setActiveSessions(getActiveSessions())
  }, [])

  /** 만료된 방 자동 제거: 1초마다 갱신 */
  useEffect(() => {
    const id = setInterval(() => {
      removeExpiredSessions()
      setActiveSessions(getActiveSessions())
    }, 1000)
    return () => clearInterval(id)
  }, [])

  // 초기 플로팅 태그: boards + trending_keywords 혼합 (Supabase 사용 시)
  useEffect(() => {
    if (!useSupabase) return
    getFloatingTags().then((tags) => {
      if (tags.length > 0) setFloatingTags(tags)
    })
  }, [useSupabase])

  /** is_active false인 방은 exploded_at이 24시간 이내일 때만 검색 결과에 노출 */
  const isBoardVisibleInSearch = useCallback((row: BoardRow): boolean => {
    if (row.is_active !== false) return true
    if (!row.exploded_at) return false
    const explodedMs = new Date(row.exploded_at).getTime()
    return Date.now() - explodedMs < 24 * 60 * 60 * 1000
  }, [])

  /** 실시간 검색: debounce 300ms 후 searchBoards 호출 (ID + 제목 통합), 24시간 초과 폭파 방 제외 */
  useEffect(() => {
    if (!useSupabase) return
    const q = searchQuery.trim()
    if (!q) {
      setSearchResults([])
      setSearchFetched(false)
      setHighlightedIndex(-1)
      return
    }
    const t = setTimeout(() => {
      setSearchLoading(true)
      setSearchFetched(false)
      searchBoards(q).then((boards) => {
        const filtered = boards.filter(isBoardVisibleInSearch)
        setSearchResults(filtered)
        setSearchFetched(true)
        setSearchLoading(false)
        setHighlightedIndex(filtered.length > 0 ? 0 : -1)
      })
    }, 300)
    return () => clearTimeout(t)
  }, [searchQuery, useSupabase, isBoardVisibleInSearch])

  /** 검색 결과의 각 방 참여 인원수 병렬 조회 */
  useEffect(() => {
    if (!useSupabase || searchResults.length === 0) return
    let cancelled = false
    Promise.all(
      searchResults.map((b) =>
        getActiveParticipants(b.id).then((r) => (cancelled ? 0 : r.length))
      )
    ).then((counts) => {
      if (cancelled) return
      const next: Record<string, number> = {}
      searchResults.forEach((b, i) => {
        next[b.id] = counts[i] ?? 0
      })
      setParticipantCounts((prev) => ({ ...prev, ...next }))
    })
    return () => {
      cancelled = true
    }
  }, [useSupabase, searchResults])

  // Supabase Realtime: 새 방 생성 시 태그 하나를 새 키워드로 교체
  useEffect(() => {
    if (!useSupabase) return
    const supabase = createClient()
    if (!supabase) return
    const channel = supabase
      .channel('home-boards-insert')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'boards' },
        (payload) => {
          const row = payload.new as { keyword?: string; name?: string }
          const raw = (row?.keyword ?? row?.name ?? '').toString().trim().replace(/^#/, '')
          if (!raw) return
          setFloatingTags((prev) => {
            if (prev.length === 0) return [{ word: raw, source: 'board' }]
            const next = [...prev]
            const idx = Math.floor(Math.random() * next.length)
            next[idx] = { word: raw, source: 'board' }
            return next
          })
        }
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [useSupabase])

  const getBoardKeyword = (board: Board) => board.trendKeywords?.[0] ?? board.name ?? board.id

  /** 외부(메인 리스트): #board-4 등 ID 제거, 깔끔한 제목만 노출 */
  const displayBoardName = (name: string) => {
    const n = (name ?? '').trim()
    if (/^#?board-\d+$/i.test(n)) return '새 방'
    return n.replace(/^#\s*/, '').trim() || '방'
  }

  /** 하이드레이션 방지: 마운트된 후에만 랜덤 위치 적용 (서버/클라이언트 첫 렌더는 동일한 fallback 사용) */
  const [mounted, setMounted] = useState(false)
  const [tagPositions, setTagPositions] = useState<{ left: number; top: number }[]>([])

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted || floatingTags.length === 0) return
    const seed = floatingTags.map((t) => t.word).join('|').length
    const rnd = (s: number) => ((Math.sin(s) * 10000) % 1 + 1) % 1
    const MIN_GAP = 7
    const positions: { left: number; top: number }[] = []
    for (let i = 0; i < floatingTags.length; i++) {
      let left: number
      let top: number
      let attempts = 0
      do {
        left = rnd(seed + i * 2 + attempts * 100) * 90
        top = rnd(seed + i * 2 + 1 + attempts * 100) * 80
        attempts++
      } while (
        attempts < 25 &&
        positions.some((p) => Math.hypot(p.left - left, p.top - top) < MIN_GAP)
      )
      positions.push({ left, top })
    }
    setTagPositions(positions)
  }, [mounted, floatingTags])

  const handleWarp = (board: Board) => {
    setWarpingBoardId(board.id)
    setTimeout(() => {
      if (useSupabase) {
        router.push(`/board/${encodeURIComponent(getBoardKeyword(board))}`)
      } else {
        onEnterBoard(board.id)
      }
      setWarpingBoardId(null)
    }, 600)
  }

  /** 유행어/방 태그 클릭 → 해당 검색어로 방 만들기(입장) 페이지로 이동 */
  const handleKeywordClick = (keyword: string) => {
    setWarpingKeyword(keyword)
    setTimeout(() => {
      router.push(`/board/${encodeURIComponent(keyword)}`)
      setWarpingKeyword(null)
    }, 500)
  }

  /** 검색 결과에서 방 선택 → 폭파된 방이면 입장 막고 안내, 아니면 입장 */
  const handleSelectSearchResult = useCallback(
    (board: BoardRow) => {
      if (board.is_active === false) {
        if (typeof window !== 'undefined') window.alert('이미 종료된 팝핀입니다!')
        return
      }
      const path = board.public_id != null
        ? `/board/${board.public_id}`
        : `/board/${encodeURIComponent(board.keyword)}`
      setSearchQuery('')
      setSearchResults([])
      setSearchFetched(false)
      setHighlightedIndex(-1)
      router.push(path)
    },
    [router]
  )

  /** 방 만들기: 방 제목(keyword) + 비밀번호(선택)를 API로 전달 → boards에 저장 후 생성된 ID(public_id)로 즉시 이동. 모달에서 호출 시 제목·비밀번호를 인자로 넘김. */
  const handleCreateOrEnterRoom = useCallback(async (titleOverride?: string, passwordOverride?: string) => {
    const keyword = (titleOverride !== undefined ? String(titleOverride).trim() : searchQuery.trim())
    if (!keyword) return
    if (creatingRoom) return
    const isNumericOnly = /^[0-9]+$/.test(keyword)
    if (!useSupabase) {
      router.push(`/board/${encodeURIComponent(keyword)}`)
      return
    }
    setCreatingRoom(true)
    try {
      if (isNumericOnly) {
        const res = await fetch(`/api/board/${encodeURIComponent(keyword)}`)
        if (res.ok) {
          router.push(`/board/${keyword}`)
          return
        }
        setCreatingRoom(false)
        return
      }
      // Supabase 연결 여부(클라이언트): 키 값 노출 없이 로그
      if (typeof window !== 'undefined') {
        const urlSet = Boolean(
          process.env.NEXT_PUBLIC_SUPABASE_URL &&
            String(process.env.NEXT_PUBLIC_SUPABASE_URL).trim().length > 0
        )
        console.log('[HomeDashboard] Supabase URL 연결 여부:', urlSet ? '설정됨' : '미설정')
      }

      const password = (passwordOverride !== undefined ? String(passwordOverride).trim() : '').trim() || undefined
      const res = await fetch('/api/board/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyword,
          password,
        }),
      })
      const data = await res.json().catch(() => ({} as Record<string, unknown>))
      if (!res.ok) {
        const errMsg = typeof data?.error === 'string' ? data.error : res.statusText || '알 수 없음'
        console.error('[HomeDashboard] 방 생성 실패:', res.status, data)
        setCreatingRoom(false)
        alert(`저장 실패: ${errMsg}`)
        return
      }
      const board = data as { room_no?: number; public_id?: number; id: string }
      const numId = board.room_no ?? board.public_id
      const path = numId != null ? `/board/${numId}` : `/board/${board.id}`
      router.push(path)
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e)
      console.error('[HomeDashboard] 방 생성 예외:', e)
      setCreatingRoom(false)
      alert(`저장 실패: ${errMsg}`)
    }
  }, [searchQuery, creatingRoom, useSupabase, router])

  /** 방 만들기 모달 열기: 현재 검색어를 기본 제목으로 설정(최대 25자), 비밀번호는 비움 */
  const openCreateRoomModal = useCallback(() => {
    setCreateRoomTitle(searchQuery.slice(0, MAX_ROOM_TITLE_LENGTH))
    setCreateRoomPassword('')
    setShowCreateRoomModal(true)
  }, [searchQuery])

  /** 모달이 열릴 때 입력창 포커스 */
  useEffect(() => {
    if (showCreateRoomModal) {
      const t = setTimeout(() => createRoomInputRef.current?.focus(), 80)
      return () => clearTimeout(t)
    }
  }, [showCreateRoomModal])

  /** 모달에서 방 만들기 실행: 제목 유효성 검사(공백/25자 초과) 후 handleCreateOrEnterRoom에 제목·비밀번호 전달 */
  const submitCreateRoomModal = useCallback(() => {
    const title = createRoomTitle.trim()
    if (!title || title.length > MAX_ROOM_TITLE_LENGTH) return
    setShowCreateRoomModal(false)
    handleCreateOrEnterRoom(title, createRoomPassword.trim() || undefined)
  }, [createRoomTitle, createRoomPassword, handleCreateOrEnterRoom])

  const isCreateRoomTitleValid = createRoomTitle.trim().length > 0 && createRoomTitle.length <= MAX_ROOM_TITLE_LENGTH

  /** 검색창 키보드: 방향키로 하이라이트, Enter로 선택 또는 방 만들기 */
  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const showDropdown = searchQuery.trim() && (searchLoading || searchFetched)
      if (!showDropdown) {
        if (e.key === 'Enter') openCreateRoomModal()
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        if (searchResults.length > 0) {
          setHighlightedIndex((prev) => {
            if (prev === -2) return -2
            if (prev + 1 <= searchResults.length - 1) return prev + 1
            return -2
          })
        } else if (searchFetched) {
          setHighlightedIndex(-2)
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        if (highlightedIndex === -2) setHighlightedIndex(searchResults.length > 0 ? searchResults.length - 1 : -1)
        else setHighlightedIndex((prev) => Math.max(-1, prev - 1))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (highlightedIndex >= 0 && highlightedIndex < searchResults.length) {
          handleSelectSearchResult(searchResults[highlightedIndex])
        } else if (highlightedIndex === -2 || (searchFetched && searchResults.length === 0)) {
          openCreateRoomModal()
        } else if (searchResults.length > 0 && highlightedIndex === 0) {
          handleSelectSearchResult(searchResults[0])
        } else {
          openCreateRoomModal()
        }
      } else if (e.key === 'Escape') {
        setHighlightedIndex(-1)
        searchInputRef.current?.blur()
      }
    },
    [
      searchQuery,
      searchLoading,
      searchFetched,
      searchResults,
      highlightedIndex,
      handleSelectSearchResult,
      openCreateRoomModal,
    ]
  )

  /** 워프존 세션 카드 클릭 → 해당 방으로 이동 (저장된 닉네임으로 바로 입장) */
  const handleWarpToSession = useCallback((session: ActiveSession) => {
    setWarpingKeyword(session.keyword)
    setTimeout(() => {
      router.push(`/board/${encodeURIComponent(session.keyword)}`)
      setWarpingKeyword(null)
    }, 400)
  }, [router])

  /** 워프존에서 방 제거 */
  const handleRemoveSession = useCallback((e: React.MouseEvent, session: ActiveSession) => {
    e.stopPropagation()
    removeSessionByBoardId(session.boardId)
    setActiveSessions((prev) => prev.filter((s) => s.boardId !== session.boardId))
  }, [])

  return (
    <div className="min-h-screen bg-midnight-black text-white pb-20 safe-bottom pt-14 md:pt-6 px-6 max-w-7xl mx-auto">
      {/* Header: 좌측 로고(홈 링크), 우측 이메일·로그아웃·모래시계 */}
      <header className="flex justify-between items-center flex-wrap gap-2 mb-6 pt-4 sm:pt-8 safe-top">
        <div className="flex items-center min-w-0 flex-shrink-0">
          <Link
            href="/"
            className="inline-flex items-center p-1 -m-1 rounded-lg hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-neon-orange/50 focus:ring-offset-2 focus:ring-offset-midnight-black"
            aria-label="POPPIN 홈으로 이동"
          >
            <span
              className="text-xl sm:text-3xl font-black tracking-tight"
              style={{
                color: '#FF5F00',
                textShadow: '0 0 10px #FF5F00, 0 0 20px #FF5F00',
              }}
            >
              POPPIN
            </span>
          </Link>
        </div>
        <div className="flex items-center justify-end gap-1.5 sm:gap-3 flex-shrink-0 min-w-0">
          {useSupabase && user?.email && (
            <>
              <span className="hidden sm:inline text-gray-300 text-xs sm:text-sm truncate max-w-[120px] sm:max-w-[160px]" title={user.email}>
                {maskEmail(user.email)}
              </span>
              <motion.button
                type="button"
                onClick={async () => {
                  await signOut()
                  router.replace('/login')
                }}
                className="px-3 py-1.5 sm:px-4 sm:py-2 rounded-full text-xs sm:text-sm font-medium border-2 border-[#FF6B00] text-gray-200 bg-transparent hover:bg-[#FF6B00] hover:text-white transition-colors whitespace-nowrap"
                style={{ boxShadow: 'none' }}
                whileHover={{
                  boxShadow: '0 0 12px rgba(255,107,0,0.5), 0 0 20px rgba(255,107,0,0.25)',
                  transition: { duration: 0.2 },
                }}
                whileTap={{ scale: 0.98 }}
              >
                로그아웃
              </motion.button>
            </>
          )}
          <Link
            href="/store"
            className="flex items-center gap-2 sm:gap-2.5 px-3 py-1.5 sm:py-2 rounded-full bg-white/[0.06] border border-white/10 min-w-0 hover:border-amber-500/30 transition-colors"
            role="status"
            aria-label={`보유 모래시계 ${hourglasses}개, 상점으로 이동`}
          >
            <span className="text-lg sm:text-xl leading-none flex-shrink-0" aria-hidden>⏳</span>
            <span className="font-semibold text-sm sm:text-base tabular-nums text-white">{hourglasses}</span>
          </Link>
        </div>
      </header>

      {/* Discovery Section - 실시간 방 검색 + 드롭다운 */}
      <section className="mb-7 relative overflow-visible">
        <div className="relative z-10 mb-5 flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row gap-3 relative">
            <div className="flex-1 relative">
              <input
                ref={searchInputRef}
                type="text"
                placeholder="방 제목 또는 번호로 검색"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                onFocus={() => searchQuery.trim() && setHighlightedIndex(searchResults.length > 0 ? 0 : searchFetched ? -2 : -1)}
                disabled={creatingRoom}
                className="w-full px-5 py-3.5 sm:px-6 sm:py-4 rounded-2xl glass-strong border-2 border-neon-orange/30 focus:border-neon-orange focus:outline-none text-white placeholder-gray-400 text-sm sm:text-base disabled:opacity-60"
                aria-label="방 제목 또는 방번호로 검색"
                aria-expanded={!!(searchQuery.trim() && (searchLoading || searchFetched))}
                aria-controls="search-results-dropdown"
                aria-activedescendant={
                  highlightedIndex >= 0 && highlightedIndex < searchResults.length
                    ? `search-result-${highlightedIndex}`
                    : highlightedIndex === -2
                      ? 'search-result-create'
                      : undefined
                }
                autoComplete="off"
              />
              {/* 검색 결과 드롭다운: backdrop-blur + 오렌지 하이라이트 */}
              <AnimatePresence>
                {searchQuery.trim() && (searchLoading || searchFetched) && (
                  <motion.div
                    ref={searchDropdownRef}
                    id="search-results-dropdown"
                    role="listbox"
                    className="absolute left-0 right-0 top-full mt-1.5 rounded-xl border border-neon-orange/40 bg-black/90 backdrop-blur-xl shadow-xl overflow-hidden z-50 max-h-[280px] overflow-y-auto"
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.15 }}
                  >
                    {searchLoading && searchResults.length === 0 ? (
                      <div className="px-4 py-6 text-center text-gray-400 text-sm">
                        검색 중...
                      </div>
                    ) : (
                      <>
                        {searchResults.length === 0 ? (
                          <div className="p-4">
                            <p className="text-gray-400 text-sm mb-3">일치하는 방이 없습니다. 새로 만드시겠습니까?</p>
                            <motion.button
                              type="button"
                              role="option"
                              id="search-result-create"
                              aria-selected={highlightedIndex === -2}
                              onClick={openCreateRoomModal}
                              className={`w-full py-3 px-4 rounded-lg text-sm font-semibold transition-colors ${
                                highlightedIndex === -2
                                  ? 'bg-neon-orange/30 border-2 border-neon-orange text-white'
                                  : 'bg-white/5 border-2 border-transparent text-gray-300 hover:bg-white/10'
                              }`}
                            >
                              방 만들기
                            </motion.button>
                          </div>
                        ) : (
                          <ul className="py-1" role="listbox">
                            {searchResults.map((board, i) => {
                              const expiresAt = new Date(board.expires_at)
                              const count = participantCounts[board.id] ?? null
                              const titleRaw = (board.name ?? board.keyword ?? '').trim().replace(/^#\s*/, '') || '방'
                              const roomNo = board.public_id != null ? `#${board.public_id}` : null
                              const isHighlighted = highlightedIndex === i
                              const isExploded = board.is_active === false
                              return (
                                <li key={board.id} role="option" aria-selected={isHighlighted} id={`search-result-${i}`}>
                                  <motion.button
                                    type="button"
                                    onClick={() => handleSelectSearchResult(board)}
                                    className={`w-full text-left px-4 py-3 flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-white/5 transition-colors ${
                                      isHighlighted ? 'bg-neon-orange/20 border-l-2 border-l-neon-orange' : 'hover:bg-white/10'
                                    } ${isExploded ? 'opacity-90' : ''}`}
                                  >
                                    <span className="font-medium text-white truncate min-w-0 flex items-center gap-1.5 flex-wrap">
                                      <span className={isExploded ? 'text-gray-400' : ''}>{titleRaw}</span>
                                      {roomNo && (
                                        <span className="text-xs text-gray-500 font-normal flex-shrink-0">{roomNo}</span>
                                      )}
                                      {isExploded && (
                                        <>
                                          <span
                                            className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide flex-shrink-0"
                                            style={{
                                              background: 'linear-gradient(135deg, #FF6B00 0%, #E55300 100%)',
                                              color: '#fff',
                                              boxShadow: '0 0 8px rgba(255,107,0,0.5), 0 1px 2px rgba(0,0,0,0.2)',
                                            }}
                                          >
                                            방금 폭파됨
                                          </span>
                                          <span className="text-[10px] text-gray-500 font-medium flex-shrink-0">종료됨</span>
                                        </>
                                      )}
                                    </span>
                                    <span className={`text-xs flex items-center gap-2 flex-shrink-0 ${isExploded ? 'text-gray-500' : 'text-gray-400'}`}>
                                      <span>👥 {count !== null ? count : '—'}명</span>
                                      <BoardTimeLabel expiresAt={expiresAt} />
                                    </span>
                                  </motion.button>
                                </li>
                              )
                            })}
                          </ul>
                        )}
                        {searchFetched && searchResults.length > 0 && (
                          <div className="border-t border-white/10 p-3 bg-black/40">
                            <p className="text-gray-400 text-xs mb-2">원하는 방이 없나요? 새로 만들기</p>
                            <motion.button
                              type="button"
                              role="option"
                              id="search-result-create"
                              aria-selected={highlightedIndex === -2}
                              onClick={openCreateRoomModal}
                              className={`w-full py-2.5 px-4 rounded-xl text-sm font-semibold transition-all ${
                                highlightedIndex === -2
                                  ? 'bg-neon-orange/40 border-2 border-neon-orange text-white shadow-[0_0_12px_rgba(255,107,0,0.35)]'
                                  : 'bg-neon-orange/20 border-2 border-neon-orange/50 text-neon-orange hover:bg-neon-orange/30 hover:border-neon-orange'
                              }`}
                            >
                              방 만들기
                            </motion.button>
                          </div>
                        )}
                      </>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
        
        {/* 플로팅 태그: 너비 100%, overflow visible로 우측 잘림 없이 가로폭 전체 유영 */}
        <div
          className="relative min-h-[300px] h-56 sm:h-64 rounded-2xl overflow-visible floating-tags-container w-full"
          style={{
            maxWidth: '100%',
            backdropFilter: 'none',
            WebkitBackdropFilter: 'none',
            filter: 'none',
          }}
        >
          <AnimatePresence initial={false}>
            {floatingTags.map((tag, index) => {
              const { word } = tag
              const pos = tagPositions[index] ?? { left: 10 + (index % 5) * 18, top: 10 + Math.floor(index / 5) * 20 }
              const isFeatured = featuredKeywords.has(word)
              const delay = index * 0.15
              return (
                <motion.div
                  key={`tag-${index}-${word}`}
                  className="absolute w-0 h-0 overflow-visible"
                  style={{
                    left: `${pos.left}%`,
                    top: `${pos.top}%`,
                  }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: { duration: 2 } }}
                  transition={{ duration: 2.5 }}
                >
                  <motion.div
                    className={`floating-tag-pill rounded-full px-3 py-1.5 sm:px-4 sm:py-2 cursor-pointer select-none whitespace-nowrap ${
                      isFeatured ? 'floating-tag-glow' : 'floating-tag-soft'
                    }`}
                    style={{ willChange: 'transform', transform: 'translate3d(0,0,0)' }}
                    initial={{ opacity: 0, scale: 0 }}
                    onClick={() => handleKeywordClick(word)}
                    animate={{
                      opacity: isFeatured ? [0.8, 1, 0.8] : [0.5, 0.7, 0.5],
                      scale: isFeatured ? [1, 1.15, 1] : [1, 1.05, 1],
                      x: [
                        0,
                        Math.sin(index * 0.7) * 28,
                        Math.cos(index * 0.5) * 22,
                        Math.sin(index * 0.3) * 16,
                        0,
                      ],
                      y: [
                        0,
                        -32 + Math.sin(index * 0.5) * 18,
                        -18 + Math.cos(index * 0.3) * 12,
                        0,
                        0,
                      ],
                    }}
                    transition={{
                      duration: 8 + index * 0.3,
                      delay,
                      repeat: Infinity,
                      ease: 'easeInOut',
                    }}
                    whileHover={{
                      scale: 1.4,
                      zIndex: 10,
                      transition: { duration: 0.18 },
                    }}
                  >
                <span className="floating-tag-text text-xs sm:text-sm font-black">
                  #{word}
                </span>
                {/* 클릭 시 픽셀 파티클 효과 */}
                <AnimatePresence>
                  {warpingKeyword === word && (
                    <>
                      {Array.from({ length: 6 }).map((_, i) => (
                        <motion.span
                          key={i}
                          className="absolute w-1.5 h-1.5 bg-neon-orange rounded-sm"
                          style={{
                            left: '50%',
                            top: '50%',
                          }}
                          initial={{ opacity: 0.9, scale: 0 }}
                          animate={{
                            opacity: [0.9, 0],
                            scale: [0, 1.6],
                            x: Math.cos((i * Math.PI * 2) / 6) * 18,
                            y: Math.sin((i * Math.PI * 2) / 6) * 18,
                          }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.45, ease: 'easeOut' }}
                        />
                      ))}
                    </>
                  )}
                </AnimatePresence>
                  </motion.div>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      </section>

      {/* Warp Zone: localStorage 활성 세션 (방 입장 이력 + 닉네임), X로 제거 */}
      <section className="mb-7">
        <h2 className="text-xl font-black mb-4 flex items-center gap-2">
          <span className="text-neon-orange">⚡</span>
          Warp Zone
        </h2>
        <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide relative">
          {activeSessions.length === 0 ? (
            <p className="text-gray-500 text-sm py-4">방에 입장하면 여기에 표시됩니다.</p>
          ) : (
            activeSessions.map((session) => {
              const isWarping = warpingKeyword === session.keyword
              return (
                <motion.div
                  key={`${session.boardId}-${session.visitedAt}`}
                  className="flex-shrink-0 glass-strong rounded-2xl p-4 w-[78vw] max-w-[22rem] sm:w-80 cursor-pointer relative border border-white/10 shadow-lg shadow-black/20"
                  onClick={() => handleWarpToSession(session)}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  animate={isWarping ? { opacity: [1, 0.7], scale: [1, 1.05] } : {}}
                  transition={{ duration: 0.3 }}
                >
                  <button
                    type="button"
                    onClick={(e) => handleRemoveSession(e, session)}
                    className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-colors z-10 text-sm"
                    aria-label="워프존 목록에서 제거"
                  >
                    <span className="leading-none">×</span>
                  </button>
                  <div className="flex items-center gap-3 mb-1.5 pr-8">
                    <DotCharacter characterId={0} size={28} />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm truncate text-blue-400">
                        {session.boardName.startsWith('#') ? session.boardName : `#${session.boardName}`}
                        <span className="text-xs text-neon-orange/90 font-normal ml-1">[닉네임: {session.nickname}]</span>
                      </div>
                      {session.expiresAt != null && session.expiresAt > Date.now() ? (
                        <div className="text-xs text-gray-500 mt-1">
                          폭파까지 <span className="font-mono text-neon-orange/90 tabular-nums">{formatRemainingTimer(new Date(session.expiresAt)).label}</span>
                        </div>
                      ) : session.expiresAt != null ? null : (
                        <div className="text-xs text-gray-500 mt-1">—</div>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-neon-orange mt-1">
                    클릭 시 바로 입장
                  </div>
                </motion.div>
              )
            })
          )}
        </div>
      </section>

      {/* Live Boards */}
      <section>
        <h2 className="text-xl font-black mb-4 flex items-center gap-2">
          <span className="text-neon-orange animate-pulse">🔥</span>
          Live Boards
        </h2>
        <div className="space-y-3">
          {liveBoards.map((board) => {
            const expiresAt = board.expiresAt instanceof Date ? board.expiresAt : new Date(board.expiresAt)
            return (
              <motion.div
                key={board.id}
                className="glass-strong rounded-2xl p-4 cursor-pointer border border-white/10 shadow-lg shadow-black/20 hover:border-amber-500/20 transition-colors"
                onClick={() => {
                  if (useSupabase) {
                    router.push(`/board/${encodeURIComponent(getBoardKeyword(board))}`)
                  } else {
                    onEnterBoard(board.id)
                  }
                }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
                  <div className="flex-1 min-w-0 order-1">
                    <h3 className="font-bold text-lg text-blue-400 truncate">{displayBoardName(board.name)}</h3>
                    <p className="text-sm text-gray-400 mt-0.5 truncate">{board.description}</p>
                  </div>
                  <div className="flex items-center gap-3 text-sm shrink-0 order-2">
                    <span className="text-gray-400" title="하트">❤️ {board.heartCount}</span>
                    <span className="text-gray-400" title="인원">👥 {board.memberCount}</span>
                    <span className="text-xs sm:text-sm whitespace-nowrap">
                      <BoardTimeLabel expiresAt={expiresAt} />
                    </span>
                  </div>
                  {board.featured && (
                    <span className="text-neon-orange text-xs px-2 py-1 glass rounded-full shrink-0 order-3">
                      Featured
                    </span>
                  )}
                </div>
              </motion.div>
            )
          })}
        </div>
      </section>

      {/* 방 만들기 모달: 화면 정중앙 고정 */}
      <AnimatePresence>
        {showCreateRoomModal && (
          <motion.div
            key="create-room-modal"
            className="fixed inset-0 z-[9999] flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div
              role="presentation"
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowCreateRoomModal(false)}
              aria-hidden
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="create-room-modal-title"
              className="relative bg-[#1a1a1a] w-[90%] max-w-[400px] rounded-3xl p-8 shadow-2xl"
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
            >
                  <h2
                    id="create-room-modal-title"
                    className="text-xl sm:text-2xl font-black mb-1 tracking-tight"
                    style={{ color: '#FF5F00', textShadow: '0 0 12px rgba(255,95,0,0.5)' }}
                  >
                    방 만들기
                  </h2>
                  <p className="text-gray-400 text-sm mb-5">방 제목을 입력해 주세요.</p>
                  <div className="relative">
                    <motion.div
                      className="relative"
                      animate={inputShakeTrigger > 0 ? { x: [0, -8, 8, -6, 6, -2, 2, 0] } : { x: 0 }}
                      transition={{ duration: 0.4, ease: 'easeOut' }}
                      onAnimationComplete={() => setInputShakeTrigger(0)}
                    >
                      <input
                        ref={createRoomInputRef}
                        type="text"
                        value={createRoomTitle}
                        onChange={(e) => {
                          const raw = e.target.value
                          const clamped = raw.slice(0, MAX_ROOM_TITLE_LENGTH)
                          setCreateRoomTitle(clamped)
                          if (raw.length > MAX_ROOM_TITLE_LENGTH) setInputShakeTrigger((t) => t + 1)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') submitCreateRoomModal()
                          if (e.key === 'Escape') setShowCreateRoomModal(false)
                        }}
                        placeholder="예: 오늘 저녁 뭐 먹지?"
                        maxLength={MAX_ROOM_TITLE_LENGTH}
                        className="w-full px-5 py-3.5 pr-14 rounded-2xl bg-black/60 border-2 border-neon-orange/50 text-white placeholder-gray-500 text-base focus:border-neon-orange focus:outline-none focus:ring-2 focus:ring-neon-orange/40 focus:shadow-[0_0_16px_rgba(255,107,0,0.25)] transition-all"
                        aria-label="방 제목"
                        aria-describedby="create-room-char-count"
                      />
                    </motion.div>
                    <span
                      id="create-room-char-count"
                      className={`absolute right-3 bottom-3 text-xs tabular-nums transition-colors duration-200 ${
                        createRoomTitle.length >= MAX_ROOM_TITLE_LENGTH
                          ? 'text-red-400'
                          : createRoomTitle.length >= 20
                            ? 'text-amber-400'
                            : 'text-gray-500'
                      }`}
                      aria-live="polite"
                    >
                      {createRoomTitle.length}/{MAX_ROOM_TITLE_LENGTH}
                    </span>
                  </div>
                  {/* 비밀번호 (선택) - POPPIN 스타일 */}
                  <div className="mt-6 sm:mt-7 flex flex-col gap-1.5">
                    <div className="relative flex items-center">
                      <input
                        type={showCreateRoomPassword ? 'text' : 'password'}
                        placeholder="비밀번호 (선택)"
                        value={createRoomPassword}
                        onChange={(e) => setCreateRoomPassword(e.target.value)}
                        disabled={creatingRoom}
                        className="w-full pl-5 pr-12 py-3.5 rounded-2xl bg-black/60 border-2 border-neon-orange/50 text-white placeholder-gray-500 text-sm sm:text-base focus:border-neon-orange focus:outline-none focus:ring-2 focus:ring-neon-orange/40 focus:shadow-[0_0_16px_rgba(255,107,0,0.25)] transition-all disabled:opacity-60"
                        aria-label="방 비밀번호 (선택)"
                      />
                      <button
                        type="button"
                        onClick={() => setShowCreateRoomPassword((v) => !v)}
                        className="absolute right-3 p-1.5 rounded-lg hover:bg-neon-orange/10 focus:outline-none focus:ring-2 focus:ring-neon-orange/40 text-neon-orange"
                        aria-label={showCreateRoomPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
                      >
                        {showCreateRoomPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 px-1">
                      비밀번호를 설정하면 아는 사람만 들어올 수 있습니다.
                    </p>
                  </div>
                  <div className="mt-8 flex flex-col gap-3">
                    <motion.button
                      type="button"
                      onClick={() => setShowCreateRoomModal(false)}
                      className="w-full py-3 px-4 rounded-2xl font-semibold text-sm text-gray-400 bg-transparent hover:bg-white/5 hover:text-gray-300 transition-colors"
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                    >
                      취소
                    </motion.button>
                    <motion.button
                      type="button"
                      onClick={submitCreateRoomModal}
                      disabled={!isCreateRoomTitleValid || creatingRoom}
                      className="w-full py-3.5 px-4 rounded-2xl font-bold text-sm sm:text-base bg-neon-orange text-white border-2 border-neon-orange shadow-[0_0_20px_rgba(255,95,0,0.4)] hover:shadow-[0_0_24px_rgba(255,95,0,0.6)] disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none transition-all duration-200"
                      whileHover={isCreateRoomTitleValid && !creatingRoom ? { scale: 1.01 } : {}}
                      whileTap={isCreateRoomTitleValid && !creatingRoom ? { scale: 0.99 } : {}}
                    >
                      방 만들기
                    </motion.button>
                  </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default memo(HomeDashboardInner)
