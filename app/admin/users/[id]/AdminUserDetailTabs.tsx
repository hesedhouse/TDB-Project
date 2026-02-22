'use client'

import { useState } from 'react'
import Link from 'next/link'

function formatDate(value: string | null | undefined): string {
  if (value == null) return '—'
  try {
    const d = new Date(value)
    return d.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  } catch {
    return '—'
  }
}

type MessageItem = {
  id: string
  boardId: string
  boardKeyword: string
  content: string
  authorNickname: string
  createdAt: string
}

type ParticipantItem = {
  boardId: string
  boardKeyword: string
  boardName: string
  userDisplayName: string
}

type ContributionSummary = {
  totalMinutes: number
  count: number
  byBoard: Record<string, number>
  boardsMap: Record<string, { id: string; keyword: string; name: string | null }>
}

type TabId = 'messages' | 'rooms' | 'contributions'

const TABS: { id: TabId; label: string }[] = [
  { id: 'messages', label: '메시지' },
  { id: 'rooms', label: '참여한 방' },
  { id: 'contributions', label: '기여도' },
]

export default function AdminUserDetailTabs({
  messages,
  participants,
  contributionSummary,
}: {
  messages: MessageItem[]
  participants: ParticipantItem[]
  contributionSummary: ContributionSummary
}) {
  const [activeTab, setActiveTab] = useState<TabId>('messages')

  return (
    <div className="rounded-2xl border border-white/10 bg-black/40 overflow-hidden" style={{ boxShadow: '0 0 28px rgba(255,107,0,0.06)' }}>
      <div className="flex border-b border-white/10">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-4 px-4 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'text-[#FF6B00] border-b-2 border-[#FF6B00] bg-white/5'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="p-4 sm:p-6 min-h-[280px]">
        {activeTab === 'messages' && (
          <div className="space-y-3">
            <p className="text-gray-400 text-sm mb-4">최근 메시지 10건</p>
            {messages.length === 0 ? (
              <p className="text-gray-500 py-8 text-center">작성한 메시지가 없습니다.</p>
            ) : (
              <ul className="space-y-3">
                {messages.map((m) => (
                  <li
                    key={m.id}
                    className="py-3 px-4 rounded-xl bg-white/5 border border-white/5 text-sm"
                  >
                    <div className="flex items-center justify-between text-gray-400 text-xs mb-1">
                      <span>{m.authorNickname}</span>
                      <span>{formatDate(m.createdAt)}</span>
                    </div>
                    <p className="text-white break-words">{m.content || '—'}</p>
                    <Link
                      href={`/board/${encodeURIComponent(m.boardKeyword)}`}
                      className="text-[#FF6B00] hover:underline text-xs mt-1 inline-block"
                    >
                      방으로 이동 →
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {activeTab === 'rooms' && (
          <div className="space-y-3">
            <p className="text-gray-400 text-sm mb-4">참여 중인 방 {participants.length}개</p>
            {participants.length === 0 ? (
              <p className="text-gray-500 py-8 text-center">참여한 방이 없습니다.</p>
            ) : (
              <ul className="space-y-2">
                {participants.map((p, i) => (
                  <li key={`${p.boardId}-${i}`} className="flex items-center justify-between py-2 px-4 rounded-xl bg-white/5 border border-white/5">
                    <span className="text-white font-medium">{p.boardName}</span>
                    <span className="text-gray-400 text-sm">닉네임: {p.userDisplayName}</span>
                    <Link
                      href={`/board/${encodeURIComponent(p.boardKeyword)}`}
                      className="text-[#FF6B00] hover:underline text-sm"
                    >
                      입장 →
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {activeTab === 'contributions' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="py-4 px-4 rounded-xl bg-[#FF6B00]/10 border border-[#FF6B00]/30">
                <p className="text-gray-400 text-xs uppercase tracking-wider">총 기여 분</p>
                <p className="text-2xl font-bold text-[#FF6B00]">{contributionSummary.totalMinutes}분</p>
              </div>
              <div className="py-4 px-4 rounded-xl bg-white/5 border border-white/10">
                <p className="text-gray-400 text-xs uppercase tracking-wider">기여 건수</p>
                <p className="text-2xl font-bold text-white">{contributionSummary.count}건</p>
              </div>
            </div>
            <p className="text-gray-400 text-sm mb-2">방별 기여 분</p>
            {Object.keys(contributionSummary.byBoard).length === 0 ? (
              <p className="text-gray-500 py-6 text-center">기여 내역이 없습니다.</p>
            ) : (
              <ul className="space-y-2">
                {Object.entries(contributionSummary.byBoard).map(([boardId, minutes]) => {
                  const board = contributionSummary.boardsMap[boardId]
                  const name = board?.name ?? board?.keyword ?? boardId
                  return (
                    <li
                      key={boardId}
                      className="flex items-center justify-between py-2 px-4 rounded-xl bg-white/5 border border-white/5"
                    >
                      <span className="text-white truncate mr-2">{name}</span>
                      <span className="text-[#FF6B00] font-medium shrink-0">{minutes}분</span>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
