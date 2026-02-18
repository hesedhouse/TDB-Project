import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/client'
import { isValidUuid } from '@/lib/supabase/client'

export type BoardApiResponse = {
  id: string
  public_id: number | null
  /** 방 번호(숫자). room_no 컬럼 우선, 없으면 public_id 사용 → 헤더 'No. {room_no}' 배지용 */
  room_no: number | null
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

    const selectColsWithPassword = 'id, keyword, name, expires_at, created_at, public_id, room_no, password_hash'
    const selectColsWithoutPassword = 'id, keyword, name, expires_at, created_at, public_id, room_no'
    const selectColsMinimal = 'id, keyword, name, expires_at, created_at, public_id'

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
      console.warn('[api/board] boards.password_hash/room_no 컬럼 없음 또는 오류. fallback 사용.', resWith.error?.message ?? resWith.error)
      let resFallback = await buildQuery(selectColsWithoutPassword).maybeSingle()
      if (resFallback.error) {
        resFallback = await buildQuery(selectColsMinimal).maybeSingle()
      }
      if (resFallback.error) {
        console.error('[api/board/[identifier]]', resFallback.error)
        return NextResponse.json({ error: 'Failed to fetch board' }, { status: 500 })
      }
      row = resFallback.data == null ? null : (resFallback.data as unknown as Record<string, unknown>)
    }

    if (!row) {
      return NextResponse.json({ error: 'Board not found' }, { status: 404 })
    }

    const r = row
    const numericId = /^\d+$/.test(raw) ? Number(raw) : null
    const publicIdVal = r.public_id != null ? Number(r.public_id) : numericId
    const roomNoVal = r.room_no != null ? Number(r.room_no) : publicIdVal
    const response: BoardApiResponse = {
      id: String(r.id),
      public_id: publicIdVal,
      room_no: roomNoVal,
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
