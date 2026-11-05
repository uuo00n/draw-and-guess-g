import type { AppDatabase } from '../database/connection'
import type { TimerEngine } from '../domain/timer-engine'

export function purgeAllGames(db: AppDatabase, timer: TimerEngine): number {
  const countRow = db.prepare('SELECT COUNT(*) AS c FROM games').get() as { c: number }
  const count = Number(countRow.c)
  if (count === 0) {
    timer.disarmAll()
    return 0
  }
  const ids = db.prepare('SELECT id FROM games').all() as Array<{ id: string }>
  db.transaction(() => {
    db.prepare('DELETE FROM games').run()
  })()
  for (const row of ids) {
    timer.disarm(row.id)
  }
  return count
}
