'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { TickProvider } from '@/lib/TickContext'
import HomeDashboard from '@/components/HomeDashboard'
import EntryGate from '@/components/EntryGate'
import PulseFeed from '@/components/PulseFeed'
import { useAuth } from '@/lib/supabase/auth'
import { isSupabaseConfigured } from '@/lib/supabase/client'

export default function DashboardPage() {
  const router = useRouter()
  const { user, loading } = useAuth()
  const { data: nextAuthSession, status: nextAuthStatus } = useSession()
  const useSupabase = isSupabaseConfigured()
  const [currentView, setCurrentView] = useState<'home' | 'entry' | 'feed'>('home')
  const [selectedBoard, setSelectedBoard] = useState<string | null>(null)
  const [userCharacter, setUserCharacter] = useState<number>(0)
  const [userNickname, setUserNickname] = useState<string>('')

  const hasSession = !!user || nextAuthStatus === 'authenticated'
  const effectiveUserId = user?.id ?? (nextAuthSession?.user as { id?: string } | undefined)?.id ?? undefined

  useEffect(() => {
    if (nextAuthStatus === 'loading' && loading) return
    if (hasSession) return
    if (!useSupabase && nextAuthStatus !== 'authenticated') {
      router.replace('/login?returnUrl=/dashboard')
      return
    }
    if (useSupabase && !loading && !user && nextAuthStatus !== 'authenticated') {
      router.replace('/login?returnUrl=/dashboard')
    }
  }, [useSupabase, loading, user, nextAuthStatus, hasSession, router])

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

  if (!hasSession && (loading || nextAuthStatus === 'loading')) {
    return (
      <main className="min-h-screen bg-midnight-black flex items-center justify-center">
        <p className="text-gray-400">로그인 확인 중...</p>
      </main>
    )
  }
  if (!hasSession) {
    return (
      <main className="min-h-screen bg-midnight-black flex items-center justify-center">
        <p className="text-gray-400">로그인이 필요합니다.</p>
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
