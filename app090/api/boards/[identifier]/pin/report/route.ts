import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/client'
import { isValidUuid } from '@/lib/supabase/client'

const REPORT_THRESHOLD = 30

type ReportBody = {
  reason: string
  user_id?: string | null
  reporter_fingerprint?: string | null
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

    let body: ReportBody
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : ''
    if (!reason) {
      return NextResponse.json({ error: 'reason required' }, { status: 400 })
    }
    const userId = body?.user_id != null && body.user_id !== '' ? String(body.user_id) : null
    const fingerprint = typeof body?.reporter_fingerprint === 'string' ? body.reporter_fingerprint.trim() || null : null
    if (!userId && !fingerprint) {
      return NextResponse.json({ error: 'user_id or reporter_fingerprint required' }, { status: 400 })
    }

    const supabase = createClient()
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })
    }

    let q = supabase.from('boards').select('id, pinned_until').limit(1)
    if (/^\d+$/.test(raw)) q = q.eq('public_id', Number(raw))
    else if (isValidUuid(raw)) q = q.eq('id', raw)
    else q = q.eq('keyword', decodeURIComponent(raw))

    const { data: boardRow, error: boardErr } = await q.maybeSingle()
    if (boardErr || !boardRow) {
      return NextResponse.json({ error: 'Board not found' }, { status: 404 })
    }
    const boardId = String((boardRow as { id: string }).id)
    const pinnedUntil = (boardRow as { pinned_until: string | null }).pinned_until
    if (!pinnedUntil) {
      return NextResponse.json({ error: 'No pinned content to report' }, { status: 400 })
    }
    const until = new Date(pinnedUntil)
    if (Number.isNaN(until.getTime()) || until.getTime() <= Date.now()) {
      return NextResponse.json({ error: 'Pinned content already expired' }, { status: 400 })
    }

    const { error: insertErr } = await supabase.from('pinned_reports').insert({
      board_id: boardId,
      user_id: userId,
      reporter_fingerprint: fingerprint,
      report_reason: reason,
      pinned_until_snapshot: pinnedUntil,
    })
    if (insertErr) {
      console.error('[api/boards/pin/report] insert error:', insertErr)
      return NextResponse.json({ error: 'Failed to submit report' }, { status: 500 })
    }

    const { data: reports, error: countErr } = await supabase
      .from('pinned_reports')
      .select('user_id, reporter_fingerprint')
      .eq('board_id', boardId)
      .eq('pinned_until_snapshot', pinnedUntil)
    if (countErr) {
      return NextResponse.json({ ok: true, message: 'Report recorded' })
    }
    const uniq = new Set<string>()
    for (const r of reports ?? []) {
      const row = r as { user_id?: string | null; reporter_fingerprint?: string | null }
      const key = row.user_id != null ? `u:${row.user_id}` : `f:${row.reporter_fingerprint ?? ''}`
      uniq.add(key)
    }
    if (uniq.size >= REPORT_THRESHOLD) {
      const { error: updateErr } = await supabase
        .from('boards')
        .update({ pinned_until: new Date().toISOString() })
        .eq('id', boardId)
      if (!updateErr) {
        return NextResponse.json({ ok: true, unpinned: true })
      }
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[api/boards/pin/report]', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
