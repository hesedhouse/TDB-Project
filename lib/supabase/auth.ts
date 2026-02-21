'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from './client'
import type { User } from '@supabase/supabase-js'

/** Supabase OAuth에서 지원하는 프로바이더만. 네이버는 NextAuth 전용. */
export type AuthProvider = 'kakao' | 'google'

/** URL 해시(#access_token=...&refresh_token=...) 파싱 후 세션 수립. OAuth 콜백 후 호출. */
export async function exchangeHashForSession(): Promise<boolean> {
  if (typeof window === 'undefined') return false
  const hash = window.location.hash?.trim()
  if (!hash || (!hash.includes('access_token') && !hash.includes('refresh_token'))) return false
  const supabase = createClient()
  if (!supabase) return false
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  const access_token = params.get('access_token')
  const refresh_token = params.get('refresh_token')
  if (!access_token) return false
  const { error } = await supabase.auth.setSession({
    access_token,
    refresh_token: refresh_token ?? undefined,
  })
  if (error) {
    if (process.env.NODE_ENV === 'development') console.warn('[auth] exchangeHashForSession:', error.message)
    return false
  }
  try {
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
  } catch {}
  return true
}

/** 로그인 여부·유저·로그인/로그아웃 훅 (클라이언트 전용). onAuthStateChange로 세션 감지. */
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
    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://poppinapps.vercel.app').trim().replace(/\/$/, '')
    const redirectTo = returnUrl ? `${baseUrl}${returnUrl.startsWith('/') ? returnUrl : `/${returnUrl}`}` : `${baseUrl}/`
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
