import { differenceInHours, differenceInDays } from 'date-fns'

export interface Board {
  id: string
  name: string
  description: string
  createdAt: Date
  expiresAt: Date
  heartCount: number
  memberCount: number
  isActive: boolean
  trendKeywords: string[]
  featured?: boolean
}

export interface Post {
  id: string
  boardId: string
  authorCharacter: number
  authorNickname: string
  content: string
  images?: string[]
  links?: { url: string; type: 'youtube' | 'instagram' | 'other' }[]
  heartCount: number
  createdAt: Date
}

export interface User {
  heartBalance: number
  character: number
  nickname: string
}

// Mock 데이터 생성
const now = new Date()

export const mockBoards: Board[] = [
  {
    id: 'board-1',
    name: '오늘의 맛집',
    description: '오늘 발견한 맛집을 공유해요',
    createdAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
    expiresAt: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000),
    heartCount: 42,
    memberCount: 15,
    isActive: true,
    trendKeywords: ['맛집', '데이트', '카페'],
    featured: true,
  },
  {
    id: 'board-2',
    name: '야식 모임',
    description: '밤에 먹는 게 최고야',
    createdAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
    expiresAt: new Date(now.getTime() + 6 * 24 * 60 * 60 * 1000),
    heartCount: 28,
    memberCount: 8,
    isActive: true,
    trendKeywords: ['치킨', '피자', '야식'],
  },
  {
    id: 'board-3',
    name: '운동 동기부여',
    description: '함께 운동해요!',
    createdAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
    expiresAt: new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000),
    heartCount: 15,
    memberCount: 12,
    isActive: true,
    trendKeywords: ['헬스', '러닝', '요가'],
  },
  {
    id: 'board-4',
    name: '취미 공유',
    description: '다양한 취미를 나눠요',
    createdAt: new Date(now.getTime() - 0.5 * 24 * 60 * 60 * 1000),
    expiresAt: new Date(now.getTime() + 6.5 * 24 * 60 * 60 * 1000),
    heartCount: 35,
    memberCount: 20,
    isActive: true,
    trendKeywords: ['그림', '독서', '게임'],
    featured: true,
  },
]

export const mockPosts: Post[] = [
  {
    id: 'post-1',
    boardId: 'board-1',
    authorCharacter: 0,
    authorNickname: '맛집러버',
    content: '오늘 발견한 숨은 맛집 진짜 대박이에요! 강력 추천합니다 🍜\n라면 전문점인데 진짜 맛있어요. 다음에 또 가야겠어요!',
    images: [
      'https://picsum.photos/400/300?random=1',
      'https://picsum.photos/400/300?random=2',
      'https://picsum.photos/400/300?random=3',
    ],
    heartCount: 12,
    createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
  },
  {
    id: 'post-2',
    boardId: 'board-1',
    authorCharacter: 1,
    authorNickname: '카페인중독',
    content: '이 카페 분위기 진짜 좋아요. 인스타에서 봤는데 실제로도 예뻐요!\n커피도 맛있고 디저트도 훌륭해요. 사진 찍기 좋은 곳이에요 📸',
    links: [{ url: 'https://instagram.com/p/example', type: 'instagram' }],
    heartCount: 8,
    createdAt: new Date(now.getTime() - 5 * 60 * 60 * 1000),
  },
  {
    id: 'post-3',
    boardId: 'board-1',
    authorCharacter: 3,
    authorNickname: '데이트러버',
    content: '데이트 코스 추천해요! 이번 주말에 가봤는데 완벽했어요 💕',
    images: [
      'https://picsum.photos/400/300?random=4',
      'https://picsum.photos/400/300?random=5',
    ],
    links: [{ url: 'https://youtube.com/watch?v=example', type: 'youtube' }],
    heartCount: 20,
    createdAt: new Date(now.getTime() - 30 * 60 * 1000),
  },
  {
    id: 'post-4',
    boardId: 'board-2',
    authorCharacter: 2,
    authorNickname: '야식러',
    content: '치킨이랑 맥주 조합은 진리죠? 🍗🍺\n오늘도 야식의 여왕이 되었어요. 배부르다~',
    images: [
      'https://picsum.photos/400/300?random=6',
      'https://picsum.photos/400/300?random=7',
      'https://picsum.photos/400/300?random=8',
      'https://picsum.photos/400/300?random=9',
    ],
    heartCount: 15,
    createdAt: new Date(now.getTime() - 1 * 60 * 60 * 1000),
  },
  {
    id: 'post-5',
    boardId: 'board-2',
    authorCharacter: 4,
    authorNickname: '피자매니아',
    content: '피자 먹고 싶어요! 어디가 제일 맛있나요? 추천 부탁드려요 🍕',
    heartCount: 5,
    createdAt: new Date(now.getTime() - 3 * 60 * 60 * 1000),
  },
  {
    id: 'post-6',
    boardId: 'board-3',
    authorCharacter: 5,
    authorNickname: '헬스마스터',
    content: '오늘 운동 완료! 러닝 5km 달렸어요 🏃‍♂️\n다음 목표는 10km예요. 화이팅!',
    images: ['https://picsum.photos/400/300?random=10'],
    heartCount: 18,
    createdAt: new Date(now.getTime() - 4 * 60 * 60 * 1000),
  },
  {
    id: 'post-7',
    boardId: 'board-4',
    authorCharacter: 6,
    authorNickname: '그림쟁이',
    content: '오늘 그린 그림 공유해요! 첫 시도인데 어때요? 🎨',
    images: [
      'https://picsum.photos/400/300?random=11',
      'https://picsum.photos/400/300?random=12',
    ],
    heartCount: 25,
    createdAt: new Date(now.getTime() - 6 * 60 * 60 * 1000),
  },
]

