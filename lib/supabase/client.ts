import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'

let supabaseInstance: SupabaseClient | null = null

/**
 * Supabase 클라이언트 싱글톤. 앱 전체에서 한 인스턴스만 사용해 "Multiple GoTrueClient" 경고를 방지합니다.
 */
export function createClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) return null
  if (supabaseInstance) return supabaseInstance
  supabaseInstance = createSupabaseClient(url, anonKey)
  return supabaseInstance
}

export function isSupabaseConfigured(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
}

/** Supabase boards.id 등 UUID 컬럼 형식 검증 (400 에러 방지) */
export function isValidUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
}
