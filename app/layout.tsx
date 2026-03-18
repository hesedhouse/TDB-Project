import type { Metadata } from 'next'
import './globals.css'
import ErrorBoundary from '@/components/ErrorBoundary'
import SessionProvider from '@/components/SessionProvider'
import KakaoInAppRedirect from '@/components/KakaoInAppRedirect'

const baseUrl =
  typeof process.env.NEXT_PUBLIC_APP_URL === 'string' && process.env.NEXT_PUBLIC_APP_URL
    ? process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000'

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: '팝핀(Poppin) | 지금 다들 뭐 봐? 실시간 핫플 🔥',
  description:
    '핫한 소식 찾아 헤매지 마! 지금 가장 힙한 정보만 모아서 다 같이 수다 떠는 중💬 모래시계 터지기 전에 막차 탑승 가보자고!',
  openGraph: {
    type: 'website',
    siteName: '팝핀 (Poppin)',
    title: '팝핀(Poppin) | 지금 다들 뭐 봐? 실시간 핫플 🔥',
    description:
      '핫한 소식 찾아 헤매지 마! 지금 가장 힙한 정보만 모아서 다 같이 수다 떠는 중💬 모래시계 터지기 전에 막차 탑승 가보자고!',
    images: [
      {
        url: 'https://poppinapps.com/og-main.png',
        width: 1200,
        height: 630,
        alt: '팝핀 - 실시간 정보와 수다',
      },
    ],
    locale: 'ko_KR',
  },
  twitter: {
    card: 'summary_large_image',
    title: '팝핀(Poppin) | 지금 다들 뭐 봐? 실시간 핫플 🔥',
    description:
      '핫한 소식 찾아 헤매지 마! 지금 가장 힙한 정보만 모아서 다 같이 수다 떠는 중💬 모래시계 터지기 전에 막차 탑승 가보자고!',
    images: ['https://poppinapps.com/og-main.png'],
  },
}

export const viewport = {
  themeColor: '#000000',
  colorScheme: 'dark',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko">
      <body className="bg-midnight-black min-h-screen">
        <ErrorBoundary>
          <SessionProvider>
            <KakaoInAppRedirect />
            <div className="app-shell min-h-screen px-3 sm:px-6">{children}</div>
          </SessionProvider>
        </ErrorBoundary>
      </body>
    </html>
  )
}
