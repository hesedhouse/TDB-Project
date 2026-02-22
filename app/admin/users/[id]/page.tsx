import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import Link from 'next/link'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase/server'
import AdminUserDetailTabs from './AdminUserDetailTabs'

const ADMIN_EMAIL = 'hesedhouse2@gmail.com'

type UserRow = {
  id: string
  name: string | null
  email: string | null
  image: string | null
}

type MessageRow = {
  id: string
  board_id: string
  content: string
  author_nickname: string
  created_at: string
}

type RoomParticipantRow = {
  board_id: string
  user_display_name: string
}

type BoardRow = {
  id: string
  keyword: string
  name: string | null
}

type ContributionRow = {
  board_id: string
  user_display_name: string
  minutes: number
}

export default async function AdminUserDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email || session.user.email !== ADMIN_EMAIL) {
    redirect('/')
  }

  const userId = params.id?.trim()
  if (!userId) redirect('/admin')

  const supabase = createServerClient()
  if (!supabase) redirect('/admin')

  const { data: userRow } = await supabase
    .from('users')
    .select('id, name, email, image')
    .eq('id', userId)
    .maybeSingle()

  const user: UserRow | null = userRow as UserRow | null
  if (!user) redirect('/admin')

  const [messagesRes, participantsRes, contributionsRes] = await Promise.all([
    supabase
      .from('messages')
      .select('id, board_id, content, author_nickname, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('room_participants')
      .select('board_id, user_display_name')
      .eq('user_id', userId)
      .eq('is_active', true),
    supabase.from('contributions').select('board_id, user_display_name, minutes').eq('user_id', userId),
  ])

  const messages: MessageRow[] = (messagesRes.data ?? []) as MessageRow[]
  const participants: RoomParticipantRow[] = (participantsRes.data ?? []) as RoomParticipantRow[]
  const contributions: ContributionRow[] = (contributionsRes.data ?? []) as ContributionRow[]

  const participantBoardIds = [...new Set(participants.map((p) => p.board_id))]
  const messageBoardIds = [...new Set(messages.map((m) => m.board_id))]
  const boardIds = [...new Set([...participantBoardIds, ...messageBoardIds])]
  let boardsMap: Record<string, BoardRow> = {}
  if (boardIds.length > 0) {
    const { data: boardsData } = await supabase
      .from('boards')
      .select('id, keyword, name')
      .in('id', boardIds)
    const boards = (boardsData ?? []) as BoardRow[]
    boardsMap = Object.fromEntries(boards.map((b) => [b.id, b]))
  }

  const contributionSummary = {
    totalMinutes: contributions.reduce((sum, c) => sum + (c.minutes ?? 0), 0),
    count: contributions.length,
    byBoard: contributions.reduce<Record<string, number>>((acc, c) => {
      acc[c.board_id] = (acc[c.board_id] ?? 0) + (c.minutes ?? 0)
      return acc
    }, {}),
  }

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="max-w-4xl mx-auto px-4 py-8 sm:px-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link
              href="/admin"
              className="text-gray-400 hover:text-white text-sm font-medium"
            >
              ← 관리자 대시보드
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/40 p-6 mb-8" style={{ boxShadow: '0 0 28px rgba(255,107,0,0.06)' }}>
          <div className="flex items-center gap-4">
            {user.image ? (
              <img
                src={user.image}
                alt=""
                className="w-16 h-16 rounded-full object-cover border-2 border-[#FF6B00]/40"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-[#FF6B00]/20 border-2 border-[#FF6B00]/40 flex items-center justify-center text-[#FF6B00] font-bold text-xl">
                {(user.name ?? user.email ?? '?').slice(0, 1).toUpperCase()}
              </div>
            )}
            <div>
              <h1 className="text-xl font-bold text-white">{user.name ?? '—'}</h1>
              <p className="text-gray-400 text-sm">{user.email ?? '—'}</p>
              <p className="text-gray-500 text-xs mt-1">ID: {user.id}</p>
            </div>
          </div>
        </div>

        <AdminUserDetailTabs
          messages={messages.map((m) => ({
            id: m.id,
            boardId: m.board_id,
            boardKeyword: boardsMap[m.board_id]?.keyword ?? m.board_id,
            content: m.content,
            authorNickname: m.author_nickname,
            createdAt: m.created_at,
          }))}
          participants={participants.map((p) => ({
            boardId: p.board_id,
            boardKeyword: boardsMap[p.board_id]?.keyword ?? p.board_id,
            boardName: boardsMap[p.board_id]?.name ?? boardsMap[p.board_id]?.keyword ?? p.board_id,
            userDisplayName: p.user_display_name,
          }))}
          contributionSummary={{
            totalMinutes: contributionSummary.totalMinutes,
            count: contributionSummary.count,
            byBoard: contributionSummary.byBoard,
            boardsMap,
          }}
        />
      </div>
    </main>
  )
}
