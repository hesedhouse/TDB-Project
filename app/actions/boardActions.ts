'use server'

import { createServerClient } from '@/lib/supabase/server'

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000

export type HandleKeywordClickActionResult =
  | { ok: true; boardId: string | number }
  | { ok: false; error: string }

/**
 * 키워드 클릭 시: 활성 방 검색 → 없으면 새 방 생성(제목=키워드, expires_at=+1주일). 전광판은 비어 있음(NULL).
 * 반환: 입장 경로용 boardId (public_id 또는 keyword).
 */
export async function handleKeywordClickAction(
  keyword: string
): Promise<HandleKeywordClickActionResult> {
  const k = (keyword ?? '').toString().trim()
  if (!k) {
    return { ok: false, error: '키워드를 입력해 주세요.' }
  }

  const supabase = createServerClient()
  if (!supabase) {
    return { ok: false, error: '서비스 설정이 되어 있지 않습니다.' }
  }

  const now = new Date().toISOString()

  const { data: existing } = await supabase
    .from('boards')
    .select('id, keyword, public_id')
    .eq('keyword', k)
    .gt('expires_at', now)
    .order('expires_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing) {
    const row = existing as { keyword: string; public_id?: number | null }
    const boardId = row.public_id != null ? row.public_id : row.keyword
    return { ok: true, boardId }
  }

  const expiresAt = new Date(Date.now() + ONE_WEEK_MS).toISOString()
  const name = `#${k}`

  const { data: inserted, error: insertErr } = await supabase
    .from('boards')
    .insert({
      keyword: k,
      name,
      title: name,
      expires_at: expiresAt,
    })
    .select('id, keyword, public_id')
    .single()

  if (insertErr || !inserted) {
    console.error('handleKeywordClickAction insert error', insertErr)
    return { ok: false, error: '방 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.' }
  }

  const row = inserted as { keyword: string; public_id?: number | null }
  const boardId = row.public_id != null ? row.public_id : row.keyword
  return { ok: true, boardId }
}
