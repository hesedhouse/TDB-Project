import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { createClient } from '@/lib/supabase/client'

const SALT_ROUNDS = 10

export type CreateBoardResponse = {
  id: string
  public_id: number | null
  /** 방 번호. room_no 우선, 없으면 public_id (헤더 'No. {room_no}' 배지용) */
  room_no: number | null
  keyword: string
  name: string | null
  expires_at: string
  created_at: string
  has_password: boolean
}

export async function POST(request: Request) {
  try {
    // 환경 변수: 연결 여부만 로그 (키 값 노출 금지)
    const supabaseUrlSet = Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
        String(process.env.NEXT_PUBLIC_SUPABASE_URL).trim().length > 0
    )
    console.log('[api/boards/create] Supabase URL 연결 여부:', supabaseUrlSet ? '설정됨' : '미설정')

    const body = await request.json()
    const keyword = typeof body?.keyword === 'string' ? body.keyword.trim() : ''
    const password = typeof body?.password === 'string' ? body.password : undefined

    if (!keyword) {
      return NextResponse.json({ error: 'keyword required' }, { status: 400 })
    }

    const supabase = createClient()
    if (!supabase) {
      console.error('[api/boards/create] Supabase not configured (env 누락 또는 createClient null)')
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })
    }

    const selectColsWithPassword = 'id, keyword, name, expires_at, created_at, public_id, room_no, password_hash'
    const selectColsWithoutPassword = 'id, keyword, name, expires_at, created_at, public_id, password_hash'
    const selectColsMinimal = 'id, keyword, name, expires_at, created_at, public_id'

    // 기존 방 있으면 그대로 반환 (생성 안 함). password_hash 컬럼 없을 수 있으므로 폴백
    let existing: Record<string, unknown> | null = null
    const { data: existingWith, error: selectErrWith } = await supabase
      .from('boards')
      .select(selectColsWithPassword)
      .eq('keyword', keyword)
      .maybeSingle()
    if (!selectErrWith && existingWith) {
      existing = existingWith as Record<string, unknown>
    } else if (selectErrWith) {
      console.warn('[api/boards/create] boards.password_hash 컬럼 없음 또는 오류. Supabase에서 boards_migration_password.sql 실행 여부 확인.', selectErrWith?.message ?? selectErrWith)
      const { data: existingWithout, error: selectErrWithout } = await supabase
        .from('boards')
        .select(selectColsWithoutPassword)
        .eq('keyword', keyword)
        .maybeSingle()
      if (selectErrWithout) {
        const selErr = selectErrWithout
        console.error('[api/boards/create] select error (상세):', {
          message: selErr?.message,
          code: selErr?.code,
          details: selErr?.details,
          full: selErr,
        })
        return NextResponse.json({ error: selErr?.message ?? 'Failed to check board' }, { status: 500 })
      }
      existing = existingWithout ? (existingWithout as Record<string, unknown>) : null
    }

    if (existing) {
      return NextResponse.json(toBoardResponse(existing))
    }

    // 새 방 생성: 비밀번호 있으면 해시 후 저장
    let password_hash: string | null = null
    if (password && password.length > 0) {
      password_hash = await bcrypt.hash(password, SALT_ROUNDS)
    }

    const displayTitle = `#${keyword}`
    // room_no는 SERIAL이므로 insert에 포함하지 않음. 전달 필드: name, title, password_hash(선택)
    const insertPayload = {
      keyword,
      name: displayTitle,
      title: displayTitle,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      ...(password_hash ? { password_hash } : {}),
    }
    console.log('[api/boards/create] insert payload 확인 (room_no 미포함):', {
      keys: Object.keys(insertPayload),
      keyword,
      name: insertPayload.name,
      title: insertPayload.title,
      hasPassword: Boolean(password_hash),
    })

    let inserted: Record<string, unknown> | null = null
    const insertWithRes = await supabase
      .from('boards')
      .insert(insertPayload)
      .select(selectColsWithPassword)
      .single()

    if (!insertWithRes.error && insertWithRes.data) {
      inserted = insertWithRes.data as Record<string, unknown>
    } else if (insertWithRes.error && password_hash) {
      const err = insertWithRes.error
      console.error('[api/boards/create] insert 실패 (상세):', {
        message: err?.message,
        code: err?.code,
        details: err?.details,
        hint: err?.hint,
        full: err,
      })
      console.warn('[api/boards/create] password_hash 제외하고 재시도.')
      const { password_hash: _, ...payloadWithoutPassword } = insertPayload
      const insertWithoutRes = await supabase
        .from('boards')
        .insert(payloadWithoutPassword)
        .select(selectColsWithoutPassword)
        .single()
      if (insertWithoutRes.error) {
        const err2 = insertWithoutRes.error
        console.error('[api/boards/create] insert 재시도 실패 (상세):', {
          message: err2?.message,
          code: err2?.code,
          details: err2?.details,
          hint: err2?.hint,
          full: err2,
        })
        const msg = err2?.message ?? 'Failed to create board'
        return NextResponse.json({ error: msg }, { status: 500 })
      }
      inserted = insertWithoutRes.data as Record<string, unknown>
    } else if (insertWithRes.error) {
      const err = insertWithRes.error
      console.error('[api/boards/create] insert 실패 (상세):', {
        message: err?.message,
        code: err?.code,
        details: err?.details,
        hint: err?.hint,
        full: err,
      })
      const msg = err?.message ?? 'Failed to create board'
      return NextResponse.json({ error: msg }, { status: 500 })
    }

    if (!inserted) {
      return NextResponse.json({ error: 'Create failed' }, { status: 500 })
    }

    if (inserted.public_id == null && inserted.id) {
      const { data: refetched } = await supabase
        .from('boards')
        .select(selectColsWithPassword)
        .eq('id', inserted.id)
        .single()
      if (refetched) inserted = refetched as Record<string, unknown>
    }

    return NextResponse.json(toBoardResponse(inserted))
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e))
    console.error('[api/boards/create] 예외 (상세):', {
      message: err.message,
      name: err.name,
      stack: err.stack,
      raw: e,
    })
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 })
  }
}

function toBoardResponse(row: Record<string, unknown>): CreateBoardResponse {
  const has_password = Boolean(row.password_hash)
  const { password_hash: _, ...safe } = row
  const publicId = row.public_id != null ? Number(row.public_id) : null
  const roomNo = row.room_no != null ? Number(row.room_no) : publicId
  return {
    ...safe,
    id: String(row.id),
    public_id: publicId,
    room_no: roomNo,
    name: row.name != null ? String(row.name) : null,
    expires_at: String(row.expires_at),
    created_at: String(row.created_at),
    keyword: String(row.keyword),
    has_password,
  } as CreateBoardResponse
}
