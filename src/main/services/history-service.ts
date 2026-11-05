import type { AppDatabase } from '../database/connection'
import { gameStatusLabel, outcomeLabel } from '../../shared/labels'
import type { GameHistory, HistoryListItem, HistoryQuery } from '../../shared/schemas/history'

type GameRow = {
  id: string
  name: string
  status: string
  end_reason: string | null
  round_count: number
  turn_duration_ms: number
  planned_turn_count: number
  current_turn_id: string | null
  created_at: string
  started_at: string | null
  ended_at: string | null
}

function likePattern(keyword: string): string {
  return `%${keyword.replace(/[\\%_]/g, (char) => `\\${char}`)}%`
}

function loadGame(db: AppDatabase, gameId: string): GameRow {
  const row = db.prepare('SELECT * FROM games WHERE id = ?').get(gameId) as GameRow | undefined
  if (!row) throw new Error('比赛不存在')
  return row
}

function leaderNames(db: AppDatabase, gameId: string): { uniqueLeaderName: string | null; tied: boolean } {
  const teams = db
    .prepare(
      `SELECT name, total_score FROM game_teams WHERE game_id = ? ORDER BY total_score DESC, sort_order ASC`
    )
    .all(gameId) as Array<{ name: string; total_score: number }>
  if (teams.length === 0) return { uniqueLeaderName: null, tied: false }
  const top = teams[0].total_score
  const leaders = teams.filter((team) => team.total_score === top)
  if (leaders.length === 1) return { uniqueLeaderName: leaders[0].name, tied: false }
  return { uniqueLeaderName: null, tied: true }
}

