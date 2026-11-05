import { useCallback, useEffect, useState } from 'react'
import type { PlaySnapshot } from '@shared/schemas/play'

export function useGameSnapshot(gameId: string): {
  snapshot: PlaySnapshot | null
  error: string | null
  setSnapshot: (snapshot: PlaySnapshot) => void
  setError: (message: string | null) => void
  reload: () => Promise<void>
} {
  const [snapshot, setSnapshot] = useState<PlaySnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const next = await window.gameAPI.games.get(gameId)
    setSnapshot(next)
  }, [gameId])

  useEffect(() => {
    let cancelled = false
    void window.gameAPI.games
      .get(gameId)
      .then((next) => {
        if (!cancelled) setSnapshot(next)
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : '无法读取比赛')
      })
    const unsubscribe = window.gameAPI.events.subscribe((event) => {
      if (event.gameId === gameId) void reload()
    })
    const timer = window.setInterval(() => {
      if (!cancelled) void reload().catch(() => undefined)
    }, 1000)
    return () => {
      cancelled = true
      unsubscribe()
      window.clearInterval(timer)
    }
  }, [gameId, reload])

  return { snapshot, error, setSnapshot, setError, reload }
}
