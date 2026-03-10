'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toggleUserBan } from '../../actions'

export default function AdminUserBanControl({
  userId,
  isBanned,
  isSelf,
}: {
  userId: string
  isBanned: boolean
  isSelf?: boolean
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  if (isSelf) {
    return (
      <p className="text-gray-400 italic text-sm">본인 계정은 관리할 수 없습니다.</p>
    )
  }

  const handleClick = async () => {
    const message = isBanned
      ? '정말 이 회원의 차단을 해제하시겠습니까?'
      : '정말 이 회원을 차단하시겠습니까?'
    if (!confirm(message)) return

    setLoading(true)
    try {
      const result = await toggleUserBan(userId)
      if (result.ok) {
        router.refresh()
      } else {
        alert(result.error ?? '처리 중 오류가 발생했습니다.')
      }
    } catch (e) {
      alert('처리 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {isBanned && (
        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-bold bg-red-500/20 text-red-400 border border-red-500/50">
          차단됨
        </span>
      )}
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className={`px-4 py-2 rounded-xl text-sm font-semibold text-white transition-opacity disabled:opacity-50 ${
          isBanned ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-red-500 hover:bg-red-600'
        }`}
      >
        {loading ? '처리 중...' : isBanned ? '차단 해제하고 복구하기' : '이 유저 차단하기'}
      </button>
    </div>
  )
}
