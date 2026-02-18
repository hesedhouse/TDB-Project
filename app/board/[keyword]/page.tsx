'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import PulseFeed from '@/components/PulseFeed'
import { mockBoards } from '@/lib/mockData'
import { isSupabaseConfigured } from '@/lib/supabase/client'

const UNLOCK_STORAGE_PREFIX = 'tdb-unlocked-'

interface BoardByKeywordPageProps {
  params: { keyword: string }
}

/** API에서 반환하는 보드 (has_password 포함, password_hash 미노출) */
type BoardFromApi = {
  id: string
  public_id: number | null
  keyword: string
  name: string | null
  expires_at: string
  created_at: string
  has_password: boolean
}

/** #PUBG 등 특수문자 포함 키워드를 URL에서 안전하게 디코딩 */
function safeDecodeKeyword(raw: string): string {
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

export default function BoardByKeywordPage({ params }: BoardByKeywordPageProps) {
  const router = useRouter()
  const decodedKeyword = safeDecodeKeyword(params.keyword ?? '')
  const [showToast, setShowToast] = useState(false)
  const [supabaseBoard, setSupabaseBoard] = useState<BoardFromApi | null>(null)
  const [boardLoading, setBoardLoading] = useState(true)
  const [passwordUnlocked, setPasswordUnlocked] = useState(false)
  const [passwordInput, setPasswordInput] = useState('')
  const [passwordError, setPasswordError] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const useSupabase = isSupabaseConfigured()

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

  // Supabase 사용 시: API로 보드 조회 (has_password 포함). 404면 키워드로 생성 시도 후 리다이렉트
  useEffect(() => {
    if (!useSupabase) {
      setBoardLoading(false)
      return
    }
    let cancelled = false
    const run = async () => {
      const res = await fetch(`/api/board/${encodeURIComponent(decodedKeyword)}`)
      if (cancelled) return
      if (res.status === 404) {
        // 키워드로 새 방 생성 후 생성된 번호로 이동
        const createRes = await fetch('/api/board/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keyword: decodedKeyword }),
        })
        if (cancelled) return
        if (createRes.ok) {
          const created = await createRes.json()
          const path = created.public_id != null ? `/board/${created.public_id}` : `/board/${created.id}`
          router.replace(path)
          return
        }
        setBoardLoading(false)
        return
      }
      if (!res.ok) {
        setBoardLoading(false)
        return
      }
      const data: BoardFromApi = await res.json()
      setSupabaseBoard(data)
      const storageKey = `${UNLOCK_STORAGE_PREFIX}${data.id}`
      const wasUnlocked = typeof window !== 'undefined' && sessionStorage.getItem(storageKey) === '1'
      setPasswordUnlocked(wasUnlocked)
      setBoardLoading(false)
    }
    run()
    return () => { cancelled = true }
  }, [useSupabase, decodedKeyword, router])

  const handlePasswordSubmit = async () => {
    if (!supabaseBoard || !passwordInput.trim() || verifying) return
    setVerifying(true)
    setPasswordError(false)
    try {
      const res = await fetch('/api/board/verify-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publicId: supabaseBoard.public_id,
          boardId: supabaseBoard.id,
          password: passwordInput.trim(),
        }),
      })
      const data = await res.json()
      if (data?.ok) {
        sessionStorage.setItem(`${UNLOCK_STORAGE_PREFIX}${supabaseBoard.id}`, '1')
        setPasswordUnlocked(true)
        setPasswordInput('')
      } else {
        setPasswordError(true)
      }
    } catch {
      setPasswordError(true)
    } finally {
      setVerifying(false)
    }
  }

  // Supabase 미사용 시: 매칭된 목 보드가 있으면 PulseFeed, 없으면 키워드로 PulseFeed(빈 방)
  if (!useSupabase) {
    const boardId = matchedBoard?.id ?? decodedKeyword
    const numFromId = boardId.match(/^board-(\d+)$/i)?.[1]
    const boardPublicId = numFromId ? Number(numFromId) : (matchedBoard?.id != null && /^\d+$/.test(String(matchedBoard.id)) ? Number(matchedBoard.id) : null)
    const initialName = matchedBoard?.name ?? (numFromId ? '새 방' : decodedKeyword)
    return (
      <div className="min-h-screen bg-midnight-black text-white">
        <PulseFeed
          boardId={boardId}
          boardPublicId={boardPublicId}
          userCharacter={0}
          userNickname="게스트"
          onBack={() => router.push('/')}
          initialBoardName={matchedBoard ? undefined : initialName}
        />
      </div>
    )
  }

  // Supabase 연동 시: 보드 조회 후 비밀번호 잠금이면 모달, 해제되면 PulseFeed
  if (useSupabase) {
    if (boardLoading) {
      return (
        <div className="min-h-screen bg-midnight-black text-white flex items-center justify-center">
          <p className="text-gray-400">방을 불러오는 중...</p>
        </div>
      )
    }
    if (!supabaseBoard) {
      return (
        <div className="min-h-screen bg-midnight-black text-white flex items-center justify-center">
          <p className="text-gray-400">방을 불러올 수 없습니다.</p>
        </div>
      )
    }
    const needsPassword = supabaseBoard.has_password && !passwordUnlocked
    return (
      <div className="min-h-screen bg-midnight-black text-white">
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
        {needsPassword ? (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="w-full max-w-sm rounded-2xl p-6 glass-strong border-2 border-neon-orange/50 shadow-[0_0_24px_rgba(255,107,0,0.25),0_0_48px_rgba(255,107,0,0.12)]"
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', damping: 25 }}
            >
              <p className="text-center text-neon-orange font-bold text-lg mb-4" style={{ textShadow: '0 0 12px rgba(255,107,0,0.6)' }}>
                비밀번호를 입력하세요
              </p>
              <input
                type="password"
                value={passwordInput}
                onChange={(e) => { setPasswordInput(e.target.value); setPasswordError(false) }}
                onKeyDown={(e) => e.key === 'Enter' && handlePasswordSubmit()}
                placeholder="비밀번호"
                disabled={verifying}
                className="w-full px-4 py-3 rounded-xl bg-black/50 border-2 border-neon-orange/40 focus:border-neon-orange focus:outline-none text-white placeholder-gray-500 text-sm mb-3 shadow-[0_0_12px_rgba(255,107,0,0.15)]"
                autoFocus
              />
              {passwordError && (
                <p className="text-red-400 text-sm mb-2 text-center">비밀번호가 올바르지 않습니다.</p>
              )}
              <motion.button
                type="button"
                onClick={handlePasswordSubmit}
                disabled={verifying || !passwordInput.trim()}
                className="w-full py-3 rounded-xl font-semibold bg-neon-orange text-white disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_14px_rgba(255,107,0,0.4)]"
              >
                {verifying ? '확인 중...' : '입장하기'}
              </motion.button>
              <button
                type="button"
                onClick={() => router.push('/')}
                className="w-full mt-3 py-2 text-sm text-gray-400 hover:text-white"
              >
                뒤로
              </button>
            </motion.div>
          </motion.div>
        ) : (
          <PulseFeed
            boardId={supabaseBoard.id}
            boardPublicId={supabaseBoard.public_id ?? null}
            userCharacter={0}
            userNickname="게스트"
            onBack={() => router.push('/')}
            initialExpiresAt={new Date(supabaseBoard.expires_at)}
            initialCreatedAt={new Date(supabaseBoard.created_at)}
            initialBoardName={supabaseBoard.name ?? `#${decodedKeyword}`}
          />
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-midnight-black text-white flex items-center justify-center">
      <p className="text-gray-400">방을 불러올 수 없습니다.</p>
    </div>
  )
}

