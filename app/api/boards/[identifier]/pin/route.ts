import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/client'
import { isValidUuid } from '@/lib/supabase/client'

const PIN_DURATION_MS = 5 * 60 * 1000

type PinBody = { type: 'youtube' | 'image'; url: string }

export async function POST(
  request: Request,
  context: { params: Promise<{ identifier: string }> }
) {
  try {
    const { identifier } = await context.params
    const raw = (identifier ?? '').trim()
    if (!raw) {
      return NextResponse.json({ error: 'identifier required' }, { status: 400 })
    }

    let body: PinBody
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const type = body?.type
    const url = typeof body?.url === 'string' ? body.url.trim() : ''
    if (type !== 'youtube' && type !== 'image') {
      return NextResponse.json({ error: 'type must be youtube or image' }, { status: 400 })
    }
    if (!url) {
      return NextResponse.json({ error: 'url required' }, { status: 400 })
    }

    const supabase = createClient()
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })
    }

    const selectCols = 'id'
    let q = supabase.from('boards').select(selectCols).limit(1)
    if (/^\d+$/.test(raw)) q = q.eq('public_id', Number(raw))
    else if (isValidUuid(raw)) q = q.eq('id', raw)
    else q = q.eq('keyword', decodeURIComponent(raw))

    const { data: row, error: fetchErr } = await q.maybeSingle()
    if (fetchErr || !row) {
      return NextResponse.json({ error: 'Board not found' }, { status: 404 })
    }
    const boardId = String((row as { id: string }).id)

    const pinnedUntil = new Date(Date.now() + PIN_DURATION_MS)
    const { error: updateErr } = await supabase
      .from('boards')
      .update({
        pinned_content: { type, url },
        pinned_until: pinnedUntil.toISOString(),
      })
      .eq('id', boardId)

    if (updateErr) {
      console.error('[api/boards/pin]', updateErr)
      return NextResponse.json({ error: 'Failed to set pinned content' }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      pinned_until: pinnedUntil.toISOString(),
    })
  } catch (e) {
    console.error('[api/boards/pin]', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
