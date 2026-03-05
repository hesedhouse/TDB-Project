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
  // Supabase 이메일 가입 시 NextAuth 세션 없음 → user.id 사용. NextAuth(OAuth) 시 nextSession.user.id 사용.
  const effectiveUserId =
    (user?.id != null && String(user.id).trim() !== '' ? user.id : (nextSession?.user as { id?: string } | undefined)?.id) ?? undefined
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

  // 보호 라우트: 비로그인 시 로그인 페이지로. 150ms 유예로 가입/로그인 직후 세션 반영 지연 시 쫓아내지 않음
  useEffect(() => {
    if (loading || isNextAuthLoading || oauthProcessing) return
    if (user || status === 'authenticated') return
    if (typeof window !== 'undefined') {
      const h = window.location.hash?.trim()
      if (h && (h.includes('access_token') || h.includes('refresh_token'))) return
    }
    if (status !== 'unauthenticated') return
    const t = setTimeout(() => router.replace('/login?returnUrl=/'), 150)
    return () => clearTimeout(t)
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
    <main className="min-h-screen bg-midnight-black pt-2 safe-top flex flex-col">
      {currentView === 'home' && (
        <>
          <div className="flex-1 min-h-0">
            <TickProvider>
              <HomeDashboard onEnterBoard={handleEnterBoard} />
            </TickProvider>
          </div>
          <footer className="flex-shrink-0 w-full bg-slate-100 text-slate-500 p-4 text-xs sm:text-sm text-center">
            <div className="max-w-2xl mx-auto space-y-1 flex flex-col items-center">
              <p><strong className="text-slate-600">상호</strong> 헤세드하우스</p>
              <p><strong className="text-slate-600">대표자</strong> 이현우</p>
              <p><strong className="text-slate-600">사업자등록번호</strong> 2019-고양일산서-</p>
              <p><strong className="text-slate-600">통신판매업신고번호</strong> 제 202X-서울XX-0000호</p>
              <p><strong className="text-slate-600">영업소 소재지</strong> 경기도 고양시 일산서구 덕이로 24</p>
              <p><strong className="text-slate-600">이메일</strong> support@poppinapps.com</p>
              <p><strong className="text-slate-600">전화번호</strong> 031-994-7740</p>
            </div>
          </footer>
        </>
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