export const mockUser: User = {
  heartBalance: 50,
  character: 0,
  nickname: '',
}

// 유틸리티 함수
export function getRemainingTime(expiresAt: Date): { days: number; hours: number; minutes: number; seconds?: number } {
  const now = new Date()
  const diff = expiresAt.getTime() - now.getTime()
  
  if (diff <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0 }
  }
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
  const seconds = Math.floor((diff % (1000 * 60)) / 1000)
  
  return { days, hours, minutes, seconds }
}

/** 남은 시간을 HH:mm:ss 또는 N일 HH:mm:ss 로 포맷 (초 단위). 만료 시 { label: '0:00:00', remainingMs: 0, isUnderOneMinute: true } */
export function formatRemainingTimer(expiresAt: Date): {
  label: string
  remainingMs: number
  isUnderOneMinute: boolean
} {
  const now = new Date()
  const remainingMs = Math.max(0, expiresAt.getTime() - now.getTime())
  const totalSeconds = Math.floor(remainingMs / 1000)
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const pad = (n: number): string => String(n).padStart(2, '0')
  const label =
    days > 0
      ? `${days}일 ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
      : `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
  return {
    label,
    remainingMs,
    isUnderOneMinute: totalSeconds < 60,
  }
}

export function getTimeProgress(createdAt: Date, expiresAt: Date): number {
  const now = new Date()
  const total = expiresAt.getTime() - createdAt.getTime()
  const remaining = expiresAt.getTime() - now.getTime()
  
  if (total <= 0) return 0
  if (remaining <= 0) return 0
  
  return (remaining / total) * 100
}

export function getTrendKeywords(): string[] {
  return [
    '맛집', '데이트', '카페', '치킨', '피자', '야식',
    '헬스', '러닝', '요가', '그림', '독서', '게임',
    '영화', '드라마', '음악', '여행', '쇼핑', '패션',
  ]
}

// 하트를 받으면 게시판 수명 연장 (하트 10개당 1시간 연장, 최대 7일 연장 가능)
export function extendBoardLifespan(board: Board, heartCount: number): Board {
  const hoursToAdd = Math.floor(heartCount / 10) // 10개당 1시간
  const maxLifespan = 7 * 24 * 60 * 60 * 1000 // 7일
  const currentLifespan = board.expiresAt.getTime() - board.createdAt.getTime()
  const newLifespan = Math.min(currentLifespan + hoursToAdd * 60 * 60 * 1000, maxLifespan)
  const newExpiresAt = new Date(board.createdAt.getTime() + newLifespan)
  
  return {
    ...board,
    expiresAt: newExpiresAt,
    heartCount: board.heartCount + heartCount,
  }
}

// 7일 후 자동 삭제 시뮬레이션 (생성일로부터 7일 경과 시 만료)
export function simulateAutoDeletion(board: Board): boolean {
  const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000
  const elapsed = new Date().getTime() - board.createdAt.getTime()
  return elapsed >= sevenDaysInMs
}

// 게시판이 만료되었는지 확인 (7일 자동 삭제 또는 expiresAt 기준)
export function isBoardExpired(board: Board): boolean {
  // 7일 자동 삭제 로직
  if (simulateAutoDeletion(board)) {
    return true
  }
  // 또는 expiresAt 기준 만료
  return new Date() >= board.expiresAt
}

// 만료된 게시판 필터링
export function filterActiveBoards(boards: Board[]): Board[] {
  return boards.filter(board => !isBoardExpired(board) && board.isActive)
}
