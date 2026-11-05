import { useEffect, useState } from 'react'

type ClockInput = {
  turnId: string | null
  status: string | null
  authoritativeRemainingMs: number
}

/** Display interpolation only. Never submits a verdict or finishes a turn. */
export function useTurnClock({ turnId, status, authoritativeRemainingMs }: ClockInput): number {
  const [displayMs, setDisplayMs] = useState(authoritativeRemainingMs)

  useEffect(() => {
    const startedAt = performance.now()
    if (status !== 'TURN_RUNNING') {
      setDisplayMs(authoritativeRemainingMs)
      return
    }
    const tick = (): void => {
      const elapsed = performance.now() - startedAt
      setDisplayMs(Math.max(0, authoritativeRemainingMs - elapsed))
    }
    tick()
    const id = window.setInterval(tick, 100)
    return () => window.clearInterval(id)
  }, [turnId, status, authoritativeRemainingMs])

  return displayMs
}
