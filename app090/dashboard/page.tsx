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
  const { data: nextSession, status } = useSession()
  const useSupabase = isSupabaseConfigured()
  const [currentView, setCurrentView] = useState<'home' | 'entry' | 'feed'>('home')
  const [selectedBoard, setSelectedBoard] = useState<string | null>(null)
  const [userCharacter, setUserCharacter] = useState<number>(0)
  const [userNickname, setUserNickname] = useState<string>('')

  const isNextAuthLoading = status === 'loading'
  const isNextAuthAuthenticated = status === 'authenticated'
  const hasSession = !!user || isNextAuthAuthenticated
  // Supabase 이메일 가입 시 NextAuth 세션 없음 → user.id 사용. NextAuth(OAuth) 시 nextSession.user.id 사용.
  const effectiveUserId =
    (user?.id != null && String(user.id).trim() !== '' ? user.id : (nextSession?.user as { id?: string } | undefined)?.id) ?? undefined

  // 보호 라우트: 비로그인 시 로그인 페이지로. 150ms 유예로 가입/로그인 직후 세션 반영 지연 시 쫓아내지 않음
  useEffect(() => {
    if (loading || isNextAuthLoading) return
    if (user || status === 'authenticated') return
    if (status !== 'unauthenticated') return
    const t = setTimeout(() => router.replace('/login?returnUrl=/dashboard'), 150)
    return () => clearTimeout(t)
  }, [loading, isNextAuthLoading, user, status, router])

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

  if (loading || isNextAuthLoading) {
    return (
      <main className="min-h-screen bg-midnight-black flex items-center justify-center">
        <p className="text-gray-400">로그인 확인 중...</p>
      </main>
    )
  }
  if (!user && status !== 'authenticated') {
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
        <div className="h-screen max-h-[100dvh] overflow-hidden flex flex-col">
          <div className="flex-1 min-h-0 min-w-0">
            <PulseFeed
              boardId={selectedBoard}
              userCharacter={userCharacter}
              userNickname={userNickname}
              userId={effectiveUserId}
              onBack={handleBackToHome}
            />
          </div>
        </div>
      )}
    </main>
  )
}
