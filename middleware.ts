import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

/**
 * 보호된 경로(/board/*, /dashboard)에서 NextAuth(getToken)와 요청을 처리.
 * - NextAuth JWT가 있으면 통과.
 * - 없어도 여기서는 리다이렉트하지 않고 next() — Supabase만 로그인한 사용자도 페이지에서 useAuth로 통과할 수 있도록.
 * - 실제 인증 실패 시 리다이렉트는 각 페이지(useAuth + useSession)에서 처리.
 */
export async function middleware(request: NextRequest) {
  await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  })
  return NextResponse.next()
}

export const config = {
  matcher: ['/board/:path*', '/dashboard', '/dashboard/:path*'],
}
