import { createClient } from '@supabase/supabase-js'

/**
 * 서버 전용 Supabase 클라이언트 (API Routes, Server Components).
 * SUPABASE_SERVICE_ROLE_KEY 사용 — RLS 우회, NextAuth 어댑터·프로필 동기화용.
 */
export function createServerClient() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim()
  const secret = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim()
  if (!url || !secret) return null
  return createClient(url, secret)
}
