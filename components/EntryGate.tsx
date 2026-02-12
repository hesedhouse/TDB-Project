'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import DotCharacter from './DotCharacter'
import { generateRandomNickname } from '@/lib/nicknames'

interface EntryGateProps {
  boardId: string
  onComplete: (character: number, nickname: string) => void
  onClose: () => void
}

export default function EntryGate({ boardId, onComplete, onClose }: EntryGateProps) {
  const [selectedCharacter, setSelectedCharacter] = useState<number>(0)
  const [nickname, setNickname] = useState<string>('')

  const handleRandomNickname = () => {
    setNickname(generateRandomNickname())
  }

  const handleEnter = () => {
    if (nickname.trim()) {
      onComplete(selectedCharacter, nickname.trim())
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 bg-black/80 z-50 flex items-end justify-center px-0 sm:px-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="w-full sm:max-w-xl glass-strong rounded-t-3xl p-5 sm:p-6 max-h-[90vh] overflow-y-auto safe-bottom"
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close Button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-white"
          >
            ✕
          </button>

          <h2 className="text-xl sm:text-2xl font-bold mb-5 sm:mb-6 text-center">
            게시판 입장
          </h2>

          {/* Character Selection */}
          <div className="mb-5 sm:mb-6">
            <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4">캐릭터 선택</h3>
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-3 sm:gap-4">
              {Array.from({ length: 10 }).map((_, index) => (
                <motion.button
                  key={index}
                  className={`p-3 sm:p-4 rounded-2xl glass transition-all ${
                    selectedCharacter === index
                      ? 'ring-2 ring-neon-orange neon-glow'
                      : 'hover:ring-1 hover:ring-neon-orange/50'
                  }`}
                  onClick={() => setSelectedCharacter(index)}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                >
                  <DotCharacter characterId={index} size={44} className="sm:scale-100 scale-95" />
                </motion.button>
              ))}
            </div>
          </div>

          {/* Nickname Input */}
          <div className="mb-5 sm:mb-6">
            <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4">닉네임 입력</h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="닉네임을 입력하세요"
                className="flex-1 px-4 py-3 rounded-xl glass border-2 border-neon-orange/30 focus:border-neon-orange focus:outline-none text-white placeholder-gray-400 text-sm sm:text-base"
                maxLength={20}
              />
              <motion.button
                onClick={handleRandomNickname}
                className="px-4 py-3 rounded-xl glass-strong border-2 border-neon-orange/50 hover:border-neon-orange transition-colors"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <span className="text-xl sm:text-2xl">🎲</span>
              </motion.button>
            </div>
            {nickname && (
              <motion.div
                className="mt-3 flex items-center gap-3 glass px-4 py-2 rounded-xl"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <DotCharacter characterId={selectedCharacter} size={32} />
                <span className="font-semibold">{nickname}</span>
              </motion.div>
            )}
          </div>

          {/* Enter Button */}
          <motion.button
            onClick={handleEnter}
            disabled={!nickname.trim()}
            className={`w-full py-3.5 sm:py-4 rounded-xl font-bold text-base sm:text-lg ${
              nickname.trim()
                ? 'bg-neon-orange text-white neon-glow'
                : 'bg-gray-800 text-gray-500 cursor-not-allowed'
            }`}
            whileHover={nickname.trim() ? { scale: 1.02 } : {}}
            whileTap={nickname.trim() ? { scale: 0.98 } : {}}
          >
            입장하기
          </motion.button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
