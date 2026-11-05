import type { AppDatabase } from '../database/connection'
import type { TimerEngine } from '../domain/timer-engine'

export function purgeAllGames(db: AppDatabase, timer: TimerEngine): number {
  const count = db.transaction(() => {
    const { changes } = db.prepare('DELETE FROM games').run()
    db.prepare('DELETE FROM used_questions').run()
    return changes
  }).immediate()
  timer.disarmAll()
  return count
}

export function resetUsedQuestions(db: AppDatabase): number | null {
  return db.transaction(() => {
    const unfinished = db.prepare(
      "SELECT 1 FROM games WHERE status IN ('GAME_READY', 'GAME_ACTIVE') LIMIT 1"
    ).get()
    if (unfinished) return null

    return db.prepare('DELETE FROM used_questions').run().changes
  }).immediate()
}
