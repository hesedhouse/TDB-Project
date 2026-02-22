'use client'

import Link from 'next/link'

export type FilterValue = 'all' | 'active' | 'banned'

const TABS: { value: FilterValue; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'active', label: '활동 중' },
  { value: 'banned', label: '차단됨' },
]

export default function AdminUserFilterTabs({ currentFilter }: { currentFilter: FilterValue }) {
  return (
    <div className="flex gap-2 mb-6">
      {TABS.map((tab) => (
        <Link
          key={tab.value}
          href={tab.value === 'all' ? '/admin' : `/admin?filter=${tab.value}`}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
            currentFilter === tab.value
              ? 'bg-[#FF6B00] text-white'
              : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 border border-white/10'
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  )
}
