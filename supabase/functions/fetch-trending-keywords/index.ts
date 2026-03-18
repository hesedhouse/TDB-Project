// Supabase Edge Function: Google Trends RSS + YouTube 인기 영상 수집 → trending_keywords 최신화
// 30분마다 Cron으로 호출 권장. Deploy: supabase functions deploy fetch-trending-keywords
// Secrets: YOUTUBE_API_KEY (YouTube Data API v3 키, 선택)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const GOOGLE_TRENDS_RSS = 'https://trends.google.com/trending/rss?geo=KR'
const YOUTUBE_API = 'https://www.googleapis.com/youtube/v3/videos'

type Row = {
  platform: string
  keyword: string
  related_url: string | null
  rank: number
  created_at: string
}

function toMaxChars(input: string, maxChars: number): string {
  if (maxChars <= 0) return ''
  return Array.from(input).slice(0, maxChars).join('')
}

function stripSpecialChars(input: string): string {
  // keep letters/numbers/spaces only (unicode-safe)
  return input.replace(/[^\p{L}\p{N}\s]/gu, ' ')
}

function normalizeSpaces(input: string): string {
  return input.replace(/\s+/g, ' ').trim()
}

function sanitizeYouTubeTitleToKeyword(title: string): string {
  let t = (title ?? '').trim()
  if (!t) return ''

  // Prefer leading [...] or (...) label if present
  const leadingBracket = t.match(/^\[([^\]]+)\]/)
  if (leadingBracket?.[1]) t = leadingBracket[1].trim()
  const leadingParen = t.match(/^\(([^)]+)\)/)
  if (!leadingBracket?.[1] && leadingParen?.[1]) t = leadingParen[1].trim()

  // Drop everything after first pipe
  const pipeIdx = t.indexOf('|')
  if (pipeIdx >= 0) t = t.slice(0, pipeIdx).trim()

  // Remove any remaining bracket/paren segments anywhere
  t = t.replace(/\[[^\]]*?\]/g, ' ')
  t = t.replace(/\([^)]*?\)/g, ' ')

  // Remove special chars, normalize spaces
  t = normalizeSpaces(stripSpecialChars(t))

  // Final max 10 characters
  return toMaxChars(t, 10)
}

function parseGoogleRss(xml: string): { keyword: string; related_url: string | null }[] {
  const out: { keyword: string; related_url: string | null }[] = []
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi
  const titleRegex = /<title[^>]*>([\s\S]*?)<\/title>/i
  const linkRegex = /<link[^>]*>([\s\S]*?)<\/link>/i
  const cdataRegex = /<!\[CDATA\[([\s\S]*?)\]\]>/

  let m: RegExpExecArray | null
  itemRegex.lastIndex = 0
  while ((m = itemRegex.exec(xml)) !== null) {
    const block = m[1]
    const titleMatch = block.match(titleRegex)
    let keyword = ''
    if (titleMatch) {
      let raw = titleMatch[1].trim()
      const cdata = raw.match(cdataRegex)
      if (cdata) raw = cdata[1].replace(/<[^>]+>/g, '').trim()
      keyword = raw.replace(/<[^>]+>/g, '').trim()
    }
    let related_url: string | null = null
    const linkMatch = block.match(linkRegex)
    if (linkMatch) {
      const raw = linkMatch[1].trim().replace(/<[^>]+>/g, '')
      if (raw.startsWith('http')) related_url = raw
    }
    if (keyword && keyword.length < 200) out.push({ keyword, related_url })
  }
  if (out.length === 0) {
    const entryRegex = /<entry[^>]*>([\s\S]*?)<\/entry>/gi
    entryRegex.lastIndex = 0
    while ((m = entryRegex.exec(xml)) !== null) {
      const block = m[1]
      const titleMatch = block.match(titleRegex)
      if (titleMatch) {
        let raw = titleMatch[1].trim()
        const cdata = raw.match(cdataRegex)
        if (cdata) raw = cdata[1].replace(/<[^>]+>/g, '').trim()
        const keyword = raw.replace(/<[^>]+>/g, '').trim()
        if (keyword && keyword.length < 200) out.push({ keyword, related_url: null })
      }
    }
  }
  return out
}

