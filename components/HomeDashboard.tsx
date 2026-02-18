'use client'

import { useState, useEffect, useCallback, memo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import DotCharacter from './DotCharacter'
import { mockBoards, getTrendKeywords, filterActiveBoards, formatRemainingTimer } from '@/lib/mockData'
import { getHourglasses } from '@/lib/hourglass'
import { isSupabaseConfigured } from '@/lib/supabase/client'
import { createClient } from '@/lib/supabase/client'
import { getBoardByPublicId, getOrCreateBoardByKeyword } from '@/lib/supabase/boards'
import { getFloatingTags, type FloatingTag } from '@/lib/supabase/trendingKeywords'
import { useTick } from '@/lib/TickContext'
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

function HomeDashboardInner({ onEnterBoard }: HomeDashboardProps) {
  const router = useRouter()
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
  const [hourglasses, setHourglasses] = useState(0)
  const [creatingRoom, setCreatingRoom] = useState(false)

  useEffect(() => {
    setHourglasses(getHourglasses())
  }, [])

  // 초기 플로팅 태그: boards + trending_keywords 혼합 (Supabase 사용 시)
  useEffect(() => {
    if (!useSupabase) return
    getFloatingTags().then((tags) => {
      if (tags.length > 0) setFloatingTags(tags)
    })
  }, [useSupabase])

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

  /** 방 만들기/시작하기: 입력값을 키워드로 보드 조회·생성 후 해당 방(UUID URL)으로 이동 */
  const handleCreateOrEnterRoom = useCallback(async () => {
    const keyword = searchQuery.trim()
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
        const direct = await getBoardByPublicId(keyword)
        if (direct?.id) {
          // 숫자 직통 입장은 URL도 숫자(/board/123)를 유지
          router.push(`/board/${encodeURIComponent(keyword)}`)
          return
        }
      }
      const board = await getOrCreateBoardByKeyword(keyword)
      if (board) {
        router.push(`/board/${board.id}`)
      } else {
        setCreatingRoom(false)
      }
    } catch {
      setCreatingRoom(false)
    }
  }, [searchQuery, creatingRoom, useSupabase, router])

  return (
    <div className="min-h-screen bg-midnight-black text-white pb-20 safe-bottom">
      {/* Header */}
      <header className="flex items-center justify-between mb-5 pt-4 safe-top">
        <div className="flex items-center gap-3">
          <motion.div
            className="text-2xl sm:text-3xl font-bold pixel-art"
            style={{
              color: '#FF5F00',
              textShadow: '0 0 10px #FF5F00, 0 0 20px #FF5F00',
            }}
            animate={{ opacity: [1, 0.8, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            TDB
          </motion.div>
          <span className="text-xs sm:text-sm text-gray-400">떴다방</span>
        </div>
        <Link
          href="/store"
          className="flex items-center gap-2 sm:gap-2.5 px-3 py-1.5 sm:py-2 rounded-full bg-white/[0.06] border border-white/10 min-w-0 hover:border-amber-500/30 transition-colors"
          role="status"
          aria-label={`보유 모래시계 ${hourglasses}개, 상점으로 이동`}
        >
          <span className="text-lg sm:text-xl leading-none flex-shrink-0" aria-hidden>⏳</span>
          <span className="font-semibold text-sm sm:text-base tabular-nums text-white">{hourglasses}</span>
        </Link>
      </header>

      {/* Discovery Section - 방 제목 입력 + 시작하기 (플로팅 태그가 화면 끝까지 보이도록 overflow-visible) */}
      <section className="mb-7 relative overflow-visible">
        <div className="relative z-10 mb-5 flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="방 제목을 입력하세요"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateOrEnterRoom()
            }}
            disabled={creatingRoom}
            className="flex-1 w-full px-5 py-3.5 sm:px-6 sm:py-4 rounded-2xl glass-strong border-2 border-neon-orange/30 focus:border-neon-orange focus:outline-none text-white placeholder-gray-400 text-sm sm:text-base disabled:opacity-60"
            aria-label="방 제목 입력"
          />
          <motion.button
            type="button"
            onClick={handleCreateOrEnterRoom}
            disabled={creatingRoom || !searchQuery.trim()}
            className="flex items-center justify-center gap-2 px-5 py-3.5 sm:px-6 sm:py-4 rounded-2xl font-semibold text-sm sm:text-base bg-neon-orange text-white border-2 border-neon-orange shadow-[0_0_20px_rgba(255,95,0,0.4)] hover:shadow-[0_0_24px_rgba(255,95,0,0.6)] disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none transition-shadow min-w-[7rem] sm:min-w-[8rem]"
            whileHover={!creatingRoom && searchQuery.trim() ? { scale: 1.02 } : {}}
            whileTap={!creatingRoom && searchQuery.trim() ? { scale: 0.98 } : {}}
          >
            {creatingRoom ? (
              <>
                <motion.span
                  className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
                />
                <span>방 만드는 중...</span>
              </>
            ) : (
              <>
                <span>시작하기</span>
                <ArrowRight className="w-4 h-4 flex-shrink-0" strokeWidth={2.5} />
              </>
            )}
          </motion.button>
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
                <span className="floating-tag-text text-xs sm:text-sm font-bold">
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

      {/* Warp Zone */}
      <section className="mb-7">
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          <span className="text-neon-orange">⚡</span>
          Warp Zone
        </h2>
        <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide relative">
          {userBoards.map((board) => {
            const expiresAt = board.expiresAt instanceof Date ? board.expiresAt : new Date(board.expiresAt)
            const isWarping = warpingBoardId === board.id
            return (
              <motion.div
                key={board.id}
                className="flex-shrink-0 glass-strong rounded-2xl p-4 w-[78vw] max-w-[22rem] sm:w-80 cursor-pointer relative border border-white/10 shadow-lg shadow-black/20"
                onClick={() => handleWarp(board)}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                animate={isWarping ? {
                  scale: [1, 1.2, 0],
                  opacity: [1, 0.8, 0],
                  rotate: [0, 180, 360],
                } : {}}
                transition={{ duration: 0.6, ease: 'easeOut' }}
              >
                {isWarping && (
                  <>
                    <motion.div
                      className="absolute inset-0 flex items-center justify-center z-10"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: [0, 1, 0] }}
                      transition={{ duration: 0.6 }}
                    >
                      <motion.div
                        className="text-5xl text-neon-orange neon-glow"
                        animate={{ 
                          scale: [1, 1.5, 1],
                          rotate: [0, 360]
                        }}
                        transition={{ duration: 0.6 }}
                      >
                        ⚡
                      </motion.div>
                    </motion.div>
                    {/* Pixel Burst Effect */}
                    {Array.from({ length: 8 }).map((_, i) => (
                      <motion.div
                        key={i}
                        className="absolute w-2 h-2 bg-neon-orange"
                        style={{
                          left: '50%',
                          top: '50%',
                        }}
                        initial={{ opacity: 1, scale: 0 }}
                        animate={{
                          opacity: [1, 0],
                          scale: [0, 2],
                          x: Math.cos((i * Math.PI * 2) / 8) * 50,
                          y: Math.sin((i * Math.PI * 2) / 8) * 50,
                        }}
                        transition={{ duration: 0.6, ease: 'easeOut' }}
                      />
                    ))}
                  </>
                )}
                <div className="flex items-center gap-3 mb-3">
                  <DotCharacter characterId={0} size={32} />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate text-blue-400">{displayBoardName(board.name)}</div>
                    <div className="text-xs">
                      <BoardTimeLabel expiresAt={expiresAt} />
                    </div>
                  </div>
                </div>
                <div className="text-xs text-neon-orange">
                  지금 입장하기
                </div>
              </motion.div>
            )
          })}
        </div>
      </section>

      {/* Live Boards */}
      <section>
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
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
    </div>
  )
}

export default memo(HomeDashboardInner)
