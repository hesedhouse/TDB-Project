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
      provider,
      options: { redirectTo },
    })
  }, [])

  const signOut = useCallback(async () => {
    const supabase = createClient()
    if (!supabase) return
    await supabase.auth.signOut()
  }, [])

  return { user, loading, signIn, signOut }
}
