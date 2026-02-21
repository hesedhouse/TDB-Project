'use client'

import { useEffect, useState, useRef, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { signIn, useSession } from 'next-auth/react'
import { useAuth, exchangeHashForSession, type AuthProvider } from '@/lib/supabase/auth'

const cardStyle = {
  background: 'rgba(18,18,18,0.95)',
  border: '2px solid rgba(255,107,0,0.5)',
  boxShadow: '0 0 28px rgba(255,107,0,0.18), 0 0 48px rgba(255,107,0,0.08), inset 0 0 0 1px rgba(255,107,0,0.1)',
} as const

const DASHBOARD_PATH = '/dashboard'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const returnUrl = searchParams.get('returnUrl') ?? DASHBOARD_PATH
  const { user, loading, signIn: signInSupabase, signInWithEmail } = useAuth()
  const { data: nextAuthSession, status: nextAuthStatus } = useSession()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [emailSubmitting, setEmailSubmitting] = useState(false)
  const [oauthProcessing, setOauthProcessing] = useState(false)
  const hashHandledRef = useRef(false)

  // OAuth 콜백: URL 해시에 토큰이 있으면 파싱 후 세션 수립
  useEffect(() => {
    if (hashHandledRef.current || typeof window === 'undefined') return
    const hash = window.location.hash?.trim()
    if (!hash || (!hash.includes('access_token') && !hash.includes('refresh_token'))) return
    hashHandledRef.current = true
    setOauthProcessing(true)
    exchangeHashForSession().catch(() => setOauthProcessing(false))
  }, [])

  // 세션 생기면 대시보드로 리다이렉트 (Supabase user 또는 NextAuth 세션)
  useEffect(() => {
    if (nextAuthStatus === 'authenticated') {
      const path = returnUrl.startsWith('/') ? returnUrl : DASHBOARD_PATH
      router.replace(path)
      return
    }
    if (loading) return
    if (user) {
      const path = returnUrl.startsWith('/') ? returnUrl : DASHBOARD_PATH
      router.replace(path)
    }
  }, [user, loading, nextAuthStatus, nextAuthSession, returnUrl, router])

  const handleLogin = async (provider: AuthProvider) => {
    await signInSupabase(provider, DASHBOARD_PATH)
  }

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const trimEmail = email.trim()
    if (!trimEmail || !password) {
      setError('이메일과 비밀번호를 입력해주세요.')
      return
    }
    setEmailSubmitting(true)
    const result = await signInWithEmail(trimEmail, password)
    setEmailSubmitting(false)
    if (result.error) {
      setError(result.error)
      return
    }
    const path = returnUrl.startsWith('/') ? returnUrl : DASHBOARD_PATH
    router.replace(path)
  }

  const showOAuthLoading = oauthProcessing || (typeof window !== 'undefined' && window.location.hash?.includes('access_token') && loading)

  const hasSession = !!user || nextAuthStatus === 'authenticated'

  if ((loading && nextAuthStatus !== 'authenticated') && !oauthProcessing) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center gap-4">
        <p className="text-gray-400">로그인 확인 중...</p>
      </div>
    )
  }

  if (hasSession) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center gap-4">
        <p className="text-gray-400">이동 중...</p>
      </div>
    )
  }

  if (showOAuthLoading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center gap-6 p-6">
        <div className="flex items-center gap-1" aria-hidden>
          <motion.span
            className="w-2 h-6 rounded-full bg-[#FF6B00]"
            animate={{ scaleY: [1, 0.4, 1] }}
            transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 0.1 }}
          />
          <motion.span
            className="w-2 h-6 rounded-full bg-[#FF6B00]"
            animate={{ scaleY: [0.4, 1, 0.4] }}
            transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 0.1 }}
          />
          <motion.span
            className="w-2 h-6 rounded-full bg-[#FF6B00]"
            animate={{ scaleY: [1, 0.4, 1] }}
            transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 0.1 }}
          />
        </div>
        <p className="text-[#FF6B00]/90 font-medium">로그인 중입니다...</p>
      </div>
    )
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-6 safe-bottom"
      style={{ background: 'linear-gradient(180deg, #0a0a0a 0%, #111 50%, #0a0a0a 100%)' }}
    >
      <motion.div
        className="w-full max-w-sm flex flex-col items-center"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <h1 className="text-2xl sm:text-3xl font-black text-white mb-1 tracking-tight" style={{ textShadow: '0 0 20px rgba(255,107,0,0.3)' }}>
          POPPIN
        </h1>
        <p className="text-gray-400 text-sm mb-6">로그인 후 방을 만들고 대화에 참여하세요</p>

        {/* 이메일·비밀번호 로그인 */}
        <form onSubmit={handleEmailLogin} className="w-full rounded-2xl p-6 flex flex-col gap-4 mb-4" style={cardStyle}>
          <p className="text-center text-gray-300 text-sm mb-1">이메일로 로그인</p>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="이메일"
            autoComplete="email"
            disabled={emailSubmitting}
            className="w-full px-4 py-3 rounded-xl bg-black/60 border-2 border-[#FF6B00]/40 focus:border-[#FF6B00] focus:outline-none text-white placeholder-gray-500 text-sm"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="비밀번호"
            autoComplete="current-password"
            disabled={emailSubmitting}
            className="w-full px-4 py-3 rounded-xl bg-black/60 border-2 border-[#FF6B00]/40 focus:border-[#FF6B00] focus:outline-none text-white placeholder-gray-500 text-sm"
          />
          {error && <p className="text-red-400 text-sm text-center">{error}</p>}
          <motion.button
            type="submit"
            disabled={emailSubmitting}
            className="w-full py-3.5 rounded-xl font-bold text-base text-white disabled:opacity-50"
            style={{ background: '#FF6B00', boxShadow: '0 0 14px rgba(255,107,0,0.4)' }}
            whileHover={!emailSubmitting ? { scale: 1.02 } : {}}
            whileTap={!emailSubmitting ? { scale: 0.98 } : {}}
          >
            {emailSubmitting ? '로그인 중...' : '로그인'}
          </motion.button>
          <p className="text-gray-500 text-sm text-center">
            계정이 없으신가요?{' '}
            <Link href="/signup" className="text-[#FF6B00] hover:underline">
              가입하기
            </Link>
          </p>
        </form>

        <div className="w-full rounded-2xl p-6 flex flex-col gap-3" style={cardStyle}>
          <p className="text-center text-gray-300 text-sm mb-2">소셜 계정으로 로그인</p>

          <motion.button
            type="button"
            onClick={() => handleLogin('google')}
            className="w-full py-3.5 rounded-xl font-semibold text-base flex items-center justify-center gap-3 bg-white text-gray-800 border border-gray-200"
            style={{ boxShadow: '0 2px 12px rgba(255,255,255,0.2), 0 0 0 1px rgba(255,107,0,0.15)' }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <span className="text-xl" aria-hidden>G</span>
            구글로 로그인
          </motion.button>

          <motion.button
            type="button"
            onClick={() => handleLogin('kakao')}
            className="w-full py-3.5 rounded-xl font-semibold text-base flex items-center justify-center gap-3 text-[#1a1a1a]"
            style={{ background: '#FEE500', boxShadow: '0 2px 12px rgba(254,229,0,0.35)' }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <span className="text-xl" aria-hidden>💬</span>
            카카오로 로그인
          </motion.button>

          <motion.button
            type="button"
            onClick={() => signIn('naver', { callbackUrl: '/dashboard' })}
            className="w-full py-3.5 rounded-xl font-semibold text-base flex items-center justify-center gap-3 text-white"
            style={{ background: '#03C75A', boxShadow: '0 2px 12px rgba(3,199,90,0.35)' }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            aria-label="네이버로 로그인"
          >
            <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center" aria-hidden>
              <svg viewBox="0 0 24 24" className="w-full h-full" fill="currentColor">
                <path d="M16.273 12.845 7.376 0H0v24h7.727V11.155L16.624 24H24V0h-7.727v12.845z" />
              </svg>
            </span>
            네이버로 로그인
          </motion.button>
        </div>

        <p className="text-gray-500 text-xs mt-6 text-center">
          로그인 시 서비스 이용약관에 동의하게 됩니다.
        </p>
      </motion.div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <p className="text-gray-400">로딩 중...</p>
      </div>
    }>
      <LoginForm />
    </Suspense>
  )
}
