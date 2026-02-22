import type { Session } from 'next-auth'
import NaverProvider from 'next-auth/providers/naver'
import { SupabaseAdapter } from '@auth/supabase-adapter'
import { createServerClient } from '@/lib/supabase/server'

/** 어댑터(DB)에서 오는 user; 프로바이더에 따라 필드가 유동적이라 넓게 타입 지정 */
type AdapterUser = { id?: string; email?: string | null; name?: string | null; image?: string | null }

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const supabaseSecret = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

export const authOptions = {
  providers: [
    NaverProvider({
      clientId: process.env.NAVER_CLIENT_ID ?? '',
      clientSecret: process.env.NAVER_CLIENT_SECRET ?? '',
    }),
  ],
  adapter:
    supabaseUrl && supabaseSecret
      ? SupabaseAdapter({
          url: supabaseUrl,
          secret: supabaseSecret,
        })
      : undefined,
  callbacks: {
    async session({ session, user }: { session: Session; user: AdapterUser }) {
      if (session?.user) {
        session.user.id = user?.id ?? session.user.id
        session.user.email = session.user.email ?? user?.email ?? null
        session.user.name = session.user.name ?? user?.name ?? null
        session.user.image = session.user.image ?? user?.image ?? null
      }
      return session
    },
    async signIn({ user, account }: { user: AdapterUser; account: { provider?: string } | null }) {
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
  },
  session: { strategy: 'database' as const, maxAge: 30 * 24 * 60 * 60 },
  secret: process.env.NEXTAUTH_SECRET,
}