async function fetchGoogleTrends(): Promise<Row[]> {
  const res = await fetch(GOOGLE_TRENDS_RSS, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; TrendsBot/1.0)',
      'Accept': 'application/rss+xml, application/xml, text/xml',
    },
  })
  if (!res.ok) {
    const body = await res.text()
    console.error('Google Trends RSS failed', res.status, res.statusText, body.slice(0, 500))
    return []
  }
  const xml = await res.text()
  const items = parseGoogleRss(xml).slice(0, 50)
  const now = new Date().toISOString()
  return items.map((item, i) => ({
    platform: 'google',
    keyword: item.keyword,
    related_url: item.related_url,
    rank: i + 1,
    created_at: now,
  }))
}

async function fetchYouTubeTrends(apiKey: string): Promise<Row[]> {
  const url = new URL(YOUTUBE_API)
  url.searchParams.set('part', 'snippet')
  url.searchParams.set('chart', 'mostPopular')
  url.searchParams.set('regionCode', 'KR')
  url.searchParams.set('maxResults', '50')
  url.searchParams.set('key', apiKey)

  const res = await fetch(url.toString(), {
    headers: { 'Accept': 'application/json' },
  })
  if (!res.ok) {
    console.error('YouTube API error', res.status, await res.text())
    return []
  }
  const json = await res.json()
  const items = (json.items ?? []) as { id: string; snippet?: { title?: string } }[]
  const now = new Date().toISOString()
  return items
    .map((item, i) => {
      const rawTitle = (item.snippet?.title ?? '').trim()
      const keyword = sanitizeYouTubeTitleToKeyword(rawTitle)
      return {
        platform: 'youtube',
        keyword: keyword || `Video${String(item.id).slice(0, 6)}`,
        related_url: `https://www.youtube.com/watch?v=${item.id}`,
        rank: i + 1,
        created_at: now,
      }
    })
    // 유튜브 키워드는 1~10글자까지만 허용
    .filter((r) => r.keyword.length > 0 && r.keyword.length <= 10)
}

Deno.serve(async (req: Request) => {
  try {
    if (req.headers.get('Authorization') == null) {
      return new Response(JSON.stringify({ error: 'Missing Authorization' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)
    const youtubeKey = Deno.env.get('YOUTUBE_API_KEY') ?? ''

    const rows: Row[] = []

    const googleRows = await fetchGoogleTrends()
    rows.push(...googleRows)

    if (youtubeKey) {
      const youtubeRows = await fetchYouTubeTrends(youtubeKey)
      rows.push(...youtubeRows)
    }

    const platformsToReplace = ['google', 'youtube']
    for (const platform of platformsToReplace) {
      const { error: delErr } = await supabase
        .from('trending_keywords')
        .delete()
        .eq('platform', platform)
      if (delErr) {
        const alt = await supabase.from('trending_keywords').delete().eq('source', platform)
        if (alt.error) console.error('Delete failed for', platform, delErr)
      }
    }

    const toInsert = rows.filter((r) => r.keyword.length > 0)
    if (toInsert.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, message: 'No data to insert', count: 0 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const { data, error } = await supabase
      .from('trending_keywords')
      .insert(toInsert.map(({ platform, keyword, related_url, rank, created_at }) => ({
        platform,
        keyword,
        related_url,
        rank,
        created_at,
      })))
      .select('id')

    if (error) {
      console.error('Insert failed', error)
      return new Response(
        JSON.stringify({ error: 'Insert failed', message: error.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({
        ok: true,
        count: data?.length ?? toInsert.length,
        google: googleRows.length,
        youtube: toInsert.length - googleRows.length,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (e) {
    console.error(e)
    return new Response(
      JSON.stringify({ error: String((e as Error).message) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
