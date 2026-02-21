import NaverProvider from 'next-auth/providers/naver'
import { SupabaseAdapter } from '@auth/supabase-adapter'
import { createServerClient } from '@/lib/supabase/server'

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
    async session({ session, user }) {
      if (session?.user) {
        session.user.id = user?.id ?? (session.user as { id?: string }).id
        session.user.email = session.user.email ?? (user as { email?: string })?.email ?? null
        session.user.name = session.user.name ?? (user as { name?: string })?.name ?? null
        session.user.image = session.user.image ?? (user as { image?: string })?.image ?? null
      }
      return session
    },
    async signIn({ user, account }) {
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
    redirect: async ({ url }) => {
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
