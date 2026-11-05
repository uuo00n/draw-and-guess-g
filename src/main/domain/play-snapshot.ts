import { countAvailableQuestions } from './question-availability'
import type Database from 'better-sqlite3'
import { TURN_SKIP_LIMIT } from '../../shared/constants'
import type { PlayPhase, PlaySnapshot } from '../../shared/schemas/play'
import { loadGameSnapshot } from './game-create'
import {
  detectIssues,
  getRecoveryLock,
  loadQueueItem,
  setRecoveryLock,
  type GameRow,
  type TurnRow
} from './integrity'
import type { TimerEngine } from './timer-engine'

const TERMINAL_GAME = new Set(['GAME_FINISHED', 'GAME_FINISHED_EARLY', 'GAME_ABORTED'])

function countAction(db: Database.Database, turnId: string, action: string): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS c FROM answer_events e
       WHERE e.turn_id = ? AND e.action = ?
         AND NOT EXISTS (
           SELECT 1 FROM answer_events u WHERE u.reverts_event_id = e.id
         )`
    )
    .get(turnId, action) as { c: number }
  return Number(row.c)
}

function derivePhase(gameStatus: string, turnStatus: string | null, recovery: boolean): PlayPhase {
  if (recovery) return 'recovery'
  if (gameStatus === 'GAME_FINISHED') return 'final'
  if (gameStatus === 'GAME_FINISHED_EARLY') return 'final-early'
  if (gameStatus === 'GAME_ABORTED') return 'aborted'
  if (turnStatus === 'TURN_RUNNING') return 'running'
  if (turnStatus === 'TURN_PAUSED') return 'paused'
  if (turnStatus === 'TURN_FINISHED') return 'turn-result'
  if (turnStatus === 'TURN_EXHAUSTED') return 'final-early'
  return 'ready'
}

export function authoritativeRemaining(turn: TurnRow, timer: TimerEngine, now: number): number {
  if (turn.status === 'TURN_RUNNING') {
    const live = timer.peek(turn.game_id, now)
    if (live != null) return live
  }
  return turn.remaining_ms
}

export function resolveTurn(db: Database.Database, game: GameRow): TurnRow | null {
  if (game.current_turn_id) {
    const pointed = db
      .prepare('SELECT * FROM game_turns WHERE id = ? AND game_id = ?')
      .get(game.current_turn_id, game.id) as TurnRow | undefined
    if (pointed) return pointed
  }
  const ready = db
    .prepare(
      `SELECT * FROM game_turns WHERE game_id = ? AND status = 'TURN_READY' ORDER BY sequence_no LIMIT 1`
    )
    .get(game.id) as TurnRow | undefined
  if (ready) return ready
  return (
    (db
      .prepare('SELECT * FROM game_turns WHERE game_id = ? ORDER BY sequence_no DESC LIMIT 1')
      .get(game.id) as TurnRow | undefined) ?? null
  )
}

export function loadPlaySnapshot(
  db: Database.Database,
  gameId: string,
  timer: TimerEngine,
  now: number,
  options?: { inspect?: boolean }
): PlaySnapshot {
  if (options?.inspect !== false) {
    const existing = getRecoveryLock(db, gameId)
    if (!existing) {
      const issue = detectIssues(db, gameId)
      if (issue) setRecoveryLock(db, gameId, issue, timer)
    }
  }

  const base = loadGameSnapshot(db, gameId)
  const game = db.prepare('SELECT * FROM games WHERE id = ?').get(gameId) as GameRow
  const lock = getRecoveryLock(db, gameId)
  const turn = resolveTurn(db, game)
  const remainingMs = turn ? authoritativeRemaining(turn, timer, now) : 0
  const showQuestion = !lock && turn?.status === 'TURN_RUNNING' && remainingMs > 0
  const item =
    showQuestion && turn?.current_queue_item_id ? loadQueueItem(db, turn.current_queue_item_id) : null
  const currentQuestion =
    item && item.state === 'CURRENT'
      ? {
          queueItemId: item.id,
          text: item.question_text_snapshot,
          category: item.category_snapshot,
          points: item.points_snapshot
        }
      : null

  const teamName = turn ? (base.teams.find((team) => team.id === turn.team_id)?.name ?? '') : ''
  const phase = derivePhase(game.status, turn?.status ?? null, Boolean(lock))
  const counts = db
    .prepare(
      `SELECT t.team_id AS teamId,
              SUM(CASE WHEN e.action = 'CORRECT' THEN 1 ELSE 0 END) AS correctCount,
              SUM(CASE WHEN e.action = 'SKIPPED' THEN 1 ELSE 0 END) AS skipCount
       FROM answer_events e
       JOIN game_turns t ON t.id = e.turn_id
       WHERE e.game_id = ? AND e.action IN ('CORRECT', 'SKIPPED')
         AND NOT EXISTS (
           SELECT 1 FROM answer_events u WHERE u.reverts_event_id = e.id
         )
       GROUP BY t.team_id`
    )
    .all(gameId) as { teamId: string; correctCount: number; skipCount: number }[]
  const countsByTeam = new Map(counts.map((row) => [row.teamId, row]))
  const ranked = [...base.teams].sort((a, b) => b.totalScore - a.totalScore || a.sortOrder - b.sortOrder)
  let rank = 1
  const leaderboard = ranked.map((team, index) => {
    if (index > 0 && team.totalScore < ranked[index - 1].totalScore) rank = index + 1
    return {
      teamId: team.id,
      name: team.name,
      color: team.color,
      totalScore: team.totalScore,
      correctCount: countsByTeam.get(team.id)?.correctCount ?? 0,
      skipCount: countsByTeam.get(team.id)?.skipCount ?? 0,
      rank
    }
  })
  const topScore = leaderboard[0]?.totalScore ?? 0
  const topCount = leaderboard.filter((entry) => entry.totalScore === topScore).length
  const showChampion = game.status === 'GAME_FINISHED' && topCount === 1 && leaderboard.length > 0
  const scoreTiedForLead =
    (game.status === 'GAME_FINISHED' || game.status === 'GAME_FINISHED_EARLY') && topCount > 1
  const pendingNext = turn
    ? Number(
        (
          db
            .prepare(
              `SELECT COUNT(*) AS c FROM game_turns
               WHERE game_id = ? AND status = 'TURN_PENDING' AND sequence_no > ?`
            )
            .get(gameId, turn.sequence_no) as { c: number }
        ).c
      )
    : 0

  const latest = turn
    ? (db
        .prepare(
          `SELECT id, queue_item_id FROM answer_events
           WHERE turn_id = ? AND action IN ('CORRECT', 'SKIPPED')
           ORDER BY occurred_at DESC, rowid DESC LIMIT 1`
        )
        .get(turn.id) as { id: string; queue_item_id: string | null } | undefined)
    : undefined
  const latestReverted = latest
    ? Boolean(
        db.prepare('SELECT 1 AS ok FROM answer_events WHERE reverts_event_id = ?').get(latest.id)
      )
    : true
  const canUndo =
    !lock &&
    Boolean(turn) &&
    (turn?.status === 'TURN_RUNNING' || turn?.status === 'TURN_PAUSED') &&
    (turn?.status !== 'TURN_RUNNING' || remainingMs > 0) &&
    Boolean(turn?.current_queue_item_id) &&
    Boolean(latest) &&
    !latestReverted &&
    latest?.queue_item_id !== turn?.current_queue_item_id

  const skipCount = turn ? countAction(db, turn.id, 'SKIPPED') : 0

  return {
    ...base,
    endReason: game.end_reason,
    currentTurnId: turn?.id ?? null,
    currentTurn: turn
      ? {
          id: turn.id,
          teamId: turn.team_id,
          teamName,
          roundNo: turn.round_no,
          sequenceNo: turn.sequence_no,
          status: turn.status,
          remainingMs,
          turnScore: turn.turn_score,
          endReason: turn.end_reason,
          correctCount: countAction(db, turn.id, 'CORRECT'),
          skipCount,
          timeoutCount: countAction(db, turn.id, 'TIMEOUT')
        }
      : null,
    currentQuestion,
    phase,
    recoveryRequired: Boolean(lock),
    recoveryReason: lock?.reason ?? null,
    leaderboard,
    showChampion,
    scoreTiedForLead,
    championTeamId: showChampion ? (leaderboard[0]?.teamId ?? null) : null,
    canStart:
      !lock && phase === 'ready' && !TERMINAL_GAME.has(game.status),
    canAdvance: !lock && phase === 'turn-result' && pendingNext > 0 && game.status === 'GAME_ACTIVE',
    canAnswer: !lock && phase === 'running' && Boolean(currentQuestion) && remainingMs > 0,
    canSkip:
      !lock &&
      phase === 'running' &&
      Boolean(currentQuestion) &&
      remainingMs > 0 &&
      skipCount < TURN_SKIP_LIMIT,
    canPause: !lock && phase === 'running',
    canResume: !lock && phase === 'paused',
    canUndo,
    canResetTimer: !lock && turn?.status === 'TURN_PAUSED',
    syncKey:
      turn?.status === 'TURN_RUNNING'
        ? `${turn.id}:running`
        : `${turn?.id ?? 'none'}:${turn?.status ?? 'none'}:${turn?.remaining_ms ?? 0}`,
    unusedCount: countAvailableQuestions(db, gameId)
  }
}
