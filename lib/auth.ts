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
        // 세션 ID는 반드시 public.users.id(UUID). token.sub = 어댑터 user.id(첫 로그인 시 DB insert 후 반환된 UUID)
        let dbUserId: string | undefined = (token?.sub ?? token?.id) as string | undefined
        if (typeof dbUserId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(dbUserId)) {
          // token.sub가 UUID가 아니면(이메일/소셜 ID 등) 이메일로 public.users 조회해 UUID로 교정
          const email = session.user.email ?? token?.email ?? null
          if (email && typeof email === 'string') {
            const supabase = createServerClient()
            if (supabase) {
              const { data: row } = await supabase.from('users').select('id').eq('email', email).maybeSingle()
              const id = (row as { id?: string } | null)?.id
              if (id && typeof id === 'string') dbUserId = id
            }
          }
        }
        session.user.id = dbUserId ?? session.user.id
      }
      return session
    },
    async signIn({ user, account }: { user: AdapterUser; account: { provider?: string } | null }) {
      // 네이버/구글 첫 로그인 시 어댑터가 이미 public.users에 insert 후 user.id = DB UUID로 반환함
      const email = user?.email?.trim()
      if (email) {
        const supabase = createServerClient()
        if (supabase) {
          const { data } = await supabase
            .from('users')
            .select('is_banned')
            .eq('email', email)
            .maybeSingle()
          const row = data as { is_banned?: boolean } | null
          if (row?.is_banned === true) {
            const base = process.env.NEXTAUTH_URL ?? ''
            return `${base}/auth/error?error=Banned`
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
