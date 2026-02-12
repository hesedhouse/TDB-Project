'use client'

import { motion } from 'framer-motion'

interface DotCharacterProps {
  characterId: number
  size?: number
  className?: string
}

// 8-bit 스타일 도트 캐릭터 데이터 (10개)
const CHARACTERS = [
  // Character 0: 기본 캐릭터
  [
    [0, 1, 1, 0],
    [1, 1, 1, 1],
    [1, 0, 0, 1],
    [1, 1, 1, 1],
    [0, 1, 1, 0],
  ],
  // Character 1: 고양이
  [
    [0, 1, 1, 0],
    [1, 1, 1, 1],
    [1, 0, 0, 1],
    [1, 1, 1, 1],
    [1, 0, 0, 1],
  ],
  // Character 2: 토끼
  [
    [1, 0, 0, 1],
    [1, 1, 1, 1],
    [1, 0, 0, 1],
    [1, 1, 1, 1],
    [0, 1, 1, 0],
  ],
  // Character 3: 곰
  [
    [0, 1, 1, 0],
    [1, 1, 1, 1],
    [1, 1, 1, 1],
    [1, 0, 0, 1],
    [0, 1, 1, 0],
  ],
  // Character 4: 강아지
  [
    [1, 1, 0, 0],
    [1, 1, 1, 1],
    [1, 0, 0, 1],
    [1, 1, 1, 1],
    [0, 1, 1, 0],
  ],
  // Character 5: 펭귄
  [
    [0, 1, 1, 0],
    [1, 1, 1, 1],
    [1, 0, 0, 1],
    [1, 1, 1, 1],
    [1, 1, 1, 1],
  ],
  // Character 6: 로봇
  [
    [1, 1, 1, 1],
    [1, 0, 0, 1],
    [1, 1, 1, 1],
    [1, 0, 0, 1],
    [1, 1, 1, 1],
  ],
  // Character 7: 별
  [
    [0, 1, 1, 0],
    [1, 1, 1, 1],
    [1, 0, 0, 1],
    [1, 1, 1, 1],
    [0, 1, 1, 0],
  ],
  // Character 8: 하트
  [
    [0, 1, 1, 0],
    [1, 1, 1, 1],
    [1, 1, 1, 1],
    [0, 1, 1, 0],
    [0, 0, 0, 0],
  ],
  // Character 9: 우주인
  [
    [1, 1, 1, 1],
    [1, 0, 0, 1],
    [1, 1, 1, 1],
    [0, 1, 1, 0],
    [1, 1, 1, 1],
  ],
]

const COLORS = [
  '#FF5F00', // Neon Orange
  '#00FF5F', // Neon Green
  '#5F00FF', // Neon Purple
  '#FF005F', // Neon Pink
  '#00FFFF', // Cyan
  '#FFFF00', // Yellow
  '#FF5F5F', // Light Red
  '#5FFF00', // Lime
  '#FF5FFF', // Magenta
  '#5F5FFF', // Light Blue
]

export default function DotCharacter({ characterId, size = 32, className = '' }: DotCharacterProps) {
  const character = CHARACTERS[characterId % CHARACTERS.length]
  const color = COLORS[characterId % COLORS.length]
  const pixelSize = size / 4

  return (
    <motion.div
      className={`inline-block ${className}`}
      style={{ width: size, height: size }}
      whileHover={{ scale: 1.1 }}
      transition={{ type: 'spring', stiffness: 300 }}
    >
      <div className="relative" style={{ width: size, height: size }}>
        {character.map((row, rowIndex) =>
          row.map((pixel, colIndex) => (
            <div
              key={`${rowIndex}-${colIndex}`}
              className="absolute pixel-art"
              style={{
                left: colIndex * pixelSize,
                top: rowIndex * pixelSize,
                width: pixelSize,
                height: pixelSize,
                backgroundColor: pixel ? color : 'transparent',
                boxShadow: pixel ? `0 0 ${pixelSize / 2}px ${color}` : 'none',
              }}
            />
          ))
        )}
      </div>
    </motion.div>
  )
}
