import type Database from 'better-sqlite3'

export const UNUSED_QUEUE_QUESTION = `state = 'UNUSED'
  AND NOT EXISTS (
    SELECT 1 FROM used_questions
    WHERE normalized_text = game_question_queue.normalized_text_snapshot
  )`

export const UNUSED_BANK_QUESTION = `NOT EXISTS (
  SELECT 1 FROM used_questions WHERE normalized_text = q.normalized_text
)`

export function countAvailableQuestions(db: Database.Database, gameId: string): number {
  return (
    db
      .prepare(
        `SELECT COUNT(*) AS count FROM game_question_queue WHERE game_id = ? AND ${UNUSED_QUEUE_QUESTION}`
      )
      .get(gameId) as { count: number }
  ).count
}
