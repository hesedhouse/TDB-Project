import Link from 'next/link'

const MESSAGES: Record<string, string> = {
  Banned: '계정이 차단되었습니다. 문의가 있으시면 관리자에게 연락해 주세요.',
  AccessDenied: '접근이 거부되었습니다.',
  Default: '로그인 중 오류가 발생했습니다.',
}

export default function AuthErrorPage({
  searchParams,
}: {
  searchParams: { error?: string }
}) {
  const error = typeof searchParams?.error === 'string' ? searchParams.error : undefined
  const message = (error ? MESSAGES[error] : undefined) ?? MESSAGES.Default

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white flex flex-col items-center justify-center px-4">
      <div
        className="rounded-2xl border border-white/10 bg-black/40 p-8 max-w-md w-full text-center"
        style={{ boxShadow: '0 0 28px rgba(255,107,0,0.06)' }}
      >
        <h1 className="text-xl font-bold text-white mb-2">로그인할 수 없습니다</h1>
        <p className="text-gray-400 mb-6">{message}</p>
        <Link
          href="/login"
          className="inline-block px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-[#FF6B00] hover:bg-[#e55f00] transition-colors"
        >
          로그인 페이지로
        </Link>
      </div>
    </main>
  )
}
