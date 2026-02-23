import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/client'
import { isValidUuid } from '@/lib/supabase/client'

const EXTEND_MINUTES = 1
const EXTEND_MS = EXTEND_MINUTES * 60 * 1000

/** 1분 릴레이 이어달리기: pinned_until에 +1분. 누구나 연장 가능. 모래시계 1개 차감은 클라이언트에서. */
export async function POST(
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

    let q = supabase.from('boards').select('id, pinned_until, pinned_content').limit(1)
    if (/^\d+$/.test(raw)) q = q.eq('public_id', Number(raw))
    else if (isValidUuid(raw)) q = q.eq('id', raw)
    else q = q.eq('keyword', decodeURIComponent(raw))

    const { data: row, error: fetchErr } = await q.maybeSingle()
    if (fetchErr || !row) {
      return NextResponse.json({ error: 'Board not found' }, { status: 404 })
    }
    const boardId = String((row as { id: string }).id)
    const pinnedUntil = (row as { pinned_until: string | null }).pinned_until
    const pinnedContent = (row as { pinned_content: unknown }).pinned_content

    if (!pinnedUntil || !pinnedContent) {
      return NextResponse.json({ error: 'No pinned content to extend' }, { status: 400 })
    }
    const currentUntil = new Date(pinnedUntil)
    if (Number.isNaN(currentUntil.getTime())) {
      return NextResponse.json({ error: 'Invalid pinned_until' }, { status: 400 })
    }
    const now = Date.now()
    if (currentUntil.getTime() <= now) {
      return NextResponse.json({ error: 'Pinned content already expired' }, { status: 400 })
    }

    const newUntil = new Date(currentUntil.getTime() + EXTEND_MS)

    const { error: updateErr } = await supabase
      .from('boards')
      .update({ pinned_until: newUntil.toISOString() })
      .eq('id', boardId)

    if (updateErr) {
      console.error('[api/boards/pin/extend]', updateErr)
      return NextResponse.json({ error: 'Failed to extend' }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      pinned_until: newUntil.toISOString(),
      duration_minutes: EXTEND_MINUTES,
    })
  } catch (e) {
    console.error('[api/boards/pin/extend]', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
