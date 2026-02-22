/**
 * NextAuth용 Supabase 어댑터 — public 스키마 전용.
 * public.users, public.accounts, public.sessions, public.verification_tokens 테이블을 사용합니다.
 * 컬럼명은 NextAuth 스키마와 동일하게 userId, sessionToken, providerAccountId, emailVerified 등 camelCase를 사용한다고 가정합니다.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type {
  Adapter,
  AdapterUser,
  AdapterAccount,
  AdapterSession,
  VerificationToken,
} from 'next-auth/adapters'

function isDate(value: unknown): value is Date {
  return value instanceof Date
}

function format<T>(obj: Record<string, unknown>): T {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (value === null) continue
    if (isDate(value)) result[key] = value
    else if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) result[key] = new Date(value)
    else result[key] = value
  }
  return result as T
}

export interface SupabaseLocalAdapterOptions {
  url: string
  secret: string
}

export function SupabaseLocalAdapter(options: SupabaseLocalAdapterOptions): Adapter {
  const { url, secret } = options
  const supabase: SupabaseClient = createClient(url, secret, {
    db: { schema: 'public' },
    auth: { persistSession: false },
  })

  return {
    async createUser(user: Omit<AdapterUser, 'id'>) {
      const insert: Record<string, unknown> = {
        ...user,
        emailVerified: user.emailVerified?.toISOString?.() ?? null,
      }
      const { data, error } = await supabase.from('users').insert(insert).select().single()
      if (error) throw error
      return format<AdapterUser>(data as Record<string, unknown>)
    },

    async getUser(id: string) {
      const { data, error } = await supabase.from('users').select().eq('id', id).maybeSingle()
      if (error) throw error
      if (!data) return null
      return format<AdapterUser>(data as Record<string, unknown>)
    },

    async getUserByEmail(email: string) {
      const { data, error } = await supabase.from('users').select().eq('email', email).maybeSingle()
      if (error) throw error
      if (!data) return null
      return format<AdapterUser>(data as Record<string, unknown>)
    },

    async getUserByAccount(providerAndAccountId: Pick<AdapterAccount, 'provider' | 'providerAccountId'>) {
      const { providerAccountId, provider } = providerAndAccountId
      const { data, error } = await supabase
        .from('accounts')
        .select('users(*)')
        .match({ provider, providerAccountId })
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      const usersRaw = (data as { users: unknown[] }).users
      const user = Array.isArray(usersRaw) ? usersRaw[0] : usersRaw
      if (!user) return null
      return format<AdapterUser>(user as Record<string, unknown>)
    },

    async updateUser(user: Partial<AdapterUser> & Pick<AdapterUser, 'id'>) {
      const update: Record<string, unknown> = {
        ...user,
        emailVerified: user.emailVerified?.toISOString?.() ?? null,
      }
      const { data, error } = await supabase
        .from('users')
        .update(update)
        .eq('id', user.id)
        .select()
        .single()
      if (error) throw error
      return format<AdapterUser>(data as Record<string, unknown>)
    },

    async deleteUser(userId: string) {
      const { error } = await supabase.from('users').delete().eq('id', userId)
      if (error) throw error
    },

    async linkAccount(account: AdapterAccount) {
      const { error } = await supabase.from('accounts').insert(account as Record<string, unknown>)
      if (error) throw error
    },

    async unlinkAccount(providerAndAccountId: Pick<AdapterAccount, 'provider' | 'providerAccountId'>) {
      const { providerAccountId, provider } = providerAndAccountId
      const { error } = await supabase.from('accounts').delete().match({ provider, providerAccountId })
      if (error) throw error
    },

    async createSession(session: { sessionToken: string; userId: string; expires: Date }) {
      const { sessionToken, userId, expires } = session
      const insert = { sessionToken, userId, expires: expires.toISOString() }
      const { data, error } = await supabase.from('sessions').insert(insert).select().single()
      if (error) throw error
      return format<AdapterSession>(data as Record<string, unknown>)
    },

    async getSessionAndUser(sessionToken: string) {
      const { data, error } = await supabase
        .from('sessions')
        .select('*, users(*)')
        .eq('sessionToken', sessionToken)
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      const row = data as { users: unknown[]; [k: string]: unknown }
      const { users: usersRaw, ...sessionRow } = row
      const userRow = Array.isArray(usersRaw) ? usersRaw[0] : usersRaw
      if (!userRow) return null
      return {
        session: format<AdapterSession>(sessionRow),
        user: format<AdapterUser>(userRow as Record<string, unknown>),
      }
    },

    async updateSession(session: Partial<AdapterSession> & Pick<AdapterSession, 'sessionToken'>) {
      const update = {
        ...session,
        expires: session.expires?.toISOString?.() ?? undefined,
      }
      const { data, error } = await supabase
        .from('sessions')
        .update(update)
        .eq('sessionToken', session.sessionToken)
        .select()
        .single()
      if (error) throw error
      return data ? format<AdapterSession>(data as Record<string, unknown>) : null
    },

    async deleteSession(sessionToken: string) {
      const { error } = await supabase.from('sessions').delete().eq('sessionToken', sessionToken)
      if (error) throw error
    },

    async createVerificationToken(token: VerificationToken) {
      const insert = { ...token, expires: token.expires.toISOString() }
      const { data, error } = await supabase.from('verification_tokens').insert(insert).select().single()
      if (error) throw error
      const row = data as Record<string, unknown>
      const { id: _id, ...rest } = row
      return format<VerificationToken>(rest)
    },

    async useVerificationToken(params: { identifier: string; token: string }) {
      const { identifier, token } = params
      const { data, error } = await supabase
        .from('verification_tokens')
        .delete()
        .match({ identifier, token })
        .select()
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      const row = data as Record<string, unknown>
      const { id: _id, ...rest } = row
      return format<VerificationToken>(rest)
    },
  } as Adapter
}
