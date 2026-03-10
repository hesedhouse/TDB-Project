import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/client'
import { isValidUuid } from '@/lib/supabase/client'
import { inferPinContentType } from '@/lib/supabase/pinnedContent'

type QueueBody = {
  type?: 'youtube' | 'image'
  url: string
  creator_id?: string | null
  start_seconds?: number
  end_seconds?: number
}

/** 전광판 예약: 비어 있으면 즉시 고정, 재생 중이면 대기열에 추가 */
export async function POST(
  request: Request,
  context: { params: Promise<{ identifier: string }> }
) {
  try {
    const { identifier } = await context.params
    const raw = (identifier ?? '').trim()
    if (!raw) return NextResponse.json({ error: 'identifier required' }, { status: 400 })

    let body: QueueBody
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    let type = body?.type
    const url = typeof body?.url === 'string' ? body.url.trim() : ''
    if (!url) return NextResponse.json({ error: 'url required' }, { status: 400 })
    const inferred = inferPinContentType(url)
    if (!type) type = inferred ?? undefined
    else if (inferred && type !== inferred) type = inferred
    if (type !== 'youtube' && type !== 'image') {
      return NextResponse.json({ error: 'url must be YouTube or image' }, { status: 400 })
    }

    const supabase = createClient()
    if (!supabase) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })

    let q = supabase.from('boards').select('id, pinned_content, pinned_until').limit(1)
    if (/^\d+$/.test(raw)) q = q.eq('public_id', Number(raw))
    else if (isValidUuid(raw)) q = q.eq('id', raw)
    else q = q.eq('keyword', decodeURIComponent(raw))

    const { data: boardRow, error: fetchErr } = await q.maybeSingle()
    if (fetchErr || !boardRow) {
      return NextResponse.json({ error: 'Board not found' }, { status: 404 })
    }
    const boardId = String((boardRow as { id: string }).id)
    const until = (boardRow as { pinned_until?: string | null }).pinned_until
    const hasActivePin = until && new Date(until).getTime() > Date.now()

    const now = new Date()
    const pinDurationMs = 60 * 1000
    const pinnedUntil = new Date(now.getTime() + pinDurationMs)

    const startSec = typeof body.start_seconds === 'number' && body.start_seconds >= 0 ? Math.floor(body.start_seconds) : undefined
    const endSec = typeof body.end_seconds === 'number' && body.end_seconds >= 0 ? Math.floor(body.end_seconds) : undefined
    const pinnedContentForYoutube =
      type === 'youtube'
        ? { type, url, ...(startSec != null && { start_seconds: startSec }), ...(endSec != null && { end_seconds: endSec }) }
        : { type, url }

    if (!hasActivePin) {
      const updatePayload = {
        pinned_content: pinnedContentForYoutube,
        pinned_until: pinnedUntil.toISOString(),
        pinned_at: now.toISOString(),
      }
      const { error: updateErr } = await supabase
        .from('boards')
        .update(updatePayload)
        .eq('id', boardId)
      if (updateErr) {
        console.error('[billboard-queue] pin now failed', updateErr)
        return NextResponse.json({ error: 'Failed to set billboard' }, { status: 500 })
      }
      return NextResponse.json({
        ok: true,
        queued: false,
        pinned_until: pinnedUntil.toISOString(),
        pinned_at: now.toISOString(),
      })
    }

    const { error: insertErr } = await supabase.from('billboard_queue').insert({
      board_id: boardId,
      content_url: url,
      type,
      creator_id: body.creator_id ?? null,
      ...(startSec != null && { start_time: startSec }),
      ...(endSec != null && { end_time: endSec }),
    })
    if (insertErr) {
      console.error('[billboard-queue] insert failed', insertErr)
      return NextResponse.json({ error: 'Failed to add to queue' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, queued: true })
  } catch (e) {
    console.error('[billboard-queue]', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
