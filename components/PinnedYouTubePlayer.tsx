'use client'

import React, { useEffect, useRef, useId } from 'react'
import { getServerTimeMs, getCurrentVideoTimeSeconds, isServerBeforePinStart } from '@/lib/serverTime'

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
      PlayerState?: { ENDED: number; PLAYING: number; BUFFERING: number }
    }
    onYouTubeIframeAPIReady?: () => void
  }
}

export interface YTPlayerInstance {
  seekTo: (seconds: number, allowSeekAhead: boolean) => void
  getCurrentTime: () => number
  getDuration: () => number
  playVideo?: () => void
  destroy: () => void
}

const YT_PLAYER_STATE_ENDED = 0
const YT_PLAYER_STATE_PLAYING = 1
/** 오차가 이 값(초) 이내면 seekTo 하지 않음. 너무 자주 seek 시 버퍼링·무한 루프 방지. */
const LOOSE_SYNC_THRESHOLD_SEC = 3
/** 주기적 드리프트 보정 간격. 초기 진입 후 30초마다 한 번만 미세 보정. */
const SYNC_CHECK_INTERVAL_MS = 30000

export interface PinnedYouTubePlayerProps {
  videoId: string
  /** 영상이 처음 고정된 시각(서버 기준). 동시 시청 싱크용. 없으면 0초부터 재생 */
  pinnedAt?: Date
  onEnded?: () => void
  className?: string
}

/**
 * 전광판용 유튜브 플레이어. 서버 시간 기준 동시 시청(Watch Together):
 * - 초기 진입 시 딱 한 번만 seekTo, 이후 30초마다 미세 보정(오차 3초 초과 시에만 seek).
 * - 전광판 고정 시 자동 재생(playVideo). BUFFERING → PLAYING 시 서버 시간에 맞춰 워프(느슨한 3초 기준).
 * - pinned_at 미래/미입력 시 seekTo(0) 무한 반복 방지.
 */
const PinnedYouTubePlayer: React.FC<PinnedYouTubePlayerProps> = function PinnedYouTubePlayer({
  videoId,
  pinnedAt,
  onEnded,
  className = 'w-full h-full',
}) {
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
          onReady: async (e: { target: YTPlayerInstance }) => {
            const target = e.target
            playerRef.current = target

            if (!pinnedAtMs) {
              target.playVideo?.()
              return
            }

            const serverMs = await getServerTimeMs()
            if (!isServerBeforePinStart(pinnedAtMs, serverMs)) {
              const sec = getCurrentVideoTimeSeconds(pinnedAtMs, serverMs)
              target.seekTo(sec, true)
            }
            target.playVideo?.()

            driftIntervalId = setInterval(async () => {
              const p = playerRef.current
              if (!p || !pinnedAtMs) return
              const duration = p.getDuration()
              if (Number.isNaN(duration) || duration <= 0) return
              const serverMs = await getServerTimeMs()
              if (isServerBeforePinStart(pinnedAtMs, serverMs)) return
              const expectedSec = getCurrentVideoTimeSeconds(pinnedAtMs, serverMs)
              if (expectedSec >= duration) {
                onEndedRef.current?.()
                return
              }
              if (expectedSec <= 0) return
              const currentSec = p.getCurrentTime()
              if (Math.abs(currentSec - expectedSec) > LOOSE_SYNC_THRESHOLD_SEC) {
                p.seekTo(expectedSec, true)
              }
            }, SYNC_CHECK_INTERVAL_MS)
          },
          onStateChange: (e: { data: number; target: YTPlayerInstance }) => {
            const target = e.target
            if (e.data === YT_PLAYER_STATE_ENDED) {
              onEndedRef.current?.()
              return
            }
            if (e.data !== YT_PLAYER_STATE_PLAYING || !pinnedAtMs) return

            getServerTimeMs().then((serverMs) => {
              if (isServerBeforePinStart(pinnedAtMs, serverMs)) return
              const expectedSec = getCurrentVideoTimeSeconds(pinnedAtMs, serverMs)
              const duration = target.getDuration()
              if (Number.isFinite(duration) && duration > 0 && expectedSec >= duration) {
                onEndedRef.current?.()
                return
              }
              if (expectedSec <= 0) return
              const currentSec = target.getCurrentTime()
              if (Math.abs(currentSec - expectedSec) <= LOOSE_SYNC_THRESHOLD_SEC) return
              target.seekTo(Math.max(0, expectedSec), true)
            })
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
export default PinnedYouTubePlayer