function counts(db: AppDatabase, gameId: string) {
  const row = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM game_teams WHERE game_id = @id) AS teamCount,
         (SELECT COUNT(*) FROM game_turns WHERE game_id = @id AND status = 'TURN_FINISHED') AS finishedTurnCount,
         (SELECT COUNT(*) FROM game_turns WHERE game_id = @id AND status = 'TURN_NOT_PLAYED') AS notPlayedTurnCount,
         (SELECT COUNT(*) FROM game_question_queue WHERE game_id = @id AND state IN ('CURRENT', 'JUDGED', 'VOIDED')) AS usedQuestionCount,
         (SELECT COALESCE(SUM(total_score), 0) FROM game_teams WHERE game_id = @id) AS scoreTotal`
    )
    .get({ id: gameId }) as {
    teamCount: number
    finishedTurnCount: number
    notPlayedTurnCount: number
    usedQuestionCount: number
    scoreTotal: number
  }
  return row
}

function activityLabel(db: AppDatabase, game: GameRow): string | null {
  if (!game.current_turn_id || (game.status !== 'GAME_ACTIVE' && game.status !== 'GAME_READY')) return null
  const turn = db.prepare('SELECT status FROM game_turns WHERE id = ?').get(game.current_turn_id) as
    | { status: string }
    | undefined
  if (turn?.status === 'TURN_PAUSED') return '已暂停'
  return null
}

function toListItem(db: AppDatabase, game: GameRow): HistoryListItem {
  const tally = counts(db, game.id)
  const leaders = leaderNames(db, game.id)
  const showChampion = game.status === 'GAME_FINISHED' && leaders.uniqueLeaderName != null
  return {
    id: game.id,
    name: game.name,
    status: game.status,
    statusLabel: gameStatusLabel(game.status),
    endReason: game.end_reason,
    createdAt: game.created_at,
    endedAt: game.ended_at,
    teamCount: tally.teamCount,
    roundCount: game.round_count,
    plannedTurnCount: game.planned_turn_count,
    finishedTurnCount: tally.finishedTurnCount,
    notPlayedTurnCount: tally.notPlayedTurnCount,
    usedQuestionCount: tally.usedQuestionCount,
    scoreTotal: tally.scoreTotal,
    outcomeLabel: outcomeLabel({
      status: game.status,
      uniqueLeaderName: showChampion ? leaders.uniqueLeaderName : null,
      tied: game.status === 'GAME_FINISHED' && leaders.tied
    }),
    activityLabel: activityLabel(db, game)
  }
}

export function listHistory(db: AppDatabase, query: HistoryQuery = {}): HistoryListItem[] {
  const keyword = query.keyword?.trim()
  const rows = db
    .prepare(
      `SELECT * FROM games
       WHERE (@status IS NULL OR status = @status)
         AND (@keyword IS NULL OR name LIKE @keyword ESCAPE '\\')
       ORDER BY created_at DESC, rowid DESC`
    )
    .all({
      status: query.status ?? null,
      keyword: keyword ? likePattern(keyword) : null
    }) as GameRow[]
  return rows.map((game) => toListItem(db, game))
}

export function getHistory(db: AppDatabase, gameId: string): GameHistory {
  const game = loadGame(db, gameId)
  const summary = toListItem(db, game)
  const leaders = leaderNames(db, gameId)
  const teams = db
    .prepare(
      `SELECT id, name, color, total_score AS totalScore, sort_order AS sortOrder
       FROM game_teams WHERE game_id = ? ORDER BY total_score DESC, sort_order ASC`
    )
    .all(gameId) as Array<{
    id: string
    name: string
    color: string
    totalScore: number
    sortOrder: number
  }>
  let rank = 1
  const memberMap = new Map<string, { members: string[]; performer: string | null }>()
  const memberRows = db
    .prepare(
      `SELECT team_id AS teamId, name, is_performer AS isPerformer FROM game_team_members
       WHERE game_id = ? ORDER BY sort_order ASC`
    )
    .all(gameId) as Array<{ teamId: string; name: string; isPerformer: number }>
  for (const row of memberRows) {
    const entry = memberMap.get(row.teamId) ?? { members: [], performer: null }
    entry.members.push(row.name)
    if (row.isPerformer === 1) entry.performer = row.name
    memberMap.set(row.teamId, entry)
  }
  const ranked = teams.map((team, index) => {
    if (index > 0 && team.totalScore < teams[index - 1].totalScore) rank = index + 1
    const turnCounts = db
      .prepare(
        `SELECT
           SUM(CASE WHEN status = 'TURN_FINISHED' THEN 1 ELSE 0 END) AS finishedTurns,
           SUM(CASE WHEN status = 'TURN_NOT_PLAYED' THEN 1 ELSE 0 END) AS notPlayedTurns
         FROM game_turns WHERE team_id = ?`
      )
      .get(team.id) as { finishedTurns: number | null; notPlayedTurns: number | null }
    return {
      id: team.id,
      name: team.name,
      color: team.color,
      totalScore: team.totalScore,
      rank,
      finishedTurns: turnCounts.finishedTurns ?? 0,
      notPlayedTurns: turnCounts.notPlayedTurns ?? 0,
      members: memberMap.get(team.id)?.members ?? [],
      performer: memberMap.get(team.id)?.performer ?? null
    }
  })

  const turns = db
    .prepare(
      `SELECT t.id, t.team_id AS teamId, tm.name AS teamName, t.round_no AS roundNo,
              t.sequence_no AS sequenceNo, t.status, t.end_reason AS endReason,
              t.turn_score AS turnScore, t.remaining_ms AS remainingMs
       FROM game_turns t
       JOIN game_teams tm ON tm.id = t.team_id
       WHERE t.game_id = ?
       ORDER BY t.sequence_no`
    )
    .all(gameId) as GameHistory['turns']

  const questions = db
    .prepare(
      `SELECT q.id, q.queue_position AS position, q.question_text_snapshot AS text,
              q.category_snapshot AS category, q.points_snapshot AS points, q.state, q.verdict,
              t.round_no AS roundNo, tm.id AS teamId, tm.name AS teamName
       FROM game_question_queue q
       LEFT JOIN game_turns t ON t.id = q.shown_turn_id
       LEFT JOIN game_teams tm ON tm.id = t.team_id
       WHERE q.game_id = ?
       ORDER BY q.queue_position`
    )
    .all(gameId) as GameHistory['questions']

  const events = db
    .prepare(
      `SELECT e.id, e.turn_id AS turnId, e.action, e.score_delta AS scoreDelta,
              e.remaining_ms AS remainingMs, e.occurred_at AS occurredAt, e.reason,
              q.question_text_snapshot AS questionText
       FROM answer_events e
       LEFT JOIN game_question_queue q ON q.id = e.queue_item_id
       WHERE e.game_id = ?
       ORDER BY e.occurred_at, e.rowid`
    )
    .all(gameId) as GameHistory['events']

  const adjustments = db
    .prepare(
      `SELECT a.id, a.team_id AS teamId, tm.name AS teamName, a.turn_id AS turnId,
              a.delta, a.previous_team_score AS previousTeamScore, a.new_team_score AS newTeamScore,
              a.reason, a.created_at AS createdAt
       FROM score_adjustments a
       JOIN game_teams tm ON tm.id = a.team_id
       WHERE a.game_id = ?
       ORDER BY a.created_at`
    )
    .all(gameId) as GameHistory['adjustments']

  return {
    id: game.id,
    name: game.name,
    status: game.status,
    statusLabel: gameStatusLabel(game.status),
    endReason: game.end_reason,
    createdAt: game.created_at,
    startedAt: game.started_at,
    endedAt: game.ended_at,
    roundCount: game.round_count,
    turnDurationMs: game.turn_duration_ms,
    plannedTurnCount: game.planned_turn_count,
    finishedTurnCount: summary.finishedTurnCount,
    notPlayedTurnCount: summary.notPlayedTurnCount,
    showChampion: game.status === 'GAME_FINISHED' && leaders.uniqueLeaderName != null,
    outcomeLabel: summary.outcomeLabel,
    teams: ranked,
    turns,
    questions,
    events,
    adjustments
  }
}
