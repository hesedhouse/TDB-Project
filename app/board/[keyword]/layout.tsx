import type { Metadata } from 'next'

function getBaseUrl(): string {
  const base =
    (typeof process.env.NEXT_PUBLIC_APP_URL === 'string' && process.env.NEXT_PUBLIC_APP_URL.trim()) ||
    (typeof process.env.VERCEL_URL === 'string' && process.env.VERCEL_URL.trim()
      ? `https://${process.env.VERCEL_URL.trim()}`
      : 'http://localhost:3000')
  return base.replace(/\/$/, '')
}

export async function generateMetadata(
  { params }: { params: { keyword: string } }
): Promise<Metadata> {
  const baseUrl = getBaseUrl()
  const rawKeyword = params?.keyword ?? ''
  let keyword = rawKeyword
  try {
    keyword = decodeURIComponent(rawKeyword)
  } catch {}
  keyword = String(keyword).trim()

  const title = '🍿 지금 Poppin 전광판은 내가 접수함!'
  const description = `실시간 트렌드 전광판 Poppin에서 ${keyword} 방을 구경해보세요!`
  const ogImage = `${baseUrl}/api/og/billboard?keyword=${encodeURIComponent(keyword)}`

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [{ url: ogImage, width: 1200, height: 630, alt: `Poppin 전광판 - ${keyword}` }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImage],
    },
  }
}

export default function BoardKeywordLayout({ children }: { children: React.ReactNode }) {
  return children
}

