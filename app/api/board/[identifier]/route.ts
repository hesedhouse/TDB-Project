import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/client'
import { isValidUuid } from '@/lib/supabase/client'

export type BoardApiResponse = {
  id: string
  public_id: number | null
  keyword: string
  name: string | null
  expires_at: string
  created_at: string
  has_password: boolean
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ identifier: string }> }
) {
  try {
    const { identifier } = await context.params
    const raw = (identifier ?? '').trim()
    if (!raw) {
      return NextResponse.json({ error: 'identifier required' }, { status: 400 })
    }

    const supabase = createClient()
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })
    }

    const selectCols = 'id, keyword, name, expires_at, created_at, public_id, password_hash'

    let query = supabase.from('boards').select(selectCols).limit(1)

    if (/^\d+$/.test(raw)) {
      query = query.eq('public_id', Number(raw))
    } else if (isValidUuid(raw)) {
      query = query.eq('id', raw)
    } else {
      query = query.eq('keyword', decodeURIComponent(raw))
    }

    const { data: row, error } = await query.maybeSingle()

    if (error) {
      console.error('[api/board/[identifier]]', error)
      return NextResponse.json({ error: 'Failed to fetch board' }, { status: 500 })
    }
    if (!row) {
      return NextResponse.json({ error: 'Board not found' }, { status: 404 })
    }

    const r = row as Record<string, unknown>
    const has_password = Boolean(r.password_hash)
    const { password_hash: _, ...safe } = r
    const response: BoardApiResponse = {
      id: String(r.id),
      public_id: r.public_id != null ? Number(r.public_id) : null,
      keyword: String(r.keyword),
      name: r.name != null ? String(r.name) : null,
      expires_at: String(r.expires_at),
      created_at: String(r.created_at),
      has_password,
    }
    return NextResponse.json(response)
  } catch (e) {
    console.error('[api/board/[identifier]]', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
