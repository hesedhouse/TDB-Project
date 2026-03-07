'use client'

import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

function goHome() {
  try {
    if (typeof window !== 'undefined') window.location.href = '/'
  } catch {
    // ignore
  }
}

/** 클라이언트 예외 발생 시 튕기지 않고 메인으로 부드럽게 보냄 */
export default class ErrorBoundary extends Component<Props, State> {
  private redirectTimer: ReturnType<typeof setTimeout> | null = null

  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    try {
      console.error('[ErrorBoundary]', error, errorInfo)
    } catch {
      // 로깅 실패해도 앱은 메인으로 보냄
    }
  }

  componentDidUpdate(_prevProps: Props, prevState: State) {
    if (this.state.hasError && !prevState.hasError && typeof window !== 'undefined') {
      this.redirectTimer = setTimeout(() => {
        this.redirectTimer = null
        goHome()
      }, 2000)
    }
  }

  componentWillUnmount() {
    if (this.redirectTimer) clearTimeout(this.redirectTimer)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback
      return (
        <div className="min-h-screen bg-midnight-black text-white flex flex-col items-center justify-center p-6 safe-bottom">
          <p className="text-lg font-semibold text-white mb-2">잠시 문제가 발생했습니다</p>
          <p className="text-gray-400 text-sm text-center mb-6">
            메인으로 이동합니다.
          </p>
          <button
            type="button"
            onClick={goHome}
            className="px-5 py-2.5 rounded-xl font-medium text-white bg-[#FF6B00] hover:opacity-90 transition-opacity"
          >
            메인으로 가기
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
