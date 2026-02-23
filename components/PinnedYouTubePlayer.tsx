'use client'

import { useEffect, useRef, useId } from 'react'
import { getServerTimeMs } from '@/lib/serverTime'
import { getCurrentVideoTimeSeconds } from '@/lib/serverTime'

declare global {
  interface Window {
    YT?: {
      ready: (fn: () => void) => void
      Player: new (
        elementId: string,
        options: {
          videoId: string
          playerVars?: { rel?: number; start?: number }
          events?: {
            onReady?: (e: { target: YTPlayerInstance }) => void
            onStateChange?: (e: { data: number; target: YTPlayerInstance }) => void
          }
        }
      ) => YTPlayerInstance
      PlayerState?: { ENDED: number; PLAYING: number }
    }
    onYouTubeIframeAPIReady?: () => void
  }
}

export interface YTPlayerInstance {
  seekTo: (seconds: number, allowSeekAhead: boolean) => void
  getCurrentTime: () => number
  getDuration: () => number
  destroy: () => void
}

const YT_PLAYER_STATE_ENDED = 0
const YT_PLAYER_STATE_PLAYING = 1
const DRIFT_THRESHOLD_SEC = 2
const SYNC_CHECK_INTERVAL_MS = 15000 // 15초마다 드리프트 보정

export interface PinnedYouTubePlayerProps {
  videoId: string
  /** 영상이 처음 고정된 시각(서버 기준). 동시 시청 싱크용. 없으면 0초부터 재생 */
  pinnedAt?: Date
  onEnded?: () => void
  className?: string
}

/**
 * 전광판용 유튜브 플레이어. 서버 시간 기준 동시 시청(Watch Together):
 * - PLAYING 시 강제 워프(seekTo), 주기적 드리프트 보정, 영상 종료 시 대기 UI.
 */
export default function PinnedYouTubePlayer({
  videoId,
  pinnedAt,
  onEnded,
  className = 'w-full h-full',
}: PinnedYouTubePlayerProps) {
  const containerId = useId().replace(/:/g, '-')
  const playerRef = useRef<YTPlayerInstance | null>(null)
  const onEndedRef = useRef(onEnded)
  onEndedRef.current = onEnded

  const pinnedAtMs = pinnedAt?.getTime()

  useEffect(() => {
    if (!videoId || typeof window === 'undefined') return

    let driftIntervalId: ReturnType<typeof setInterval> | null = null

    const mount = async () => {
      if (!window.YT?.Player) return
      const el = document.getElementById(containerId)
      if (!el) return

      const player = new window.YT.Player(containerId, {
        videoId,
        playerVars: { rel: 0, start: 0 },
        events: {
          onReady(async (e: { target: YTPlayerInstance }) => {
            const target = e.target
            playerRef.current = target
            if (pinnedAtMs != null) {
              const serverMs = await getServerTimeMs()
              const sec = getCurrentVideoTimeSeconds(pinnedAtMs, serverMs)
              target.seekTo(sec, true)
            }

            // 주기적 드리프트 보정
            driftIntervalId = setInterval(async () => {
              const p = playerRef.current
              if (!p || pinnedAtMs == null) return
              const duration = p.getDuration()
              if (Number.isNaN(duration) || duration <= 0) return
              const serverMs = await getServerTimeMs()
              const expectedSec = getCurrentVideoTimeSeconds(pinnedAtMs, serverMs)
              if (expectedSec >= duration) {
                onEndedRef.current?.()
                return
              }
              const currentSec = p.getCurrentTime()
              if (Math.abs(currentSec - expectedSec) > DRIFT_THRESHOLD_SEC) {
                p.seekTo(expectedSec, true)
              }
            }, SYNC_CHECK_INTERVAL_MS)
          },
          onStateChange(e: { data: number; target: YTPlayerInstance }) {
            const target = e.target
            if (e.data === YT_PLAYER_STATE_ENDED) {
              onEndedRef.current?.()
              return
            }
            if (e.data === YT_PLAYER_STATE_PLAYING && pinnedAtMs != null) {
              // 광고 종료·중도 입장 등 PLAYING 되는 순간 서버 시간으로 강제 워프
              const duration = target.getDuration()
              getServerTimeMs().then((serverMs) => {
                const currentVideoTime = getCurrentVideoTimeSeconds(pinnedAtMs, serverMs)
                if (duration > 0 && currentVideoTime >= duration) {
                  onEndedRef.current?.()
                  return
                }
                target.seekTo(Math.max(0, currentVideoTime), true)
              })
            }
          },
        },
      })
      playerRef.current = player as unknown as YTPlayerInstance
    }

    if (window.YT?.ready) {
      window.YT.ready(mount)
    } else {
      const tag = document.createElement('script')
      tag.src = 'https://www.youtube.com/iframe_api'
      const firstScript = document.getElementsByTagName('script')[0]
      firstScript?.parentNode?.insertBefore(tag, firstScript)
      window.onYouTubeIframeAPIReady = () => {
        window.YT?.ready(mount)
      }
      if (window.YT?.ready) window.YT.ready(mount)
    }

    return () => {
      if (driftIntervalId) clearInterval(driftIntervalId)
      const p = playerRef.current
      if (p?.destroy) p.destroy()
      playerRef.current = null
    }
  }, [videoId, containerId, pinnedAtMs])

  return <div id={containerId} className={className} />
}
