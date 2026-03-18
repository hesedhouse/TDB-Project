import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

type PinnedContent =
  | { type?: 'youtube'; url?: string; start_seconds?: number; end_seconds?: number }
  | { type?: 'image'; url?: string }

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

function getBaseUrl(req: Request): string {
  const env =
    (typeof process.env.NEXT_PUBLIC_APP_URL === 'string' && process.env.NEXT_PUBLIC_APP_URL.trim()) ||
    (typeof process.env.VERCEL_URL === 'string' && process.env.VERCEL_URL.trim()
      ? `https://${process.env.VERCEL_URL.trim()}`
      : '')
  if (env) return env.replace(/\/$/, '')
  const u = new URL(req.url)
  return `${u.protocol}//${u.host}`
}

/**
 * OG 이미지용 endpoint.
 * - 현재 보드의 pinned_content(전광판 active_content)를 조회해
 * - YouTube면 썸네일 URL로, image면 해당 이미지 URL로 302 redirect
 *
 * 사용: /api/og/billboard?keyword=<방키워드>
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const keyword = (searchParams.get('keyword') ?? '').trim()

  const baseUrl = getBaseUrl(req)
  const fallback = new URL('/og-image.png', baseUrl).toString()

  if (!keyword) {
    return NextResponse.redirect(fallback, { status: 302 })
  }

  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim()
  const key =
    (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim() ||
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim()

  if (!supabaseUrl || !key) {
    return NextResponse.redirect(fallback, { status: 302 })
  }

  const supabase = createClient(supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data, error } = await supabase
    .from('boards')
    .select('pinned_content, pinned_until')
    .eq('keyword', keyword)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data?.pinned_content || !data?.pinned_until) {
    return NextResponse.redirect(fallback, {
      status: 302,
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    })
  }

  const until = new Date(String(data.pinned_until))
  if (Number.isNaN(until.getTime()) || until.getTime() <= Date.now()) {
    return NextResponse.redirect(fallback, {
      status: 302,
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    })
  }

  const content = data.pinned_content as PinnedContent
  const url = typeof content?.url === 'string' ? content.url.trim() : ''
  if (!url) {
    return NextResponse.redirect(fallback, {
      status: 302,
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    })
  }

  const type = content?.type
  if (type === 'image') {
    return NextResponse.redirect(url, {
      status: 302,
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    })
  }

  // youtube or inferred youtube
  const videoId = getYouTubeVideoId(url)
  if (videoId) {
    // hqdefault: 대부분 안정적으로 존재
    const thumb = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
    return NextResponse.redirect(thumb, {
      status: 302,
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    })
  }

  return NextResponse.redirect(fallback, {
    status: 302,
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  })
}

