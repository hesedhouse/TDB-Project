import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import Link from 'next/link'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase/server'
import AdminUserFilterTabs, { type FilterValue } from './AdminUserFilterTabs'
import AdminUserListRowActions from './AdminUserListRowActions'

const ADMIN_EMAIL = 'hesedhouse2@gmail.com'

type UserRow = {
  id: string
  name: string | null
  email: string | null
  image: string | null
  is_banned?: boolean
  created_at?: string | null
}

function formatDate(value: string | null | undefined): string {
  if (value == null) return '—'
  try {
    const d = new Date(value)
    return d.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  } catch {
    return '—'
  }
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: { filter?: string }
}) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email || session.user.email !== ADMIN_EMAIL) {
    redirect('/')
  }

  const filterParam = typeof searchParams?.filter === 'string' ? searchParams.filter : undefined
  const currentFilter: FilterValue =
    filterParam === 'banned' ? 'banned' : filterParam === 'active' ? 'active' : 'all'

  const supabase = createServerClient()
  let allUsers: UserRow[] = []
  if (supabase) {
    const { data, error } = await supabase
      .from('users')
      .select('id, name, email, image, is_banned')
      .order('id', { ascending: false })
    if (!error && data) allUsers = data as UserRow[]
  }

  const users: UserRow[] =
    currentFilter === 'banned'
      ? allUsers.filter((u) => u.is_banned === true)
      : currentFilter === 'active'
        ? allUsers.filter((u) => !u.is_banned)
        : allUsers

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="max-w-5xl mx-auto px-4 py-8 sm:px-6">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight" style={{ color: '#FF6B00', textShadow: '0 0 20px rgba(255,107,0,0.3)' }}>
              POPPIN 총 관리자 대시보드
            </h1>
            <p className="mt-2 text-gray-400 text-sm sm:text-base">
              {currentFilter === 'all' && `총 가입자 수 `}
              <span className="font-bold text-white">{users.length}</span>명
              {currentFilter !== 'all' && ` (${currentFilter === 'banned' ? '차단' : '활동 중'})`}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/admin/settings"
              className="px-4 py-2 rounded-xl text-sm font-medium border border-white/20 text-gray-300 hover:bg-white/10 hover:text-white transition-colors"
            >
              금지어 설정
            </Link>
            <Link
              href="/"
              className="px-4 py-2 rounded-xl text-sm font-medium border-2 border-[#FF6B00]/50 text-gray-200 hover:bg-[#FF6B00]/10 hover:border-[#FF6B00] transition-colors"
            >
              메인으로
            </Link>
          </div>
        </div>

        <AdminUserFilterTabs currentFilter={currentFilter} />

        <div className="rounded-2xl overflow-hidden border border-white/10 bg-black/40" style={{ boxShadow: '0 0 28px rgba(255,107,0,0.08)' }}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr className="border-b border-white/10 bg-white/5">
                  <th className="text-left py-4 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider w-14">프로필</th>
                  <th className="text-left py-4 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">이름</th>
                  <th className="text-left py-4 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">이메일</th>
                  <th className="text-left py-4 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">상태</th>
                  <th className="text-left py-4 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">가입일</th>
                  <th className="text-right py-4 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider w-24">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-gray-500">
                      {currentFilter === 'all' ? '등록된 유저가 없습니다.' : '해당 조건의 유저가 없습니다.'}
                    </td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <tr key={user.id} className="hover:bg-white/5 transition-colors">
                      <td className="py-3 px-4">
                        {user.image ? (
                          <img
                            src={user.image}
                            alt=""
                            className="w-10 h-10 rounded-full object-cover border-2 border-[#FF6B00]/30"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-[#FF6B00]/20 border-2 border-[#FF6B00]/30 flex items-center justify-center text-[#FF6B00] font-bold text-sm">
                            {(user.name ?? user.email ?? '?').slice(0, 1).toUpperCase()}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 font-medium text-white">
                        <Link href={`/admin/users/${user.id}`} className="text-white hover:text-[#FF6B00] hover:underline">
                          {user.name ?? '—'}
                        </Link>
                      </td>
                      <td className="py-3 px-4 text-gray-300 text-sm">
                        {user.email ?? '—'}
                      </td>
                      <td className="py-3 px-4">
                        {user.is_banned ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-red-500/20 text-red-400 border border-red-500/50">
                            차단됨
                          </span>
                        ) : (
                          <span className="text-gray-400 text-sm">활동 중</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-gray-400 text-sm">
                        {formatDate(user.created_at ?? null)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <AdminUserListRowActions userId={user.id} isBanned={!!user.is_banned} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  )
}
