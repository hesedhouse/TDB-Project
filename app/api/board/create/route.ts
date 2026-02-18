import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { createClient } from '@/lib/supabase/client'

const SALT_ROUNDS = 10

export type CreateBoardResponse = {
  id: string
  public_id: number | null
  keyword: string
  name: string | null
  expires_at: string
  created_at: string
  has_password: boolean
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const keyword = typeof body?.keyword === 'string' ? body.keyword.trim() : ''
    const password = typeof body?.password === 'string' ? body.password : undefined

    if (!keyword) {
      return NextResponse.json({ error: 'keyword required' }, { status: 400 })
    }

    const supabase = createClient()
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })
    }

    const selectCols = 'id, keyword, name, expires_at, created_at, public_id, password_hash'

    // 기존 방 있으면 그대로 반환 (생성 안 함)
    const { data: existing, error: selectErr } = await supabase
      .from('boards')
      .select(selectCols)
      .eq('keyword', keyword)
      .maybeSingle()

    if (selectErr) {
      console.error('[api/board/create] select error:', selectErr)
      return NextResponse.json({ error: 'Failed to check board' }, { status: 500 })
    }

    if (existing) {
      const row = existing as Record<string, unknown>
      return NextResponse.json(toBoardResponse(row))
    }

    // 새 방 생성: 비밀번호 있으면 해시 후 저장
    let password_hash: string | null = null
    if (password && password.length > 0) {
      password_hash = await bcrypt.hash(password, SALT_ROUNDS)
    }

    const displayTitle = `#${keyword}`
    const insertPayload = {
      keyword,
      name: displayTitle,
      title: displayTitle,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      ...(password_hash ? { password_hash } : {}),
    }

    const { data: inserted, error: insertErr } = await supabase
      .from('boards')
      .insert(insertPayload)
      .select(selectCols)
      .single()

    if (insertErr) {
      console.error('[api/board/create] insert error:', insertErr)
      return NextResponse.json({ error: 'Failed to create board' }, { status: 500 })
    }

    if (!inserted) {
      return NextResponse.json({ error: 'Create failed' }, { status: 500 })
    }

    return NextResponse.json(toBoardResponse(inserted as Record<string, unknown>))
  } catch (e) {
    console.error('[api/board/create]', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

function toBoardResponse(row: Record<string, unknown>): CreateBoardResponse {
  const has_password = Boolean(row.password_hash)
  const { password_hash: _, ...safe } = row
  return {
    ...safe,
    id: String(row.id),
    public_id: row.public_id != null ? Number(row.public_id) : null,
    name: row.name != null ? String(row.name) : null,
    expires_at: String(row.expires_at),
    created_at: String(row.created_at),
    keyword: String(row.keyword),
    has_password,
  } as CreateBoardResponse
}
