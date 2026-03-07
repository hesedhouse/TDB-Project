import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000

/**
 * 플로팅 태그 클릭: 활성 방 검색 → 없으면 1주일 만료 방 생성(전광판 비어 있음) → 입장 경로 반환.
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

    const row = inserted as { keyword: string; public_id?: number | null }
    const path = row.public_id != null ? `/board/${row.public_id}` : `/board/${encodeURIComponent(row.keyword)}`
    return NextResponse.json({ ok: true, path, isNew: true })
  } catch (e) {
    console.error('room-by-keyword', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
