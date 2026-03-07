import { NextResponse } from 'next/server'

const MIN_DURATION_SEC = 3 * 60
const MAX_DURATION_SEC = 10 * 60

/** ISO 8601 duration (e.g. PT5M30S) to seconds */
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

/**
 * 키워드로 YouTube 검색 → 3~10분, 조회수 우선 1개 영상 URL 반환.
 * GET /api/youtube-search?q=키워드
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const q = searchParams.get('q')?.trim()
    if (!q) {
      return NextResponse.json({ error: 'q required' }, { status: 400 })
    }
    const apiKey = process.env.YOUTUBE_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'YouTube API not configured' }, { status: 503 })
    }

    const searchRes = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=${encodeURIComponent(q)}&maxResults=15&key=${apiKey}`
    )
    if (!searchRes.ok) {
      const err = await searchRes.text()
      console.error('youtube search error', searchRes.status, err)
      return NextResponse.json({ error: 'YouTube search failed' }, { status: 502 })
    }
    const searchJson = await searchRes.json()
    const items = (searchJson.items ?? []) as { id?: { videoId?: string } }[]
    const videoIds = items.map((i) => i.id?.videoId).filter(Boolean) as string[]
    if (videoIds.length === 0) {
      return NextResponse.json({ url: null })
    }

    const videosRes = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,statistics&id=${videoIds.slice(0, 15).join(',')}&key=${apiKey}`
    )
    if (!videosRes.ok) {
      return NextResponse.json({ url: null })
    }
    const videosJson = await videosRes.json()
    const videos = (videosJson.items ?? []) as {
      id: string
      contentDetails?: { duration?: string }
      statistics?: { viewCount?: string }
    }[]

    const withDuration = videos
      .map((v) => {
        const dur = parseDuration(v.contentDetails?.duration ?? '')
        const views = parseInt(v.statistics?.viewCount ?? '0', 10) || 0
        return { id: v.id, durationSec: dur, viewCount: views }
      })
      .filter((v) => v.durationSec >= MIN_DURATION_SEC && v.durationSec <= MAX_DURATION_SEC)
      .sort((a, b) => b.viewCount - a.viewCount)

    const best = withDuration[0]
    const url = best ? `https://www.youtube.com/watch?v=${best.id}` : null
    return NextResponse.json({ url })
  } catch (e) {
    console.error('youtube-search', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
