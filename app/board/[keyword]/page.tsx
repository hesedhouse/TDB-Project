'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import PulseFeed from '@/components/PulseFeed'
import { mockBoards } from '@/lib/mockData'

interface BoardByKeywordPageProps {
  params: { keyword: string }
}

export default function BoardByKeywordPage({ params }: BoardByKeywordPageProps) {
  const router = useRouter()
  const decodedKeyword = decodeURIComponent(params.keyword)
  const [showToast, setShowToast] = useState(false)

  const matchedBoard = useMemo(() => {
    const keyword = decodedKeyword
    return (
      mockBoards.find((b) => b.trendKeywords.includes(keyword)) ||
      mockBoards.find((b) => b.name.includes(keyword))
    )
  }, [decodedKeyword])

  useEffect(() => {
    if (!matchedBoard) {
      setShowToast(true)
      const timer = setTimeout(() => setShowToast(false), 2800)
      return () => clearTimeout(timer)
    }
  }, [matchedBoard])

  if (matchedBoard) {
    // 기존 게시판과 연결되는 경우 PulseFeed 재사용
    return (
      <div className="min-h-screen bg-midnight-black text-white">
        <PulseFeed
          boardId={matchedBoard.id}
          userCharacter={0}
          userNickname="게스트"
          onBack={() => router.push('/')}
        />
      </div>
    )
  }

  // 존재하지 않는 키워드인 경우: 새 떴다방 생성 + 빈 게시판 화면
  return (
    <div className="min-h-screen bg-midnight-black text-white safe-bottom">
      {/* Toast 알림 */}
      <AnimatePresence>
        {showToast && (
          <motion.div
            className="fixed top-4 left-1/2 -translate-x-1/2 z-50 glass-strong px-4 py-2 rounded-full text-sm text-neon-orange neon-glow"
            initial={{ opacity: 0, y: -10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.9 }}
            transition={{ duration: 0.25 }}
          >
            새로운 떴다방이 생성되었습니다!
          </motion.div>
        )}
      </AnimatePresence>

      {/* 상단 바 */}
      <div className="sticky top-0 z-10 glass-strong border-b border-neon-orange/20 safe-top">
        <div className="px-3 py-3 sm:p-4 flex items-center justify-between gap-2">
          <button
            onClick={() => router.push('/')}
            className="text-gray-400 hover:text-white text-sm sm:text-base flex-shrink-0"
          >
            ← 홈으로
          </button>
          <div className="flex-1 min-w-0 text-center">
            <div className="text-xs text-gray-400 mb-1">새로 생성된 떴다방</div>
            <h1 className="text-base sm:text-xl font-bold truncate">#{decodedKeyword}</h1>
          </div>
          <div className="w-12" />
        </div>

        {/* 네온 오렌지 프로그레스 바 (처음은 100%) */}
        <div className="px-3 pb-3 sm:px-4 sm:pb-4">
          <div className="relative h-1 bg-gray-800 rounded-full overflow-hidden">
            <motion.div
              className="absolute top-0 left-0 h-full bg-neon-orange neon-glow"
              initial={{ width: '0%' }}
              animate={{ width: '100%' }}
              transition={{ duration: 0.8 }}
            />
          </div>
          <div className="text-xs text-neon-orange mt-2 text-center">
            이제 막 생성된 방이에요. 7일 동안 유지됩니다.
          </div>
        </div>
      </div>

      {/* 빈 피드 영역 */}
      <div className="px-3 py-6 sm:p-6 space-y-6">
        <div className="glass-strong rounded-3xl p-5 text-center">
          <p className="text-sm sm:text-base text-gray-200 mb-2">
            아직 이 키워드로 남겨진 글이 없어요.
          </p>
          <p className="text-xs sm:text-sm text-gray-500">
            첫 번째 말풍선의 주인이 되어보세요.
          </p>
        </div>
      </div>
    </div>
  )
}

