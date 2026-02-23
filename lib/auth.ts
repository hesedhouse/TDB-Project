import type { Session } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import NaverProvider from 'next-auth/providers/naver'
import { SupabaseLocalAdapter } from '@/lib/auth/supabase-local-adapter'
import { createServerClient } from '@/lib/supabase/server'

/** 어댑터(DB)에서 오는 user; 프로바이더에 따라 필드가 유동적이라 넓게 타입 지정 */
type AdapterUser = { id?: string; email?: string | null; name?: string | null; image?: string | null }
/** JWT 전략 시 jwt/session 콜백에 전달되는 token */
type JwtToken = { sub?: string; id?: string; email?: string | null; name?: string | null; picture?: string | null; image?: string | null }

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const supabaseSecret = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

export const authOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    }),
    NaverProvider({
      clientId: process.env.NAVER_CLIENT_ID ?? '',
      clientSecret: process.env.NAVER_CLIENT_SECRET ?? '',
    }),
  ],
  adapter:
    supabaseUrl && supabaseSecret
      ? SupabaseLocalAdapter({
          url: supabaseUrl,
          secret: supabaseSecret,
        })
      : undefined,
  callbacks: {
    async jwt({ token, user }: { token: JwtToken; user?: AdapterUser; account?: { provider?: string } | null }) {
      // 로그인 시 user는 어댑터가 반환한 public.users 행 → user.id는 DB UUID (네이버/구글 등 소셜 ID 아님)
      if (user?.id) {
        const t = token as JwtToken
        t.sub = t.id = user.id
        t.email = user.email ?? t.email
        t.name = user.name ?? t.name
        t.picture = user.image ?? t.picture
      }
      return token
    },
    async session({ session, token }: { session: Session; token: JwtToken }) {
      if (session?.user) {
        session.user.email = session.user.email ?? token?.email ?? null
        session.user.name = session.user.name ?? token?.name ?? null
        session.user.image = session.user.image ?? token?.picture ?? token?.image ?? null
        // session.user.id는 반드시 public.users.id(UUID). token.sub와 동일한 UUID가 되도록 보장 (이메일/구글 ID 금지).
        const tokenSub = token?.sub != null && token.sub !== '' ? String(token.sub).trim() : undefined
        const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
        if (tokenSub && isUuid(tokenSub)) {
          session.user.id = tokenSub
        } else {
          const email = session.user.email ?? token?.email ?? null
          if (email && typeof email === 'string') {
            const supabase = createServerClient()
            if (supabase) {
              const { data: row } = await supabase.from('users').select('id').eq('email', email).maybeSingle()
              const id = (row as { id?: string } | null)?.id
              if (id && typeof id === 'string') session.user.id = id
              else session.user.id = tokenSub ?? session.user.id
            } else {
              session.user.id = tokenSub ?? session.user.id
            }
          } else {
            session.user.id = tokenSub ?? session.user.id
          }
        }
      }
      return session
    },
    async signIn({ user, account }: { user: AdapterUser; account: { provider?: string } | null }) {
      const email = user?.email?.trim()
      if (email) {
        const supabase = createServerClient()
        if (supabase) {
          const { data: existing } = await supabase.from('users').select('id, is_banned').eq('email', email).maybeSingle()
          const row = existing as { id?: string; is_banned?: boolean } | null
          if (row?.is_banned === true) {
            const base = process.env.NEXTAUTH_URL ?? ''
            return `${base}/auth/error?error=Banned`
          }
          // 구글/네이버 등 첫 로그인 시 public.users에 없으면 insert → 로그인 완료 시점에 반드시 행 존재 (23503 방지)
          if (!row?.id) {
            await supabase.from('users').upsert(
              {
                email,
                name: user?.name ?? null,
                image: user?.image ?? null,
                emailVerified: (user as { emailVerified?: Date | null })?.emailVerified?.toISOString?.() ?? null,
              },
              { onConflict: 'email' }
            )
          }
        }
      }
      if (account?.provider === 'naver' && user?.id) {
        const supabase = createServerClient()
        if (supabase) {
          await supabase.from('profiles').upsert(
            {
              id: user.id,
              email: user.email ?? null,
              name: user.name ?? null,
              image: user.image ?? null,
              provider: 'naver',
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'id' }
          )
        }
      }
      return true
    },
    redirect: async ({ url, baseUrl }: { url: string; baseUrl: string }) => {
      const dashboardUrl = 'https://poppinapps.vercel.app/dashboard'
      if (url && (url === dashboardUrl || url.startsWith('https://poppinapps.vercel.app/'))) return url
      if (url?.startsWith('/')) return `${process.env.NEXTAUTH_URL ?? 'https://poppinapps.vercel.app'}${url}`
      return dashboardUrl
    },
  },
  pages: {
    signIn: '/login',
    error: '/auth/error',
  },
  session: { strategy: 'jwt' as const, maxAge: 30 * 24 * 60 * 60 },
  secret: process.env.NEXTAUTH_SECRET,
}
