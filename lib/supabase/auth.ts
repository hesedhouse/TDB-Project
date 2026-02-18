'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from './client'
import type { User } from '@supabase/supabase-js'

export type AuthProvider = 'kakao' | 'naver' | 'google'

/** 로그인 여부·유저·로그인/로그아웃 훅 (클라이언트 전용) */
export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    if (!supabase) {
      setLoading(false)
      return
    }
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  const signIn = useCallback(async (provider: AuthProvider, returnUrl?: string) => {
    const supabase = createClient()
    if (!supabase) return
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    const redirectTo = returnUrl ? `${origin}${returnUrl}` : `${origin}/`
    await supabase.auth.signInWithOAuth({
      provider: provider as any,
      options: { redirectTo },
    })
  }, [])

  const signOut = useCallback(async () => {
    const supabase = createClient()
    if (!supabase) return
    await supabase.auth.signOut()
  }, [])

  /** 이메일·비밀번호 로그인 */
  const signInWithEmail = useCallback(async (email: string, password: string) => {
    const supabase = createClient()
    if (!supabase) return { error: 'Supabase not configured' }
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { error: error.message }
    return { data, error: null }
  }, [])

  /**
   * 이메일 회원가입. 이메일 인증 비활성화 시 가입 즉시 세션이 생성될 수 있음.
   * 이미 가입된 이메일이면 { error: 'already_registered' } 반환.
   */
  const signUpWithEmail = useCallback(async (email: string, password: string) => {
    const supabase = createClient()
    if (!supabase) return { error: 'Supabase not configured' }
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: undefined },
    })
    if (error) {
      const msg = error.message?.toLowerCase() ?? ''
      if (msg.includes('already') || msg.includes('registered') || error.message?.includes('already been registered'))
        return { error: 'already_registered' }
      return { error: error.message }
    }
    // 인증 비활성화 시 세션이 올 수 있음. 없으면 로그인 시도로 즉시 로그인 처리
    if (data.session) return { data, error: null }
    const signInRes = await supabase.auth.signInWithPassword({ email, password })
    if (signInRes.data.session) return { data: signInRes.data, error: null }
    return { data, error: null }
  }, [])

  return { user, loading, signIn, signOut, signInWithEmail, signUpWithEmail }
}
