import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import Link from 'next/link'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase/server'

const ADMIN_EMAIL = 'hesedhouse2@gmail.com'

type UserRow = {
  id: string
  name: string | null
  email: string | null
  image: string | null
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

export default async function AdminPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email || session.user.email !== ADMIN_EMAIL) {
    redirect('/')
  }

  const supabase = createServerClient()
  let users: UserRow[] = []
  if (supabase) {
    const { data, error } = await supabase
      .from('users')
      .select('id, name, email, image')
      .order('id', { ascending: false })
    if (!error && data) users = data as UserRow[]
  }

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="max-w-5xl mx-auto px-4 py-8 sm:px-6">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight" style={{ color: '#FF6B00', textShadow: '0 0 20px rgba(255,107,0,0.3)' }}>
              POPPIN 총 관리자 대시보드
            </h1>
            <p className="mt-2 text-gray-400 text-sm sm:text-base">
              총 가입자 수 <span className="font-bold text-white">{users.length}</span>명
            </p>
          </div>
          <Link
            href="/"
            className="px-4 py-2 rounded-xl text-sm font-medium border-2 border-[#FF6B00]/50 text-gray-200 hover:bg-[#FF6B00]/10 hover:border-[#FF6B00] transition-colors"
          >
            메인으로
          </Link>
        </div>

        <div className="rounded-2xl overflow-hidden border border-white/10 bg-black/40" style={{ boxShadow: '0 0 28px rgba(255,107,0,0.08)' }}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead>
                <tr className="border-b border-white/10 bg-white/5">
                  <th className="text-left py-4 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider w-14">프로필</th>
                  <th className="text-left py-4 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">이름</th>
                  <th className="text-left py-4 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">이메일</th>
                  <th className="text-left py-4 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">가입일</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-12 text-center text-gray-500">
                      등록된 유저가 없습니다.
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
                      <td className="py-3 px-4 text-gray-400 text-sm">
                        {formatDate(user.created_at ?? null)}
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
