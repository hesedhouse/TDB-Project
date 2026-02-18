'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { useAuth, type AuthProvider } from '@/lib/supabase/auth'

export default function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const returnUrl = searchParams.get('returnUrl') ?? '/'
  const { user, loading, signIn } = useAuth()

  useEffect(() => {
    if (loading) return
    if (user) {
      const path = returnUrl.startsWith('/') ? returnUrl : '/'
      router.replace(path)
    }
  }, [user, loading, returnUrl, router])

  const handleLogin = async (provider: AuthProvider) => {
    await signIn(provider, returnUrl)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <p className="text-gray-400">로그인 확인 중...</p>
      </div>
    )
  }

  if (user) {
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
        <p className="text-gray-400 text-sm mb-8">로그인 후 방을 만들고 대화에 참여하세요</p>

        <div className="w-full rounded-2xl p-6 flex flex-col gap-3" style={{
          background: 'rgba(18,18,18,0.95)',
          border: '2px solid rgba(255,107,0,0.5)',
          boxShadow: '0 0 28px rgba(255,107,0,0.18), 0 0 48px rgba(255,107,0,0.08), inset 0 0 0 1px rgba(255,107,0,0.1)',
        }}>
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
            onClick={() => handleLogin('naver')}
            className="w-full py-3.5 rounded-xl font-semibold text-base flex items-center justify-center gap-3 text-white"
            style={{ background: '#03C75A', boxShadow: '0 2px 12px rgba(3,199,90,0.35)' }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <span className="text-xl" aria-hidden>N</span>
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
