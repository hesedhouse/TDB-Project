'use client'

import { useEffect, useState } from 'react'

const MESSAGE = '더 원활한 이용을 위해 외부 브라우저로 연결합니다'
const MESSAGE_DURATION_MS = 1800

/**
 * 카카오톡 인앱 브라우저 감지 시 외부 브라우저(Android: Chrome, iOS: Safari)로 유도.
 * - 이미 외부 브라우저면 아무 동작 안 함.
 * - 짧은 안내 메시지 후 intent(Android) 또는 x-safari-https(iOS)로 이동.
 */
export default function KakaoInAppRedirect() {
  const [overlay, setOverlay] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return

    const ua = navigator.userAgent || ''
    const isKakaoInApp = /KAKAOTALK/i.test(ua)
    if (!isKakaoInApp) return

    const isAndroid = /Android/i.test(ua)
    const isIOS = /iPhone|iPad|iPod/i.test(ua)

    const host = window.location.host
    const path = window.location.pathname + window.location.search + window.location.hash
    const origin = window.location.origin

    const openInExternal = () => {
      setOverlay(true)

      const redirect = () => {
        if (isAndroid) {
          const intentUrl = `intent://${host}${path}#Intent;scheme=https;package=com.android.chrome;end`
          window.location.href = intentUrl
        } else if (isIOS) {
          const safariUrl = `x-safari-https://${origin}${path}`
          window.location.href = safariUrl
        }
      }

      setTimeout(redirect, MESSAGE_DURATION_MS)
    }

    openInExternal()
  }, [])

  if (!overlay) return null

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 p-4"
      role="alert"
      aria-live="polite"
    >
      <p className="text-center text-white text-sm sm:text-base font-medium max-w-[280px]">
        {MESSAGE}
      </p>
    </div>
  )
}
