import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/client'
import { isValidUuid } from '@/lib/supabase/client'

/** 전광판 다음: 대기열에서 가장 먼저 들어온 항목을 꺼내 전광판에 설정 (영상 종료/이미지 시간 종료 시 호출) */
export async function POST(
  request: Request,
  context: { params: Promise<{ identifier: string }> }
) {
  try {
    const { identifier } = await context.params
    const raw = (identifier ?? '').trim()
    if (!raw) return NextResponse.json({ error: 'identifier required' }, { status: 400 })

    const supabase = createClient()
    if (!supabase) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })

    let q = supabase.from('boards').select('id').limit(1)
    if (/^\d+$/.test(raw)) q = q.eq('public_id', Number(raw))
    else if (isValidUuid(raw)) q = q.eq('id', raw)
    else q = q.eq('keyword', decodeURIComponent(raw))

    const { data: boardRow, error: fetchErr } = await q.maybeSingle()
    if (fetchErr || !boardRow) {
      return NextResponse.json({ error: 'Board not found' }, { status: 404 })
    }
    const boardId = String((boardRow as { id: string }).id)

    const { data: queueRows } = await supabase
      .from('billboard_queue')
      .select('id, content_url, type, start_time, end_time')
      .eq('board_id', boardId)
      .order('created_at', { ascending: true })
      .limit(1)

    const first = queueRows?.[0] as {
      id: string
      content_url: string
      type: string
      start_time?: number | null
      end_time?: number | null
    } | undefined
    if (!first || (first.type !== 'youtube' && first.type !== 'image')) {
      return NextResponse.json({ ok: false, reason: 'empty' }, { status: 200 })
    }

    const { error: deleteErr } = await supabase.from('billboard_queue').delete().eq('id', first.id)
    if (deleteErr) {
      console.error('[billboard-next] delete failed', deleteErr)
      return NextResponse.json({ error: 'Failed to pop from queue' }, { status: 500 })
    }

    const startSec = typeof first.start_time === 'number' && first.start_time >= 0 ? Math.floor(first.start_time) : undefined
    const endSec = typeof first.end_time === 'number' && first.end_time >= 0 ? Math.floor(first.end_time) : undefined
    const pinnedContentPayload =
      first.type === 'youtube'
        ? {
            type: 'youtube' as const,
            url: first.content_url,
            ...(startSec != null && { start_seconds: startSec }),
            ...(endSec != null && { end_seconds: endSec }),
          }
        : { type: first.type as 'image', url: first.content_url }

    const now = new Date()
    const pinDurationMs = 60 * 1000
    const pinnedUntil = new Date(now.getTime() + pinDurationMs)
    const payload = {
      pinned_content: pinnedContentPayload,
      pinned_until: pinnedUntil.toISOString(),
      pinned_at: now.toISOString(),
    }

    const { error: updateErr } = await supabase
      .from('boards')
      .update(payload)
      .eq('id', boardId)

    if (updateErr) {
      console.error('[billboard-next] update boards failed', updateErr)
      return NextResponse.json({ error: 'Failed to set billboard' }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      payload: payload.pinned_content,
      pinned_until: payload.pinned_until,
      pinned_at: payload.pinned_at,
    })
  } catch (e) {
    console.error('[billboard-next]', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
