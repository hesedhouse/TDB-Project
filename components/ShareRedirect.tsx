'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function ShareRedirect({ to }: { to: string }) {
  const router = useRouter()
  useEffect(() => {
    if (!to) return
    // OG 크롤러는 JS를 실행하지 않으므로, 실제 유저에게만 빠르게 본문 페이지로 이동시킴
    router.replace(to)
  }, [router, to])
  return null
}

