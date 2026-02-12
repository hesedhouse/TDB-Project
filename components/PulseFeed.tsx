'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import DotCharacter from './DotCharacter'
import { mockBoards, mockPosts, getTimeProgress, getRemainingTime, extendBoardLifespan } from '@/lib/mockData'
import type { Post, Board } from '@/lib/mockData'

interface PulseFeedProps {
  boardId: string
  userCharacter: number
  userNickname: string
  onBack: () => void
}

type SortType = 'latest' | 'popular'

export default function PulseFeed({ boardId, userCharacter, userNickname, onBack }: PulseFeedProps) {
  const [sortType, setSortType] = useState<SortType>('latest')
  const [posts, setPosts] = useState<Post[]>(mockPosts.filter(p => p.boardId === boardId))
  const [progress, setProgress] = useState(100)
  const [lastClickTime, setLastClickTime] = useState<{ [key: string]: number }>({})
  const [board, setBoard] = useState<Board | undefined>(mockBoards.find(b => b.id === boardId))
  const [showLifespanExtended, setShowLifespanExtended] = useState(false)
  const [heartAnimations, setHeartAnimations] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!board) return

    const updateProgress = () => {
      const newProgress = getTimeProgress(board.createdAt, board.expiresAt)
      setProgress(newProgress)
    }

    updateProgress()
    const interval = setInterval(updateProgress, 60000) // 1분마다 업데이트

    return () => clearInterval(interval)
  }, [board])

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

  if (!board) {
    return (
      <div className="min-h-screen bg-midnight-black flex items-center justify-center">
        <p className="text-gray-400">게시판을 찾을 수 없습니다.</p>
      </div>
    )
  }

  const { days, hours, minutes } = getRemainingTime(board.expiresAt)

  return (
    <div className="min-h-screen bg-midnight-black text-white safe-bottom">
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
            <h1 className="text-base sm:text-xl font-bold truncate">{board.name}</h1>
            <div className="w-8" />
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
          
          <div className="text-xs text-neon-orange mt-2 text-center relative">
            {days}일 {hours}시간 {minutes}분 남음
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

      {/* Feed - 왼쪽 정렬 말풍선 스타일 */}
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
    </div>
  )
}
