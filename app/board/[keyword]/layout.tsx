import type { Metadata } from 'next'

const OG_MAIN_URL = 'https://poppinapps.com/og-main.png'

export async function generateMetadata(
  { params }: { params: { keyword: string } }
): Promise<Metadata> {
  const rawKeyword = params?.keyword ?? ''
  let keyword = rawKeyword
  try {
    keyword = decodeURIComponent(rawKeyword)
  } catch {}
  keyword = String(keyword).trim()

  const title = '🍿 지금 Poppin 전광판은 내가 접수함!'
  const description = `실시간 트렌드 전광판 Poppin에서 ${keyword} 방을 구경해보세요!`

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [{ url: OG_MAIN_URL, width: 1200, height: 630, alt: `Poppin 전광판 - ${keyword}` }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [OG_MAIN_URL],
    },
  }
}

export default function BoardKeywordLayout({ children }: { children: React.ReactNode }) {
  return children
}

