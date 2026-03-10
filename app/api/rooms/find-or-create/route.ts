import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Find or Create (하이패스):
 * Step A: keyword로 활성(expires_at > now) 방 검색
 * Step B: 있으면 해당 방 ID 반환, 없으면 Step C
 * Step C: 새 방 생성(제목=키워드, expires_at=+1주일, 전광판=비어 있음) 후 새 방 ID 반환
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

    // Step C: 새 방 생성 — 제목(키워드), 1주일 만료, 전광판 비어 있음(NULL)
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

    const row = inserted as { keyword: string; public_id?: number | null }
    const returnBoardId = row.public_id != null ? row.public_id : row.keyword
    return NextResponse.json({ ok: true, boardId: returnBoardId })
  } catch (e) {
    console.error('rooms/find-or-create', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
