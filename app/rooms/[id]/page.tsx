import type { Metadata } from 'next'
import { createClient } from '@supabase/supabase-js'
import ShareRedirect from '@/components/ShareRedirect'

type PinnedContent =
  | { type?: 'youtube'; url?: string; start_seconds?: number; end_seconds?: number }
  | { type?: 'image'; url?: string }

function getBaseUrl(): string {
  const base =
    (typeof process.env.NEXT_PUBLIC_APP_URL === 'string' && process.env.NEXT_PUBLIC_APP_URL.trim()) ||
    (typeof process.env.VERCEL_URL === 'string' && process.env.VERCEL_URL.trim()
      ? `https://${process.env.VERCEL_URL.trim()}`
      : 'http://localhost:3000')
  return base.replace(/\/$/, '')
}

function getYouTubeVideoId(url: string): string | null {
  const u = (url ?? '').trim()
  if (!u) return null
  const patterns = [
    /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
    /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
  ]
  for (const p of patterns) {
    const m = u.match(p)
    if (m?.[1]) return m[1]
  }
  return null
}

async function fetchYouTubeOEmbed(url: string): Promise<{ title?: string; thumbnail_url?: string } | null> {
  try {
    const o = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`
    const res = await fetch(o, { cache: 'no-store' })
    if (!res.ok) return null
    const json = (await res.json()) as { title?: string; thumbnail_url?: string }
    return json
  } catch {
    return null
  }
}

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * 공유 전용 SSR 페이지.
 * - 서버에서 boards의 pinned_content(전광판 active 콘텐츠)를 직접 조회
 * - generateMetadata로 og:title/og:image/og:description을 HTML head에 바로 주입
 *
 * 공유 URL: /rooms/[id]?t=timestamp
 */
export async function generateMetadata(
  { params }: { params: { id: string } }
): Promise<Metadata> {
  const baseUrl = getBaseUrl()
  const id = (params?.id ?? '').trim()

  const title = '🍿 지금 Poppin 전광판은 내가 접수함!'
  const fallbackImage = `${baseUrl}/og-image.png`

  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim()
  const key =
    (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim() ||
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim()

  if (!id || !supabaseUrl || !key) {
    const description = '실시간 트렌드 전광판 Poppin을 구경해보세요!'
    return {
      title,
      description,
      openGraph: { title, description, images: [{ url: fallbackImage, width: 1200, height: 630 }] },
      twitter: { card: 'summary_large_image', title, description, images: [fallbackImage] },
    }
  }

  const supabase = createClient(supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data } = await supabase
    .from('boards')
    .select('id, keyword, pinned_content, pinned_until')
    .eq('id', id)
    .maybeSingle()

  const keyword = (data?.keyword ?? '').toString().trim()
  const description = keyword
    ? `실시간 트렌드 전광판 Poppin에서 ${keyword} 방을 구경해보세요!`
    : '실시간 트렌드 전광판 Poppin을 구경해보세요!'

  // 기본은 서버 OG 이미지 API를 사용 (요청 시점 최신 전광판을 반영)
  let ogImage = `${baseUrl}/api/og/billboard?keyword=${encodeURIComponent(keyword)}`
  let ogTitle = title

  // pinned_content가 유효하면, 크롤러 호환성을 위해 og:image를 “직접 이미지 URL”로도 세팅
  const until = data?.pinned_until ? new Date(String(data.pinned_until)) : null
  const isActive = until != null && !Number.isNaN(until.getTime()) && until.getTime() > Date.now()
  const content = (data?.pinned_content ?? null) as PinnedContent | null
  const contentUrl = typeof content?.url === 'string' ? content.url.trim() : ''

  if (isActive && contentUrl) {
    if (content?.type === 'image') {
      ogImage = contentUrl
    } else {
      // YouTube: oEmbed로 제목/썸네일을 서버에서 직접 가져와 head에 주입
      const oembed = await fetchYouTubeOEmbed(contentUrl)
      if (oembed?.title) ogTitle = oembed.title
      if (oembed?.thumbnail_url) ogImage = oembed.thumbnail_url
      else {
        const vid = getYouTubeVideoId(contentUrl)
        if (vid) ogImage = `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`
      }
    }
  }

  return {
    title: ogTitle,
    description,
    openGraph: {
      title: ogTitle,
      description,
      images: [{ url: ogImage, width: 1200, height: 630, alt: keyword ? `Poppin 전광판 - ${keyword}` : 'Poppin 전광판' }],
    },
    twitter: {
      card: 'summary_large_image',
      title: ogTitle,
      description,
      images: [ogImage],
    },
  }
}

export default async function RoomSharePage({ params }: { params: { id: string } }) {
  const baseUrl = getBaseUrl()
  const id = (params?.id ?? '').trim()
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim()
  const key =
    (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim() ||
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim()

  let to = '/'
  if (id && supabaseUrl && key) {
    const supabase = createClient(supabaseUrl, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data } = await supabase.from('boards').select('keyword').eq('id', id).maybeSingle()
    const keyword = (data?.keyword ?? '').toString().trim()
    if (keyword) to = `/board/${encodeURIComponent(keyword)}`
  }

  return (
    <div className="min-h-screen bg-midnight-black text-white flex items-center justify-center p-8">
      <ShareRedirect to={to} />
      <div className="max-w-md w-full rounded-2xl border border-white/10 bg-black/40 p-6 text-center">
        <p className="text-sm text-white/80 mb-3">전광판으로 이동 중…</p>
        <a
          href={to}
          className="inline-flex items-center justify-center px-4 py-2 rounded-xl bg-neon-orange/20 text-neon-orange border border-neon-orange/40 hover:bg-neon-orange/30"
        >
          이동하기
        </a>
        <p className="text-[11px] text-white/45 mt-4">
          공유 미리보기(카톡/인스타)는 이 페이지의 메타데이터를 사용합니다.
        </p>
      </div>
      {/* metadataBase가 없을 때도 안전하도록 baseUrl을 한번 사용 */}
      <link rel="canonical" href={`${baseUrl}/rooms/${encodeURIComponent(id)}`} />
    </div>
  )
}

