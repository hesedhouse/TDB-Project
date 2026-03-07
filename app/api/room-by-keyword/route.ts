import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000
const MIN_DURATION_SEC = 3 * 60
const MAX_DURATION_SEC = 10 * 60

function parseDuration(duration: string): number {
  const s = (duration ?? '').trim()
  if (!s || !s.startsWith('PT')) return 0
  let sec = 0
  const hours = s.match(/(\d+)H/i)
  const mins = s.match(/(\d+)M/i)
  const secs = s.match(/(\d+)S/i)
  if (hours) sec += Number(hours[1]) * 3600
  if (mins) sec += Number(mins[1]) * 60
  if (secs) sec += Number(secs[1])
  return sec
}

async function findYouTubeVideoForKeyword(keyword: string): Promise<string | null> {
  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) return null
  try {
    const searchRes = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=${encodeURIComponent(keyword)}&maxResults=15&key=${apiKey}`
    )
    if (!searchRes.ok) return null
    const searchJson = await searchRes.json()
    const items = (searchJson.items ?? []) as { id?: { videoId?: string } }[]
    const videoIds = items.map((i) => i.id?.videoId).filter(Boolean) as string[]
    if (videoIds.length === 0) return null

    const videosRes = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,statistics&id=${videoIds.slice(0, 15).join(',')}&key=${apiKey}`
    )
    if (!videosRes.ok) return null
    const videosJson = await videosRes.json()
    const videos = (videosJson.items ?? []) as {
      id: string
      contentDetails?: { duration?: string }
      statistics?: { viewCount?: string }
    }[]
    const withDuration = videos
      .map((v) => ({
        id: v.id,
        durationSec: parseDuration(v.contentDetails?.duration ?? ''),
        viewCount: parseInt(v.statistics?.viewCount ?? '0', 10) || 0,
      }))
      .filter((v) => v.durationSec >= MIN_DURATION_SEC && v.durationSec <= MAX_DURATION_SEC)
      .sort((a, b) => b.viewCount - a.viewCount)
    const best = withDuration[0]
    return best ? `https://www.youtube.com/watch?v=${best.id}` : null
  } catch {
    return null
  }
}

/**
 * 플로팅 태그 클릭: 활성 방 검색 → 없으면 1주일 만료 방 생성 + 유튜브 자동 검색 후 전광판 세팅 → 입장 경로 반환.
 * POST body: { keyword: string }
 */
export async function POST(request: Request) {
  try {
    let body: { keyword?: string }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }
    const keyword = (body?.keyword ?? '').toString().trim()
    if (!keyword) {
      return NextResponse.json({ error: 'keyword required' }, { status: 400 })
    }

    const supabase = createServerClient()
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })
    }

    const now = new Date().toISOString()

    const { data: existing } = await supabase
      .from('boards')
      .select('id, keyword, name, expires_at, public_id')
      .eq('keyword', keyword)
      .gt('expires_at', now)
      .order('expires_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existing) {
      const row = existing as { id: string; keyword: string; public_id?: number | null }
      const path = row.public_id != null ? `/board/${row.public_id}` : `/board/${encodeURIComponent(row.keyword)}`
      return NextResponse.json({ ok: true, path, isNew: false })
    }

    const expiresAt = new Date(Date.now() + ONE_WEEK_MS).toISOString()
    const name = `#${keyword}`
    const { data: inserted, error: insertErr } = await supabase
      .from('boards')
      .insert({
        keyword,
        name,
        title: name,
        expires_at: expiresAt,
      })
      .select('id, keyword, public_id')
      .single()

    if (insertErr || !inserted) {
      console.error('room-by-keyword insert error', insertErr)
      return NextResponse.json({ error: 'Failed to create room' }, { status: 500 })
    }

    const boardId = (inserted as { id: string }).id
    const videoUrl = await findYouTubeVideoForKeyword(keyword)
    if (videoUrl) {
      const pinUntil = new Date(Date.now() + 60 * 1000).toISOString()
      await supabase
        .from('boards')
        .update({
          pinned_content: { type: 'youtube', url: videoUrl },
          pinned_until: pinUntil,
          pinned_at: new Date().toISOString(),
        })
        .eq('id', boardId)
    }

    const row = inserted as { keyword: string; public_id?: number | null }
    const path = row.public_id != null ? `/board/${row.public_id}` : `/board/${encodeURIComponent(row.keyword)}`
    return NextResponse.json({ ok: true, path, isNew: true })
  } catch (e) {
    console.error('room-by-keyword', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
