'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import DotCharacter from './DotCharacter'
import { mockBoards, mockUser, getRemainingTime, getTrendKeywords, filterActiveBoards } from '@/lib/mockData'
import type { Board } from '@/lib/mockData'

interface HomeDashboardProps {
  onEnterBoard: (boardId: string) => void
}

export default function HomeDashboard({ onEnterBoard }: HomeDashboardProps) {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState('')
  const [trendKeywords] = useState<string[]>(getTrendKeywords())
  const [featuredKeywords, setFeaturedKeywords] = useState<Set<string>>(new Set(['맛집', '데이트', '카페']))
  const [userBoards] = useState<Board[]>(filterActiveBoards(mockBoards.slice(0, 2)))
  const [liveBoards] = useState<Board[]>(filterActiveBoards(mockBoards))
  const [warpingBoardId, setWarpingBoardId] = useState<string | null>(null)
  const [warpingKeyword, setWarpingKeyword] = useState<string | null>(null)

  // 더블클릭 감지
  const [lastClickTime, setLastClickTime] = useState<{ [key: string]: number }>({})

  const handleBoardClick = (boardId: string) => {
    const now = Date.now()
    const lastClick = lastClickTime[boardId] || 0
    
    if (now - lastClick < 300) {
      // 더블클릭 감지
      handleWarp(boardId)
    } else {
      setLastClickTime({ ...lastClickTime, [boardId]: now })
    }
  }

  const handleWarp = (boardId: string) => {
    // Pixel Burst 애니메이션
    setWarpingBoardId(boardId)
    setTimeout(() => {
      onEnterBoard(boardId)
      setWarpingBoardId(null)
    }, 600)
  }

  const handleKeywordClick = (keyword: string) => {
    setWarpingKeyword(keyword)
    // 짧은 워프 연출 후 상세 페이지로 이동
    setTimeout(() => {
      router.push(`/board/${encodeURIComponent(keyword)}`)
      setWarpingKeyword(null)
    }, 500)
  }

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
        <div className="flex items-center gap-2 glass px-3 py-2 sm:px-4 rounded-full">
          <span className="text-neon-orange text-lg sm:text-xl">❤️</span>
          <span className="font-semibold text-sm sm:text-base">{mockUser.heartBalance}</span>
        </div>
      </header>

      {/* Discovery Section */}
      <section className="mb-7 relative">
        <div className="relative z-10 mb-5">
          <input
            type="text"
            placeholder="검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-5 py-3.5 sm:px-6 sm:py-4 rounded-2xl glass-strong border-2 border-neon-orange/30 focus:border-neon-orange focus:outline-none text-white placeholder-gray-400 text-sm sm:text-base"
          />
        </div>
        
        {/* Trend Keywords Bubbles - 비눗방울처럼 느릿하게 유영 */}
        <div className="relative h-56 sm:h-64 overflow-hidden rounded-2xl bg-black/20">
          {trendKeywords.map((keyword, index) => {
            const isFeatured = featuredKeywords.has(keyword)
            const delay = index * 0.15
            // 더 자연스러운 랜덤 위치 분산
            const baseX = 15 + (index % 6) * 14 + Math.random() * 5
            const baseY = 15 + Math.floor(index / 6) * 25 + Math.random() * 10
            
            return (
              <motion.div
                key={keyword}
                className={`absolute glass rounded-full px-3 py-1.5 sm:px-4 sm:py-2 cursor-pointer select-none ${
                  isFeatured ? 'neon-glow border-2 border-neon-orange shadow-[0_0_20px_rgba(255,95,0,0.8)]' : ''
                }`}
                style={{
                  left: `${baseX}%`,
                  top: `${baseY}%`,
                }}
                initial={{ opacity: 0, scale: 0 }}
                onClick={() => handleKeywordClick(keyword)}
                animate={{
                  opacity: isFeatured ? [0.8, 1, 0.8] : [0.5, 0.7, 0.5],
                  scale: isFeatured ? [1, 1.15, 1] : [1, 1.05, 1],
                  y: [
                    0,
                    -30 + Math.sin(index * 0.5) * 15,
                    -15 + Math.cos(index * 0.3) * 10,
                    0,
                  ],
                  x: [
                    0,
                    Math.sin(index * 0.7) * 20,
                    Math.cos(index * 0.5) * 15,
                    Math.sin(index * 0.3) * 10,
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
                  boxShadow: '0 0 24px rgba(255,95,0,0.9)',
                  transition: { duration: 0.18 },
                }}
              >
                <span className={`text-xs sm:text-sm font-medium ${isFeatured ? 'text-neon-orange' : 'text-white/90'}`}>
                  #{keyword}
                </span>
                {/* 클릭 시 픽셀 파티클 효과 */}
                <AnimatePresence>
                  {warpingKeyword === keyword && (
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
            )
          })}
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
            const { days, hours } = getRemainingTime(board.expiresAt)
            const isWarping = warpingBoardId === board.id
            return (
              <motion.div
                key={board.id}
                className="flex-shrink-0 glass-strong rounded-2xl p-4 w-[78vw] max-w-[22rem] sm:w-80 cursor-pointer relative"
                onClick={() => handleBoardClick(board.id)}
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
                    <div className="font-semibold text-sm truncate">{board.name}</div>
                    <div className="text-xs text-gray-400">
                      {days}일 {hours}시간
                    </div>
                  </div>
                </div>
                <div className="text-xs text-neon-orange">
                  더블클릭으로 이동
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
            const { days, hours } = getRemainingTime(board.expiresAt)
            return (
              <motion.div
                key={board.id}
                className="glass-strong rounded-2xl p-4 cursor-pointer"
                onClick={() => onEnterBoard(board.id)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <h3 className="font-bold text-lg mb-1">{board.name}</h3>
                    <p className="text-sm text-gray-400 mb-2">{board.description}</p>
                  </div>
                  {board.featured && (
                    <span className="text-neon-orange text-xs px-2 py-1 glass rounded-full">
                      Featured
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-4 text-gray-400">
                    <span>❤️ {board.heartCount}</span>
                    <span>👥 {board.memberCount}</span>
                  </div>
                  <div className="text-neon-orange">
                    {days}일 {hours}시간 남음
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
