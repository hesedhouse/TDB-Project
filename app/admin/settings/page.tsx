import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import Link from 'next/link'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase/server'
import AdminBannedWordsBlock from './AdminBannedWordsBlock'

const ADMIN_EMAIL = 'hesedhouse2@gmail.com'

type BannedWordRow = { id: string; word: string }

export default async function AdminSettingsPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email || session.user.email !== ADMIN_EMAIL) {
    redirect('/')
  }

  const supabase = createServerClient()
  if (!supabase) redirect('/admin')

  const { data: rows } = await supabase
    .from('banned_words')
    .select('id, word')
    .order('word', { ascending: true })

  const words: BannedWordRow[] = (rows ?? []).map((r) => ({
    id: (r as { id: string }).id,
    word: (r as { word: string }).word ?? '',
  }))

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="max-w-3xl mx-auto px-4 py-8 sm:px-6">
        <div className="flex items-center justify-between mb-8">
          <div>
            <Link
              href="/admin"
              className="text-gray-400 hover:text-white text-sm font-medium mb-2 inline-block"
            >
              ← 관리자 대시보드
            </Link>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight" style={{ color: '#FF6B00', textShadow: '0 0 20px rgba(255,107,0,0.3)' }}>
              금지어 설정
            </h1>
            <p className="mt-2 text-gray-400 text-sm">
              채팅에서 필터링할 금지어를 추가·삭제합니다.
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/40 p-6" style={{ boxShadow: '0 0 28px rgba(255,107,0,0.06)' }}>
          <AdminBannedWordsBlock initialWords={words} />
        </div>
      </div>
    </main>
  )
}
