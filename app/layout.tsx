import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'TDB - 떴다방',
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
        <div className="app-shell min-h-screen px-3 sm:px-6">{children}</div>
      </body>
    </html>
  )
}
