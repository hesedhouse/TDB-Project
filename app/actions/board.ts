'use server'

/**
 * 이 파일은 서버에서만 실행됩니다.
 * YOUTUBE_API_KEY는 process.env에서 서버에서만 읽으며, 클라이언트로 전달·노출되지 않습니다.
 * (Vercel 환경 변수에 등록, NEXT_PUBLIC_ 접두사 없음 = 서버 전용)
 */

import { createServerClient } from '@/lib/supabase/server'

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000

/**
 * YouTube Data API: keyword로 검색 (서버에서만 실행, API 키는 클라이언트에 노출되지 않음).
 * type=video, relevanceLanguage=ko, videoEmbeddable=true, 조회수 기준 1개 URL 반환.
 */
async function getYouTubeBestVideoUrl(keyword: string): Promise<string | null> {
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
    const best = videos
      .map((v) => ({ id: v.id, viewCount: parseInt(v.statistics?.viewCount ?? '0', 10) || 0 }))
      .sort((a, b) => b.viewCount - a.viewCount)[0]
    return best ? `https://www.youtube.com/watch?v=${best.id}` : null
  } catch {
    return null
  }
}

export type CreateBoardFromKeywordResult =
  | { ok: true; boardId: string | number }
  | { ok: false; error: string }

/**
 * 키워드로 활성 방 검색 → 없으면 새 방 생성(제목=키워드, expires_at=+1주일, 전광판=YouTube 최적 영상).
 * 반환: 입장 경로용 boardId (public_id 또는 keyword)
 */
export async function createBoardFromKeyword(keyword: string): Promise<CreateBoardFromKeywordResult> {
  const k = (keyword ?? '').toString().trim()
  if (!k) {
    return { ok: false, error: '키워드를 입력해 주세요.' }
  }

  const supabase = createServerClient()
  if (!supabase) {
    return { ok: false, error: '서비스 설정이 되어 있지 않습니다.' }
  }

  const now = new Date().toISOString()

  const { data: existing } = await supabase
    .from('boards')
    .select('id, keyword, public_id')
    .eq('keyword', k)
    .gt('expires_at', now)
    .order('expires_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing) {
    const row = existing as { keyword: string; public_id?: number | null }
    const boardId = row.public_id != null ? row.public_id : row.keyword
    return { ok: true, boardId }
  }

  const videoUrl = await getYouTubeBestVideoUrl(k)
  const expiresAt = new Date(Date.now() + ONE_WEEK_MS).toISOString()
  const name = `#${k}`

  const { data: inserted, error: insertErr } = await supabase
    .from('boards')
    .insert({
      keyword: k,
      name,
      title: name,
      expires_at: expiresAt,
    })
    .select('id, keyword, public_id')
    .single()

  if (insertErr || !inserted) {
    console.error('createBoardFromKeyword insert error', insertErr)
    return { ok: false, error: '방 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.' }
  }

  const boardUuid = (inserted as { id: string }).id
  if (videoUrl) {
    const pinUntil = new Date(Date.now() + 60 * 1000).toISOString()
    await supabase
      .from('boards')
      .update({
        pinned_content: { type: 'youtube', url: videoUrl },
        pinned_until: pinUntil,
        pinned_at: new Date().toISOString(),
      })
      .eq('id', boardUuid)
  }

  const row = inserted as { keyword: string; public_id?: number | null }
  const boardId = row.public_id != null ? row.public_id : row.keyword
  return { ok: true, boardId }
}
