import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000

/**
 * YouTube Data API: keyword로 검색 → type=video, relevanceLanguage=ko, videoEmbeddable=true
 * 조회수 또는 관련성 기준 상위 1개 영상 URL 반환.
 */
async function searchYouTubeBestVideo(keyword: string): Promise<string | null> {
  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) return null
  try {
    const params = new URLSearchParams({
      part: 'snippet',
      type: 'video',
      q: keyword,
      maxResults: '15',
      relevanceLanguage: 'ko',
      videoEmbeddable: 'true',
      key: apiKey,
    })
    const searchRes = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`)
    if (!searchRes.ok) return null
    const searchJson = await searchRes.json()
    const items = (searchJson.items ?? []) as { id?: { videoId?: string } }[]
    const videoIds = items.map((i) => i.id?.videoId).filter(Boolean) as string[]
    if (videoIds.length === 0) return null

    const videosRes = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${videoIds.slice(0, 15).join(',')}&key=${apiKey}`
    )
    if (!videosRes.ok) return null
    const videosJson = await videosRes.json()
    const videos = (videosJson.items ?? []) as { id: string; statistics?: { viewCount?: string } }[]
    const withViews = videos
      .map((v) => ({
        id: v.id,
        viewCount: parseInt(v.statistics?.viewCount ?? '0', 10) || 0,
      }))
      .sort((a, b) => b.viewCount - a.viewCount)
    const best = withViews[0]
    return best ? `https://www.youtube.com/watch?v=${best.id}` : null
  } catch {
    return null
  }
}

/**
 * Find or Create (하이패스):
 * Step A: keyword로 활성(expires_at > now) 방 검색
 * Step B: 있으면 해당 방 ID 반환, 없으면 Step C
 * Step C: 새 방 생성(제목=키워드, expires_at=+1주일, 전광판=YouTube 검색 영상) 후 새 방 ID 반환
 * 응답: { boardId: string | number } — /board/${boardId} 로 이동용
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

    // Step A: 활성 방 검색 (keyword = 제목/키워드, expires_at > now)
    const { data: existing } = await supabase
      .from('boards')
      .select('id, keyword, public_id')
      .eq('keyword', keyword)
      .gt('expires_at', now)
      .order('expires_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existing) {
      const row = existing as { id: string; keyword: string; public_id?: number | null }
      const boardId = row.public_id != null ? row.public_id : row.keyword
      return NextResponse.json({ ok: true, boardId })
    }

    // Step C: 새 방 생성 — 제목(키워드), 1주일 만료, 전광판=YouTube 최적 영상
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
      console.error('find-or-create insert error', insertErr)
      return NextResponse.json({ error: 'Failed to create room' }, { status: 500 })
    }

    const boardId = (inserted as { id: string }).id
    const videoUrl = await searchYouTubeBestVideo(keyword)
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
    const returnBoardId = row.public_id != null ? row.public_id : row.keyword
    return NextResponse.json({ ok: true, boardId: returnBoardId })
  } catch (e) {
    console.error('rooms/find-or-create', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
