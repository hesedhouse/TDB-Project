import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { createClient } from '@/lib/supabase/client'
import { isValidUuid } from '@/lib/supabase/client'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const publicId = body?.publicId != null ? Number(body.publicId) : null
    const boardId = typeof body?.boardId === 'string' ? body.boardId.trim() : null
    const password = typeof body?.password === 'string' ? body.password : ''

    if (!password) {
      return NextResponse.json({ ok: false, error: 'password required' }, { status: 400 })
    }
    if ((publicId == null || !Number.isFinite(publicId)) && !boardId) {
      return NextResponse.json({ ok: false, error: 'publicId or boardId required' }, { status: 400 })
    }
    if (boardId && !isValidUuid(boardId)) {
      return NextResponse.json({ ok: false, error: 'invalid boardId' }, { status: 400 })
    }

    const supabase = createClient()
    if (!supabase) {
      return NextResponse.json({ ok: false, error: 'Supabase not configured' }, { status: 503 })
    }

    let queryWithPassword = supabase.from('boards').select('id, password_hash, password').limit(1)
    let queryHashOnly = supabase.from('boards').select('id, password_hash').limit(1)
    if (publicId != null && Number.isFinite(publicId)) {
      queryWithPassword = queryWithPassword.eq('public_id', publicId)
      queryHashOnly = queryHashOnly.eq('public_id', publicId)
    } else if (boardId) {
      queryWithPassword = queryWithPassword.eq('id', boardId)
      queryHashOnly = queryHashOnly.eq('id', boardId)
    } else {
      return NextResponse.json({ ok: false, error: 'publicId or boardId required' }, { status: 400 })
    }

    let row: { password_hash?: string | null; password?: string | null } | null = null
    const res1 = await queryWithPassword.maybeSingle()
    if (!res1.error && res1.data) {
      row = res1.data as { password_hash?: string | null; password?: string | null }
    } else {
      const res2 = await queryHashOnly.maybeSingle()
      if (res2.error) {
        console.error('[api/boards/verify-password]', res2.error)
        return NextResponse.json({ ok: false, error: 'Failed to verify' }, { status: 500 })
      }
      row = res2.data as { password_hash?: string | null } | null
    }
    if (!row) {
      return NextResponse.json({ ok: false, error: 'Board not found' }, { status: 404 })
    }

    const hash = row.password_hash ?? row.password
    if (!hash) {
      return NextResponse.json({ ok: true })
    }

    const match = await bcrypt.compare(password, hash)
    return NextResponse.json({ ok: match })
  } catch (e) {
    console.error('[api/boards/verify-password]', e)
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 })
  }
}
