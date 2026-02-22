'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { addBannedWord, deleteBannedWord } from '../actions'

type BannedWordRow = { id: string; word: string }

export default function AdminBannedWordsBlock({ initialWords }: { initialWords: BannedWordRow[] }) {
  const router = useRouter()
  const [word, setWord] = useState('')
  const [adding, setAdding] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = word.trim()
    if (!trimmed || adding) return
    setAdding(true)
    try {
      const formData = new FormData()
      formData.set('word', trimmed)
      const result = await addBannedWord(formData)
      if (result.ok) {
        setWord('')
        router.refresh()
      } else {
        alert(result.error ?? '추가에 실패했습니다.')
      }
    } finally {
      setAdding(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('이 금지어를 목록에서 삭제하시겠습니까?')) return
    setDeletingId(id)
    try {
      const result = await deleteBannedWord(id)
      if (result.ok) {
        router.refresh()
      } else {
        alert(result.error ?? '삭제에 실패했습니다.')
      }
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleAdd} className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={word}
          onChange={(e) => setWord(e.target.value)}
          placeholder="새 금지어 입력"
          className="flex-1 min-w-[200px] px-4 py-2.5 rounded-xl border border-white/20 bg-white/5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#FF6B00]/50 focus:border-[#FF6B00]/50"
          maxLength={100}
        />
        <button
          type="submit"
          disabled={adding || !word.trim()}
          className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-[#FF6B00] hover:bg-[#e55f00] disabled:opacity-50 disabled:pointer-events-none transition-colors"
        >
          {adding ? '추가 중...' : '추가'}
        </button>
      </form>

      <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
        <div className="px-4 py-3 border-b border-white/10">
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">등록된 금지어 ({initialWords.length}개)</h2>
        </div>
        {initialWords.length === 0 ? (
          <p className="py-8 text-center text-gray-500 text-sm">등록된 금지어가 없습니다.</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {initialWords.map((row) => (
              <li
                key={row.id}
                className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-white/5 transition-colors"
              >
                <span className="text-white font-medium break-all">{row.word}</span>
                <button
                  type="button"
                  onClick={() => handleDelete(row.id)}
                  disabled={deletingId === row.id}
                  className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-red-500/80 hover:bg-red-500 disabled:opacity-50 transition-colors"
                >
                  {deletingId === row.id ? '삭제 중...' : '삭제'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
