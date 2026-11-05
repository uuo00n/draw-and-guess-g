export class TimerEngine {
  private sessions = new Map<string, { deadline: number; turnId: string }>()

  arm(gameId: string, turnId: string, remainingMs: number, now: number): void {
    this.sessions.set(gameId, { deadline: now + remainingMs, turnId })
  }

  disarm(gameId: string): void {
    this.sessions.delete(gameId)
  }

  peek(gameId: string, now: number): number | null {
    const session = this.sessions.get(gameId)
    if (!session) return null
    return Math.max(0, Math.round(session.deadline - now))
  }

  turnId(gameId: string): string | null {
    return this.sessions.get(gameId)?.turnId ?? null
  }

  activeGameIds(): string[] {
    return [...this.sessions.keys()]
  }
}

export const timerEngine = new TimerEngine()
