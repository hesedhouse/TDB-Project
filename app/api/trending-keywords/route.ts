import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

/** 프론트에서 트렌드 키워드를 랜덤 15~20개 가져오는 API */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const min = Math.min(20, Math.max(15, parseInt(searchParams.get('min') ?? '15', 10) || 15))
    const max = Math.min(25, Math.max(min, parseInt(searchParams.get('max') ?? '20', 10) || 20))
    const count = Math.floor(Math.random() * (max - min + 1)) + min

    const supabase = createServerClient()
    if (!supabase) {
      return NextResponse.json({ keywords: [] }, { status: 200 })
    }

    const { data, error } = await supabase
      .from('trending_keywords')
      .select('id, platform, keyword, related_url, rank, created_at')
      .order('created_at', { ascending: false })
      .limit(80)

    if (error) {
      console.error('trending_keywords select error:', error)
      return NextResponse.json({ keywords: [] }, { status: 200 })
    }

    const list = (data ?? []).filter((r) => (r.keyword ?? (r as { word?: string }).word)?.trim())
    const keyword = (r: (typeof list)[0]) => (r.keyword ?? (r as { word?: string }).word ?? '').trim()
    const shuffled = [...list].sort(() => Math.random() - 0.5)
    const slice = shuffled.slice(0, count).map((r) => ({
      id: r.id,
      platform: r.platform ?? (r as { source?: string }).source ?? null,
      keyword: keyword(r),
      related_url: r.related_url ?? null,
      rank: r.rank ?? null,
    }))

    return NextResponse.json({ keywords: slice })
  } catch (e) {
    console.error('GET /api/trending-keywords', e)
    return NextResponse.json({ keywords: [] }, { status: 200 })
  }
}
