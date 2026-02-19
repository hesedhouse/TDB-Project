'use client'

import { useState, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { useAuth } from '@/lib/supabase/auth'

function SignupForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const returnUrl = searchParams.get('returnUrl') ?? '/'
  const { user, loading, signUpWithEmail } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const trimEmail = email.trim()
    const trimPassword = password
    if (!trimEmail || !trimPassword) {
      setError('이메일과 비밀번호를 입력해주세요.')
      return
    }
    if (trimPassword.length < 6) {
      setError('비밀번호는 6자 이상이어야 합니다.')
      return
    }
    setSubmitting(true)
    const result = await signUpWithEmail(trimEmail, trimPassword)
    setSubmitting(false)
    if (result.error === 'already_registered') {
      setError('이미 존재하는 계정입니다.')
      return
    }
    if (result.error) {
      setError(result.error)
      return
    }
    alert('환영합니다! 가입이 완료되었습니다.')
    const path = returnUrl.startsWith('/') ? returnUrl : '/'
    router.replace(path)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <p className="text-gray-400">확인 중...</p>
      </div>
    )
  }

  if (user) {
    const path = returnUrl.startsWith('/') ? returnUrl : '/'
    router.replace(path)
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <p className="text-gray-400">이동 중...</p>
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
        <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1" style={{ textShadow: '0 0 20px rgba(255,107,0,0.3)' }}>
          TDB 떴다방
        </h1>
        <p className="text-gray-400 text-sm mb-6">이메일로 간단 가입</p>

        <form
          onSubmit={handleSubmit}
          className="w-full rounded-2xl p-6 flex flex-col gap-4"
          style={{
            background: 'rgba(18,18,18,0.95)',
            border: '2px solid rgba(255,107,0,0.5)',
            boxShadow: '0 0 28px rgba(255,107,0,0.18), 0 0 48px rgba(255,107,0,0.08), inset 0 0 0 1px rgba(255,107,0,0.1)',
          }}
        >
          <div>
            <label htmlFor="signup-email" className="block text-gray-400 text-sm mb-1.5">이메일</label>
            <input
              id="signup-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              disabled={submitting}
              className="w-full px-4 py-3 rounded-xl bg-black/60 border-2 border-[#FF6B00]/40 focus:border-[#FF6B00] focus:outline-none text-white placeholder-gray-500 text-sm"
            />
          </div>
          <div>
            <label htmlFor="signup-password" className="block text-gray-400 text-sm mb-1.5">비밀번호</label>
            <input
              id="signup-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="6자 이상"
              autoComplete="new-password"
              disabled={submitting}
              className="w-full px-4 py-3 rounded-xl bg-black/60 border-2 border-[#FF6B00]/40 focus:border-[#FF6B00] focus:outline-none text-white placeholder-gray-500 text-sm"
            />
          </div>
          {error && (
            <p className="text-red-400 text-sm text-center">{error}</p>
          )}
          <motion.button
            type="submit"
            disabled={submitting}
            className="w-full py-3.5 rounded-xl font-bold text-base text-white disabled:opacity-50"
            style={{
              background: '#FF6B00',
              boxShadow: '0 0 14px rgba(255,107,0,0.4), 0 0 24px rgba(255,107,0,0.2)',
            }}
            whileHover={!submitting ? { scale: 1.02 } : {}}
            whileTap={!submitting ? { scale: 0.98 } : {}}
          >
            {submitting ? '가입 중...' : '가입하기'}
          </motion.button>
        </form>

        <p className="text-gray-500 text-sm mt-4">
          이미 계정이 있으신가요?{' '}
          <Link href="/login" className="text-[#FF6B00] hover:underline">
            로그인
          </Link>
        </p>
      </motion.div>
    </div>
  )
}

export default function SignupPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <p className="text-gray-400">로딩 중...</p>
      </div>
    }>
      <SignupForm />
    </Suspense>
  )
}
