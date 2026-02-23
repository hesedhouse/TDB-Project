import type { Metadata } from 'next'
import './globals.css'
import ErrorBoundary from '@/components/ErrorBoundary'
import SessionProvider from '@/components/SessionProvider'
import KakaoInAppRedirect from '@/components/KakaoInAppRedirect'

export const metadata: Metadata = {
  title: 'POPPIN',
  description: '7일 후 소멸하는 휘발성 커뮤니티',
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
