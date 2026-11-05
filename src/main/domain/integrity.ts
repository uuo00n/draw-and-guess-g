import type Database from 'better-sqlite3'
import type { TimerEngine } from './timer-engine'

export type TurnRow = {
  id: string
  game_id: string
  team_id: string
  round_no: number
  sequence_no: number
  status: string
  end_reason: string | null
  current_queue_item_id: string | null
  remaining_ms: number
  turn_score: number
  started_at: string | null
  ended_at: string | null
}

export type QueueRow = {
  id: string
  game_id: string
  question_id: string
  queue_position: number
  state: string
  shown_turn_id: string | null
  first_allocated_at: string | null
  verdict: string | null
  question_text_snapshot: string
  normalized_text_snapshot: string
  category_snapshot: string
  difficulty_snapshot: string
  points_snapshot: number
}

export type GameRow = {
  id: string
  name: string
  status: string
  end_reason: string | null
  round_count: number
  turn_duration_ms: number
  score_mode: 'UNIFORM' | 'QUESTION_POINTS'
  current_turn_id: string | null
  planned_turn_count: number
  created_at: string
  started_at: string | null
  ended_at: string | null
}

const ACTIVE_TURN = new Set(['TURN_RUNNING', 'TURN_PAUSED'])

export function recoveryKey(gameId: string): string {
  return `recovery:${gameId}`
}

export function getRecoveryLock(
  db: Database.Database,
  gameId: string
): { reason: string } | null {
  const row = db
    .prepare('SELECT value_json FROM app_settings WHERE key = ?')
    .get(recoveryKey(gameId)) as { value_json: string } | undefined
  if (!row) return null
  const parsed = JSON.parse(row.value_json) as { reason?: string }
  return { reason: parsed.reason ?? 'UNKNOWN' }
}

export function setRecoveryLock(
  db: Database.Database,
  gameId: string,
  reason: string,
  timer?: TimerEngine
): void {
  db.prepare(
    `INSERT INTO app_settings (key, value_json, updated_at)
     VALUES (@key, @value, @updated)
     ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`
  ).run({
    key: recoveryKey(gameId),
    value: JSON.stringify({ reason }),
    updated: new Date().toISOString()
  })
  timer?.disarm(gameId)
}

export function detectIssues(db: Database.Database, gameId: string): string | null {
  const game = db.prepare('SELECT * FROM games WHERE id = ?').get(gameId) as GameRow | undefined
  if (!game) return 'ILLEGAL_POINTER'

  const turns = db.prepare('SELECT * FROM game_turns WHERE game_id = ?').all(gameId) as TurnRow[]
  const currents = db
    .prepare(`SELECT * FROM game_question_queue WHERE game_id = ? AND state = 'CURRENT'`)
    .all(gameId) as QueueRow[]

  if (currents.length > 1) return 'MULTIPLE_CURRENT'

  const badOpen = db
    .prepare(
      `SELECT COUNT(*) AS c FROM game_question_queue
       WHERE game_id = ? AND state IN ('UNUSED', 'CURRENT', 'VOIDED') AND verdict IS NOT NULL`
    )
    .get(gameId) as { c: number }
  if (badOpen.c > 0) return 'ILLEGAL_POINTER'

  const badJudged = db
    .prepare(
      `SELECT COUNT(*) AS c FROM game_question_queue
       WHERE game_id = ? AND state = 'JUDGED' AND verdict IS NULL`
    )
    .get(gameId) as { c: number }
  if (badJudged.c > 0) return 'ILLEGAL_POINTER'

  const active = turns.filter((turn) => ACTIVE_TURN.has(turn.status))
  if (active.length > 1) return 'MULTIPLE_ACTIVE_TURNS'

  if (game.current_turn_id) {
    const pointed = turns.find((turn) => turn.id === game.current_turn_id)
    if (!pointed) return 'ILLEGAL_POINTER'
  }

  if (active.length === 1) {
    const turn = active[0]
    if (game.current_turn_id && game.current_turn_id !== turn.id) return 'ILLEGAL_POINTER'
    if (!turn.current_queue_item_id) return 'ILLEGAL_POINTER'
    if (currents.length !== 1) return 'ILLEGAL_POINTER'
    const item = currents[0]
    if (item.id !== turn.current_queue_item_id) return 'ILLEGAL_POINTER'
    if (item.shown_turn_id !== turn.id) return 'ILLEGAL_POINTER'
    if (item.verdict != null) return 'ILLEGAL_POINTER'
  } else if (currents.length > 0) {
    return 'ILLEGAL_POINTER'
  }

  for (const turn of turns) {
    if (!ACTIVE_TURN.has(turn.status) && turn.current_queue_item_id) return 'ILLEGAL_POINTER'
    const eventSum = (
      db.prepare('SELECT COALESCE(SUM(score_delta), 0) AS s FROM answer_events WHERE turn_id = ?').get(
        turn.id
      ) as { s: number }
    ).s
    const turnAdj = (
      db
        .prepare(
          'SELECT COALESCE(SUM(delta), 0) AS s FROM score_adjustments WHERE turn_id = ?'
        )
        .get(turn.id) as { s: number }
    ).s
    if (Number(turn.turn_score) !== Number(eventSum) + Number(turnAdj)) return 'SCORE_MISMATCH'
  }

  const teams = db
    .prepare('SELECT id, total_score FROM game_teams WHERE game_id = ?')
    .all(gameId) as Array<{ id: string; total_score: number }>
  for (const team of teams) {
    const turnSum = (
      db
        .prepare('SELECT COALESCE(SUM(turn_score), 0) AS s FROM game_turns WHERE team_id = ?')
        .get(team.id) as { s: number }
    ).s
    const teamAdj = (
      db
        .prepare(
          'SELECT COALESCE(SUM(delta), 0) AS s FROM score_adjustments WHERE team_id = ? AND turn_id IS NULL'
        )
        .get(team.id) as { s: number }
    ).s
    if (Number(team.total_score) !== Number(turnSum) + Number(teamAdj)) return 'SCORE_MISMATCH'
  }

  return null
}

export function loadGameRow(db: Database.Database, gameId: string): GameRow {
  const game = db.prepare('SELECT * FROM games WHERE id = ?').get(gameId) as GameRow | undefined
  if (!game) throw new Error(`Game not found: ${gameId}`)
  return game
}

export function loadTurnRow(db: Database.Database, turnId: string): TurnRow {
  const turn = db.prepare('SELECT * FROM game_turns WHERE id = ?').get(turnId) as TurnRow | undefined
  if (!turn) throw new Error(`Turn not found: ${turnId}`)
  return turn
}

export function loadQueueItem(db: Database.Database, itemId: string): QueueRow | null {
  return (db.prepare('SELECT * FROM game_question_queue WHERE id = ?').get(itemId) as QueueRow | undefined) ?? null
}
