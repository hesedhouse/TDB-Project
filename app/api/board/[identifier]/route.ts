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

    const selectColsWithPassword = 'id, keyword, name, expires_at, created_at, public_id, password_hash'
    const selectColsWithoutPassword = 'id, keyword, name, expires_at, created_at, public_id'

    const buildQuery = (cols: string) => {
      let q = supabase.from('boards').select(cols).limit(1)
      if (/^\d+$/.test(raw)) q = q.eq('public_id', Number(raw))
      else if (isValidUuid(raw)) q = q.eq('id', raw)
      else q = q.eq('keyword', decodeURIComponent(raw))
      return q
    }

    let row: Record<string, unknown> | null = null
    let has_password = false

    const resWith = await buildQuery(selectColsWithPassword).maybeSingle()
    if (!resWith.error && resWith.data) {
      const data = resWith.data as unknown
      row = data as Record<string, unknown>
      has_password = Boolean(row?.password_hash)
    } else if (resWith.error) {
      console.warn('[api/board] boards.password_hash 컬럼 없음 또는 오류. Supabase에서 boards_migration_password.sql 실행 여부 확인.', resWith.error?.message ?? resWith.error)
      const resWithout = await buildQuery(selectColsWithoutPassword).maybeSingle()
      if (resWithout.error) {
        console.error('[api/board/[identifier]]', resWithout.error)
        return NextResponse.json({ error: 'Failed to fetch board' }, { status: 500 })
      }
      row = resWithout.data == null ? null : (resWithout.data as unknown as Record<string, unknown>)
    }

    if (!row) {
      return NextResponse.json({ error: 'Board not found' }, { status: 404 })
    }

    const r = row
    const numericId = /^\d+$/.test(raw) ? Number(raw) : null
    const response: BoardApiResponse = {
      id: String(r.id),
      public_id: r.public_id != null ? Number(r.public_id) : numericId,
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
