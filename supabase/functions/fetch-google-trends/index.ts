// Supabase Edge Function: Google Trends RSS 수집 → trending_keywords upsert
// Deploy: supabase functions deploy fetch-google-trends
// Invoke: supabase functions invoke fetch-google-trends

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RSS_URL = 'https://trends.google.com/trending/rss?geo=KR'

function parseKeywordsFromRss(xml: string): string[] {
  const keywords: string[] = []
  // <item> 내 <title> 또는 CDATA 내 텍스트 추출
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi
  const titleRegex = /<title[^>]*>([\s\S]*?)<\/title>/i
  const cdataRegex = /<!\[CDATA\[([\s\S]*?)\]\]>/

  let m: RegExpExecArray | null
  itemRegex.lastIndex = 0
  while ((m = itemRegex.exec(xml)) !== null) {
    const block = m[1]
    const titleMatch = block.match(titleRegex)
    if (titleMatch) {
      let raw = titleMatch[1].trim()
      const cdata = raw.match(cdataRegex)
      if (cdata) raw = cdata[1].replace(/<[^>]+>/g, '').trim()
      const keyword = raw.replace(/<[^>]+>/g, '').trim()
      if (keyword && keyword.length > 0 && keyword.length < 200) keywords.push(keyword)
    }
  }
  // channel/item 대신 entry/title (Atom 스타일) 폴백
  if (keywords.length === 0) {
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
        if (keyword && keyword.length > 0 && keyword.length < 200) keywords.push(keyword)
      }
    }
  }
  return keywords
}

Deno.serve(async (req: Request) => {
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const res = await fetch(RSS_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TrendsBot/1.0)',
        'Accept': 'application/rss+xml, application/xml, text/xml',
      },
    })

    if (!res.ok) {
      const text = await res.text()
      console.error('RSS fetch failed', res.status, text.slice(0, 500))
      return new Response(
        JSON.stringify({ error: 'RSS fetch failed', status: res.status, body: text.slice(0, 300) }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const xml = await res.text()
    const keywords = parseKeywordsFromRss(xml)

    if (keywords.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, message: 'No keywords parsed', count: 0 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // source='google' 기존 행 삭제 후 일괄 삽입 (upsert 대신 교체)
    const { error: delErr } = await supabase
      .from('trending_keywords')
      .delete()
      .eq('source', 'google')

    if (delErr) {
      console.error('Delete old google trends failed', delErr)
      // 컬럼 없거나 정책 문제 시 무시하고 insert만 시도
    }

    const rows = keywords.slice(0, 50).map((keyword, i) => ({
      source: 'google',
      keyword,
      rank: i + 1,
      created_at: new Date().toISOString(),
    }))

    const { data, error } = await supabase.from('trending_keywords').insert(rows).select('id')

    if (error) {
      console.error('Insert trending_keywords failed', error)
      return new Response(
        JSON.stringify({ error: 'Insert failed', message: error.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ ok: true, count: data?.length ?? rows.length }),
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
