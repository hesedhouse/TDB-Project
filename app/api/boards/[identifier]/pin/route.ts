import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/client'
import { isValidUuid } from '@/lib/supabase/client'
import { inferPinContentType } from '@/lib/supabase/pinnedContent'

type PinBody = {
  type?: 'youtube' | 'image'
  url: string
  duration_minutes?: number
  start_seconds?: number
  end_seconds?: number
}

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
    let type = body?.type
    const url = typeof body?.url === 'string' ? body.url.trim() : ''
    if (!url) {
      return NextResponse.json({ error: 'url required' }, { status: 400 })
    }
    const inferred = inferPinContentType(url)
    if (!type) type = inferred ?? undefined
    else if (inferred && type !== inferred) type = inferred
    if (type !== 'youtube' && type !== 'image') {
      return NextResponse.json({ error: 'url must be a YouTube link or image URL (png, jpg, gif, webp, etc.)' }, { status: 400 })
    }
    const pinDurationMs = 60 * 1000

    const supabase = createClient()
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })
    }

    let q = supabase.from('boards').select('id, pinned_until').limit(1)
    if (/^\d+$/.test(raw)) q = q.eq('public_id', Number(raw))
    else if (isValidUuid(raw)) q = q.eq('id', raw)
    else q = q.eq('keyword', decodeURIComponent(raw))

    const { data: row, error: fetchErr } = await q.maybeSingle()
    if (fetchErr || !row) {
      return NextResponse.json({ error: 'Board not found' }, { status: 404 })
    }
    const boardId = String((row as { id: string }).id)
    const until = (row as { pinned_until?: string | null }).pinned_until
    const nowMs = Date.now()
    const untilMs = until ? new Date(until).getTime() : 0
    const isExpired = !until || untilMs <= nowMs
    const isBoardEmpty = isExpired
    const hasActiveContent = !isBoardEmpty

    const startSec = typeof body.start_seconds === 'number' && body.start_seconds >= 0 ? Math.floor(body.start_seconds) : undefined
    const endSec = typeof body.end_seconds === 'number' && body.end_seconds >= 0 ? Math.floor(body.end_seconds) : undefined
    const now = new Date()
    const pinnedUntil = new Date(now.getTime() + pinDurationMs)

    // pinned_until이 현재보다 이전(past)이면 만료된 데이터 → 비어있는 상태로 간주하고 덮어쓰기. 사용 중일 때만 대기열.
    // billboard_queue 컬럼: id, board_id, content_url, type, creator_id, created_at, start_time, end_time
    if (hasActiveContent) {
      const queueRow: {
        board_id: string
        content_url: string
        type: 'youtube' | 'image'
        creator_id: null
        start_time?: number
        end_time?: number
      } = {
        board_id: boardId,
        content_url: url,
        type: type as 'youtube' | 'image',
        creator_id: null,
      }
      if (startSec != null) queueRow.start_time = startSec
      if (endSec != null) queueRow.end_time = endSec
      const { error: insertErr } = await supabase.from('billboard_queue').insert(queueRow)
      if (insertErr) {
        console.error('[api/boards/pin] billboard_queue insert failed', insertErr.message, insertErr.details)
        return NextResponse.json(
          { error: 'Failed to add to queue', code: insertErr.code },
          { status: 500 }
        )
      }
      const hourglassesUsed = Math.max(1, body.duration_minutes ?? 1)
      await supabase
        .from('hourglass_transactions')
        .insert({ board_id: boardId, type: 'billboard', amount: hourglassesUsed })
        .then((r) => {
          if (r.error && process.env.NODE_ENV === 'development') {
            console.warn('[api/boards/pin] hourglass_transactions insert skipped', r.error.code)
          }
        })
      return NextResponse.json({ ok: true, queued: true })
    }

    const pinnedContent =
      type === 'youtube'
        ? { type, url, ...(startSec != null && { start_seconds: startSec }), ...(endSec != null && { end_seconds: endSec }) }
        : { type, url }
    const payload = {
      pinned_content: pinnedContent,
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

    const hourglassesUsed = Math.max(1, body.duration_minutes ?? 1)
    await supabase
      .from('hourglass_transactions')
      .insert({ board_id: boardId, type: 'billboard', amount: hourglassesUsed })
      .then((r) => {
        if (r.error && process.env.NODE_ENV === 'development') {
          console.warn('[api/boards/pin] hourglass_transactions insert skipped', r.error.code)
        }
      })

    return NextResponse.json({
      ok: true,
      queued: false,
      pinned_until: pinnedUntil.toISOString(),
      pinned_at: now.toISOString(),
    })
  } catch (e) {
    console.error('[api/boards/pin]', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
