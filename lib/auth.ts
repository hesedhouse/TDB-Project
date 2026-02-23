import type { Session } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import NaverProvider from 'next-auth/providers/naver'
import KakaoProvider from 'next-auth/providers/kakao'
import { SupabaseLocalAdapter } from '@/lib/auth/supabase-local-adapter'
import { createServerClient } from '@/lib/supabase/server'

/** 어댑터(DB)에서 오는 user; 프로바이더에 따라 필드가 유동적이라 넓게 타입 지정 */
type AdapterUser = { id?: string; email?: string | null; name?: string | null; image?: string | null }
/** JWT 전략 시 jwt/session 콜백에 전달되는 token */
type JwtToken = { sub?: string; id?: string; email?: string | null; name?: string | null; picture?: string | null; image?: string | null }

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const supabaseSecret = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

/** 카카오 OAuth: Vercel 환경 변수 KAKAO_CLIENT_ID, KAKAO_CLIENT_SECRET 사용 */
const kakaoClientId = (process.env.KAKAO_CLIENT_ID ?? '').trim()
const kakaoClientSecret = (process.env.KAKAO_CLIENT_SECRET ?? '').trim()
if (!kakaoClientId) {
  console.error('[auth] KAKAO_CLIENT_ID is empty. Set KAKAO_CLIENT_ID (and KAKAO_CLIENT_SECRET) in Vercel Environment Variables for Kakao login.')
}
if (kakaoClientId && !kakaoClientSecret) {
  console.warn('[auth] KAKAO_CLIENT_SECRET is empty. Kakao login may fail without a client secret.')
}

/** public.users.id(UUID) 형식 여부 */
function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
}

export const authOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      allowDangerousEmailAccountLinking: true,
    }),
    NaverProvider({
      clientId: process.env.NAVER_CLIENT_ID ?? '',
      clientSecret: process.env.NAVER_CLIENT_SECRET ?? '',
      allowDangerousEmailAccountLinking: true,
    }),
    KakaoProvider({
      clientId: kakaoClientId,
      clientSecret: kakaoClientSecret,
      allowDangerousEmailAccountLinking: true,
      authorization: {
        params: {
          scope: 'profile_nickname profile_image account_email',
        },
      },
      profile(profile: { id?: number | string; kakao_account?: { email?: string; profile?: { nickname?: string; profile_image_url?: string }; profile_image_url?: string }; properties?: { nickname?: string; profile_image?: string } }) {
        const kakao = profile.kakao_account
        const nickname = kakao?.profile?.nickname ?? profile.properties?.nickname ?? ''
        const image = kakao?.profile?.profile_image_url ?? profile.properties?.profile_image ?? undefined
        // 카카오 id는 숫자형일 수 있음 → 문자열로 통일 (계정 연동용. 실제 DB UUID는 어댑터가 반환)
        const kakaoId = profile.id != null ? String(profile.id) : ''
        return {
          id: kakaoId,
          email: kakao?.email ?? null,
          name: nickname || (kakaoId ? `Kakao_${kakaoId}` : 'Kakao'),
          image: image ?? null,
        }
      },
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
      // 로그인 시점에 user가 있으면 token.id에 DB(public.users) UUID 저장 → 세션에서 사용
      if (user?.id) {
        const t = token as JwtToken
        const uid = String(user.id).trim()
        t.id = uid
        t.sub = uid
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
        // session.user.id = token.id 우선, 없으면 token.sub 사용 → 절대 undefined가 되지 않도록
        const idFromToken = token?.id != null ? String(token.id).trim() : (token?.sub != null ? String(token.sub).trim() : '')
        if (idFromToken && !idFromToken.includes('@')) {
          session.user.id = idFromToken
        } else {
          const email = session.user.email ?? token?.email ?? null
          if (email && typeof email === 'string') {
            const supabase = createServerClient()
            if (supabase) {
              const { data: row } = await supabase.from('users').select('id').eq('email', email).maybeSingle()
              const id = (row as { id?: string } | null)?.id
              if (id != null && String(id).trim() !== '') session.user.id = String(id).trim()
              else session.user.id = idFromToken || undefined
            } else {
              session.user.id = idFromToken || undefined
            }
          } else {
            session.user.id = idFromToken || undefined
          }
        }
      }
      return session
    },
    async signIn({ user, account }: { user: AdapterUser; account: { provider?: string; providerAccountId?: string } | null }) {
      const supabase = createServerClient()
      if (!supabase) return true

      const email = user?.email?.trim()
      // 구글/네이버/카카오 공통: 이메일이 있으면 public.users에 없을 경우 반드시 생성 → 세션에 UUID 부여 가능하도록
      if (email) {
        const { data: existing } = await supabase.from('users').select('id, is_banned').eq('email', email).maybeSingle()
        const row = existing as { id?: string; is_banned?: boolean } | null
        if (row?.is_banned === true) {
          const base = process.env.NEXTAUTH_URL ?? ''
          return `${base}/auth/error?error=Banned`
        }
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

      // 네이버: profiles 테이블 동기화 (signIn 시점의 user.id는 어댑터 반환 후가 아니면 provider id일 수 있음 → UUID일 때만)
      if (account?.provider === 'naver' && user?.id && isUuid(String(user.id))) {
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
      return true
    },
    redirect: async ({ url, baseUrl }: { url: string; baseUrl: string }) => {
      // 현재 요청의 baseUrl(현재 도메인) 사용 — .vercel.app 하드코딩 제거
      if (url?.startsWith('/')) return `${baseUrl}${url}`
      if (url && (url === baseUrl || url.startsWith(`${baseUrl}/`))) return url
      return `${baseUrl}/`
    },
  },
  pages: {
    signIn: '/login',
    error: '/auth/error',
  },
  session: { strategy: 'jwt' as const, maxAge: 30 * 24 * 60 * 60 },
  secret: process.env.NEXTAUTH_SECRET,
}
