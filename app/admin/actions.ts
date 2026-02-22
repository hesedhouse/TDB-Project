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
    .select('is_banned')
    .eq('id', id)
    .maybeSingle()

  if (!user) return { ok: false, error: 'user not found' }

  const nextBanned = !(user as { is_banned?: boolean }).is_banned
  const { error } = await supabase.from('users').update({ is_banned: nextBanned }).eq('id', id)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/admin')
  revalidatePath(`/admin/users/${id}`)
  return { ok: true }
}
