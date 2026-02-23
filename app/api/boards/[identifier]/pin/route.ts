import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/client'
import { isValidUuid } from '@/lib/supabase/client'

type PinBody = { type: 'youtube' | 'image'; url: string; duration_minutes?: number }

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
    const pinDurationMs = 60 * 1000

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

    const now = new Date()
    const pinnedUntil = new Date(now.getTime() + pinDurationMs)
    const payload = {
      pinned_content: { type, url },
      pinned_until: pinnedUntil.toISOString(),
      pinned_at: now.toISOString(),
    }
    let updateErr: { message: string; details?: unknown; code?: string; hint?: string } | null = null
    try {
      const result = await supabase
        .from('boards')
        .update(payload)
        .eq('id', boardId)
      updateErr = result.error
    } catch (e) {
      console.error('[api/boards/pin] Supabase Error:', e)
      return NextResponse.json(
        { error: 'Failed to set pinned content', supabase_error: String((e as Error)?.message ?? e) },
        { status: 500 }
      )
    }

    if (updateErr) {
      console.error('Supabase Error:', updateErr)
      console.error('[api/boards/pin] Rejected payload:', JSON.stringify(payload), 'boardId:', boardId)
      return NextResponse.json(
        { error: 'Failed to set pinned content', supabase_error: updateErr.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      ok: true,
      pinned_until: pinnedUntil.toISOString(),
      pinned_at: now.toISOString(),
    })
  } catch (e) {
    console.error('[api/boards/pin]', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
