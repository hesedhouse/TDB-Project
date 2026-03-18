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

const OG_MAIN_URL = 'https://poppinapps.com/og-main.png'
const OG_TITLE = '🍿 지금 Poppin 전광판은 내가 접수함!'
const OG_DESCRIPTION_BASE = '실시간 트렌드 전광판 Poppin에서 '

/**
 * 공유 전용 SSR 페이지.
 * - 서버에서 boards의 pinned_content(전광판 active 콘텐츠)를 직접 조회
 * - generateMetadata로 og:title/og:image/og:description을 HTML head에 바로 주입
 *
 * 공유 URL: /rooms/[id]?t=timestamp
 */
export async function generateMetadata(
  {
    params,
    searchParams,
  }: { params: { id: string }; searchParams?: { v?: string } }
): Promise<Metadata> {
  const baseUrl = getBaseUrl()
  const id = (params?.id ?? '').trim()
  const v = searchParams?.v ?? ''
  const pageUrl = `${baseUrl}/rooms/${encodeURIComponent(id)}${v ? `?v=${encodeURIComponent(v)}` : ''}`

  const title = OG_TITLE

  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim()
  const key =
    (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim() ||
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim()

  if (!id || !supabaseUrl || !key) {
    const description = '실시간 트렌드 전광판 Poppin을 구경해보세요!'
    return {
      title,
      description,
      openGraph: { title, description, images: [{ url: OG_MAIN_URL, width: 1200, height: 630 }] },
      twitter: { card: 'summary_large_image', title, description, images: [OG_MAIN_URL] },
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
    ? `${OG_DESCRIPTION_BASE}${keyword} 방을 구경해보세요!`
    : '실시간 트렌드 전광판 Poppin을 구경해보세요!'

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [{ url: OG_MAIN_URL, width: 1200, height: 630, alt: keyword ? `Poppin 전광판 - ${keyword}` : 'Poppin 전광판' }],
      url: pageUrl,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [OG_MAIN_URL],
    },
    alternates: { canonical: pageUrl },
  }
}

export default async function RoomSharePage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams?: { v?: string }
}) {
  const baseUrl = getBaseUrl()
  const id = (params?.id ?? '').trim()
  const v = searchParams?.v ?? ''
  const pageUrl = `${baseUrl}/rooms/${encodeURIComponent(id)}${v ? `?v=${encodeURIComponent(v)}` : ''}`
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
      <link rel="canonical" href={pageUrl} />
    </div>
  )
}

