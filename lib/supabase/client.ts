import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'

let supabaseInstance: SupabaseClient | null = null

/**
 * Supabase API 키는 .env.local 에만 정의하고, 여기서는 Next.js가 로드한 process.env 만 사용합니다.
 * .env.example 은 참조하지 않습니다. (No API key found 시: 루트 .env.local 확인 후 dev 서버 재시작)
 */
function getSupabaseEnv(): { url: string; anonKey: string } | null {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim()
  const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim()
  const hasUrl = url.length > 0
  const hasKey = anonKey.length > 0
  if (!hasUrl || !hasKey) {
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
      console.warn(
        '[Supabase] env 누락: NEXT_PUBLIC_SUPABASE_URL 또는 NEXT_PUBLIC_SUPABASE_ANON_KEY 가 비어 있습니다.',
        { hasUrl, hasKey }
      )
      console.warn('[Supabase] 프로젝트 루트의 .env.local 에 값을 넣고 dev 서버를 재시작하세요.')
    }
    return null
  }
  return { url, anonKey }
}

/**
 * Supabase 클라이언트 싱글톤.
 * - .env.local 의 URL·anon key 가 있어야 하며, 없으면 null 반환 (No API key found 방지).
 */
export function createClient(): SupabaseClient | null {
  try {
    const env = getSupabaseEnv()
    if (!env) {
      supabaseInstance = null
      return null
    }
    if (supabaseInstance) return supabaseInstance
    supabaseInstance = createSupabaseClient(env.url, env.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
    return supabaseInstance
  } catch (e) {
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
      console.warn('[Supabase] createClient 실패:', e)
    }
    supabaseInstance = null
    return null
  }
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseEnv() !== null
}

/** Supabase boards.id 등 UUID 컬럼 형식 검증 (400 에러 방지) */
export function isValidUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
}
