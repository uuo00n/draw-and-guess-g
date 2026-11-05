import { useEffect, useRef, useState } from 'react'
import type { GameCommandResult, PlaySnapshot } from '@shared/schemas/play'

function mergeSnapshot(previous: PlaySnapshot | null, next: PlaySnapshot): PlaySnapshot {
  const current = next.currentQuestion
  const previousQuestion = previous?.currentQuestion
  if (!current || current.text || current.queueItemId !== previousQuestion?.queueItemId) return next
  return { ...next, currentQuestion: previousQuestion }
}

export function useGameSnapshot(gameId: string): {
  snapshot: PlaySnapshot | null
  error: string | null
  pending: boolean
  run: (action: () => Promise<GameCommandResult>) => Promise<void>
} {
  const [snapshot, setSnapshot] = useState<PlaySnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const commandPending = useRef(false)
  const readVersion = useRef(0)
  const activeView = useRef<{ active: boolean } | null>(null)

  useEffect(() => {
    const view = { active: true }
    activeView.current = view
    async function reload(reportError = false): Promise<void> {
      if (commandPending.current || !view.active) return
      const version = ++readVersion.current
      try {
        const next = await window.gameAPI.games.get(gameId)
        if (view.active && readVersion.current === version) {
          setSnapshot((previous) => mergeSnapshot(previous, next))
        }
      } catch (reason) {
        if (reportError && view.active && readVersion.current === version) {
          setError(reason instanceof Error ? reason.message : '无法读取比赛')
        }
      }
    }

    void reload(true)
    const unsubscribe = window.gameAPI.events.subscribe((event) => {
      if (event.gameId === gameId) void reload()
    })
    const timer = window.setInterval(() => void reload(), 1000)
    return () => {
      view.active = false
      unsubscribe()
      window.clearInterval(timer)
    }
  }, [gameId])

  const run = async (action: () => Promise<GameCommandResult>): Promise<void> => {
    const view = activeView.current
    if (commandPending.current || !view?.active) return
    commandPending.current = true
    ++readVersion.current
    setPending(true)
    setError(null)
    try {
      const result = await action()
      if (!view.active) return
      const revealed = result.applied ? result.snapshot.currentQuestion : null
      if (revealed?.text) {
        const latest = await window.gameAPI.games.get(gameId)
        if (!view.active) return
        setSnapshot(mergeSnapshot(result.snapshot, latest))
      } else {
        setSnapshot((previous) => mergeSnapshot(previous, result.snapshot))
      }
    } catch (reason) {
      if (view.active) {
        setError(reason instanceof Error ? reason.message : '操作失败')
      }
    } finally {
      commandPending.current = false
      if (view.active) setPending(false)
    }
  }

  const questionHidden = !snapshot?.currentQuestion?.text
  return {
    snapshot:
      snapshot && questionHidden
        ? { ...snapshot, currentQuestion: null, canAnswer: false, canSkip: false }
        : snapshot,
    error,
    pending,
    run
  }
}
