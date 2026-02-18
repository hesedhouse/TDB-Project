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

    let query = supabase
      .from('boards')
      .select('id, password_hash')
      .limit(1)

    if (publicId != null && Number.isFinite(publicId)) {
      query = query.eq('public_id', publicId)
    } else if (boardId) {
      query = query.eq('id', boardId)
    } else {
      return NextResponse.json({ ok: false, error: 'publicId or boardId required' }, { status: 400 })
    }

    const { data: row, error } = await query.maybeSingle()

    if (error) {
      console.error('[api/board/verify-password]', error)
      return NextResponse.json({ ok: false, error: 'Failed to verify' }, { status: 500 })
    }
    if (!row) {
      return NextResponse.json({ ok: false, error: 'Board not found' }, { status: 404 })
    }

    const hash = (row as { password_hash?: string | null }).password_hash
    if (!hash) {
      return NextResponse.json({ ok: true })
    }

    const match = await bcrypt.compare(password, hash)
    return NextResponse.json({ ok: match })
  } catch (e) {
    console.error('[api/board/verify-password]', e)
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 })
  }
}
