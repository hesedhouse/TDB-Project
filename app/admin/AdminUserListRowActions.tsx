'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toggleUserBan } from './actions'

export default function AdminUserListRowActions({
  userId,
  isBanned,
}: {
  userId: string
  isBanned: boolean
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

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
    } catch {
      alert('처리 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className={`px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-opacity disabled:opacity-50 ${
        isBanned ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-red-500 hover:bg-red-600'
      }`}
    >
      {loading ? '처리 중...' : isBanned ? '차단 해제' : '차단'}
    </button>
  )
}
