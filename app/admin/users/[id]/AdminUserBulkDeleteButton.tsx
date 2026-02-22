'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { deleteAllUserActivity } from '../../actions'

const CONFIRM_MESSAGE =
  '이 유저가 작성한 모든 메시지와 참여 기록을 영구히 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.'

export default function AdminUserBulkDeleteButton({ userId }: { userId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const handleClick = async () => {
    if (!window.confirm(CONFIRM_MESSAGE)) return
    setLoading(true)
    try {
      const result = await deleteAllUserActivity(userId)
      if (result.ok) {
        alert('모든 활동이 삭제되었습니다.')
        router.refresh()
      } else {
        alert(result.error ?? '삭제에 실패했습니다.')
      }
    } catch (e) {
      alert('삭제 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className="shrink-0 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-orange-600 hover:bg-orange-500 disabled:opacity-50 transition-colors"
    >
      {loading ? '처리 중...' : '전체 활동 삭제'}
    </button>
  )
}
