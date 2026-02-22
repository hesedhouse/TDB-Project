'use server'

import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { revalidatePath } from 'next/cache'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase/server'

const ADMIN_EMAIL = 'hesedhouse2@gmail.com'

export async function toggleUserBan(userId: string): Promise<{ ok: boolean; error?: string }> {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email || session.user.email !== ADMIN_EMAIL) {
    redirect('/')
  }

  const id = userId?.trim()
  if (!id) return { ok: false, error: 'invalid user id' }

  const supabase = createServerClient()
  if (!supabase) return { ok: false, error: 'database unavailable' }

  const { data: user } = await supabase
    .from('users')
    .select('is_banned, email')
    .eq('id', id)
    .maybeSingle()

  if (!user) return { ok: false, error: 'user not found' }

  const targetEmail = (user as { email?: string | null }).email
  if (targetEmail && session.user.email && targetEmail === session.user.email) {
    return { ok: false, error: '본인을 차단할 수 없습니다.' }
  }

  const nextBanned = !(user as { is_banned?: boolean }).is_banned
  const { error } = await supabase.from('users').update({ is_banned: nextBanned }).eq('id', id)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/admin')
  revalidatePath(`/admin/users/${id}`)
  return { ok: true }
}

export async function addBannedWord(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email || session.user.email !== ADMIN_EMAIL) {
    redirect('/')
  }
  const word = (formData.get('word') as string)?.trim()
  if (!word) return { ok: false, error: '단어를 입력해 주세요.' }

  const supabase = createServerClient()
  if (!supabase) return { ok: false, error: 'database unavailable' }

  const { error } = await supabase.from('banned_words').insert({ word })
  if (error) return { ok: false, error: error.message }
  revalidatePath('/admin/settings')
  return { ok: true }
}

export async function deleteBannedWord(id: string): Promise<{ ok: boolean; error?: string }> {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email || session.user.email !== ADMIN_EMAIL) {
    redirect('/')
  }
  const rowId = id?.trim()
  if (!rowId) return { ok: false, error: 'invalid id' }

  const supabase = createServerClient()
  if (!supabase) return { ok: false, error: 'database unavailable' }

  const { error } = await supabase.from('banned_words').delete().eq('id', rowId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/admin/settings')
  return { ok: true }
}

export async function deleteAdminMessage(messageId: string): Promise<{ ok: boolean; error?: string }> {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email || session.user.email !== ADMIN_EMAIL) {
    redirect('/')
  }
  const id = messageId?.trim()
  if (!id) return { ok: false, error: 'invalid message id' }

  const supabase = createServerClient()
  if (!supabase) return { ok: false, error: 'database unavailable' }

  const { error } = await supabase.from('messages').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
