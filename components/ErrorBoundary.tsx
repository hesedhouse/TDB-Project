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

/** 클라이언트 예외 발생 시 전체 화면이 죽지 않도록 안내 UI 표시 */
export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback
      return (
        <div className="min-h-screen bg-midnight-black text-white flex flex-col items-center justify-center p-6 safe-bottom">
          <p className="text-lg font-semibold text-white mb-2">잠시 문제가 발생했습니다</p>
          <p className="text-gray-400 text-sm text-center mb-6">
            페이지를 새로고침하거나, 잠시 후 다시 시도해 주세요.
          </p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false })}
            className="px-5 py-2.5 rounded-xl font-medium text-white bg-[#FF6B00] hover:opacity-90 transition-opacity"
          >
            다시 시도
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
