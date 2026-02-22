'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { TickProvider } from '@/lib/TickContext'
import HomeDashboard from '@/components/HomeDashboard'
import EntryGate from '@/components/EntryGate'
import PulseFeed from '@/components/PulseFeed'
import { useSession } from 'next-auth/react'
import { useAuth, exchangeHashForSession } from '@/lib/supabase/auth'
import { isSupabaseConfigured } from '@/lib/supabase/client'

export default function Home() {
  const router = useRouter()
  const { user, loading } = useAuth()
  const { data: nextSession, status } = useSession()
  const useSupabase = isSupabaseConfigured()
  const isNextAuthLoading = status === 'loading'
  const isNextAuthAuthenticated = status === 'authenticated'
  const hasSession = !!user || isNextAuthAuthenticated
  const effectiveUserId = user?.id ?? (nextSession?.user as { id?: string } | undefined)?.id ?? undefined
  const [oauthProcessing, setOauthProcessing] = useState(false)
  const hashHandledRef = useRef(false)

  const [currentView, setCurrentView] = useState<'home' | 'entry' | 'feed'>('home')
  const [selectedBoard, setSelectedBoard] = useState<string | null>(null)
  const [userCharacter, setUserCharacter] = useState<number>(0)
  const [userNickname, setUserNickname] = useState<string>('')

  // OAuth 콜백: 루트(/)로 돌아왔을 때 주소창 해시(#access_token=...)를 읽어 세션 수립 후 /dashboard로 이동
  useEffect(() => {
    if (hashHandledRef.current || typeof window === 'undefined') return
    const hash = window.location.hash?.trim()
    if (!hash || (!hash.includes('access_token') && !hash.includes('refresh_token'))) return
    hashHandledRef.current = true
    setOauthProcessing(true)
    exchangeHashForSession()
      .then((ok) => {
        if (ok) router.replace('/dashboard')
        else setOauthProcessing(false)
      })
      .catch(() => setOauthProcessing(false))
  }, [router])

  useEffect(() => {
    if (loading || isNextAuthLoading || oauthProcessing) return
    if (user || status === 'authenticated') return
    if (typeof window !== 'undefined') {
      const h = window.location.hash?.trim()
      if (h && (h.includes('access_token') || h.includes('refresh_token'))) return
    }
    if (status === 'unauthenticated') {
      router.replace('/login?returnUrl=/')
    }
  }, [loading, isNextAuthLoading, user, status, router, oauthProcessing])

  const handleEnterBoard = useCallback((boardId: string) => {
    if (!userNickname) {
      setSelectedBoard(boardId)
      setCurrentView('entry')
    } else {
      setSelectedBoard(boardId)
      setCurrentView('feed')
    }
  }, [])

  const handleEntryComplete = (character: number, nickname: string) => {
    setUserCharacter(character)
    setUserNickname(nickname)
    if (typeof window !== 'undefined' && nickname.trim()) {
      try {
        window.localStorage.setItem('tdb-user-nickname', nickname.trim())
      } catch {}
    }
    setCurrentView('feed')
  }

  const handleBackToHome = () => {
    setCurrentView('home')
    setSelectedBoard(null)
  }

  if (loading || isNextAuthLoading || oauthProcessing) {
    return (
      <main className="min-h-screen bg-midnight-black flex items-center justify-center">
        <p className="text-gray-400">{oauthProcessing ? '로그인 처리 중...' : '로그인 확인 중...'}</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-midnight-black pt-2 safe-top">
      {currentView === 'home' && (
        <TickProvider>
          <HomeDashboard onEnterBoard={handleEnterBoard} />
        </TickProvider>
      )}
      {currentView === 'entry' && selectedBoard && (
        <EntryGate
          boardId={selectedBoard}
          onComplete={handleEntryComplete}
          onClose={() => setCurrentView('home')}
        />
      )}
      {currentView === 'feed' && selectedBoard && hasSession && (
        <PulseFeed
          boardId={selectedBoard}
          userCharacter={userCharacter}
          userNickname={userNickname}
          userId={effectiveUserId}
          onBack={handleBackToHome}
        />
      )}
    </main>
  )
}
