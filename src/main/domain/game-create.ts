import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import type { CreateGameInput, GameSnapshot } from '../../shared/schemas/games'
import { buildChallengeSchedule, shuffleInPlace } from './challenge-schedule'
import { loadCurrentRoster, resolveTeamsForGame, RosterValidationError } from '../services/roster-service'

export class GameCreateError extends Error {
  constructor(
    message: string,
    readonly code: 'NO_QUESTIONS' | 'INVALID_CONFIG' = 'INVALID_CONFIG'
  ) {
    super(message)
    this.name = 'GameCreateError'
  }
}

type QuestionRow = {
  id: string
  text: string
  normalized_text: string
  category: string
  difficulty: string
  points: number
}

function findGameByCreateCommand(db: Database.Database, commandId: string): string | null {
  const row = db
    .prepare(
      `SELECT game_id AS gameId FROM game_events
       WHERE command_id = ? AND action = 'GAME_CREATED' LIMIT 1`
    )
    .get(commandId) as { gameId: string } | undefined
  return row?.gameId ?? null
}

function loadMembersByTeam(
  db: Database.Database,
  gameId: string
): Map<string, { members: string[]; performer: string | null }> {
  const rows = db
    .prepare(
      `SELECT team_id AS teamId, name, is_performer AS isPerformer FROM game_team_members
       WHERE game_id = ? ORDER BY sort_order ASC`
    )
    .all(gameId) as Array<{ teamId: string; name: string; isPerformer: number }>
  const map = new Map<string, { members: string[]; performer: string | null }>()
  for (const row of rows) {
    const entry = map.get(row.teamId) ?? { members: [], performer: null }
    entry.members.push(row.name)
    if (row.isPerformer === 1) entry.performer = row.name
    map.set(row.teamId, entry)
  }
  return map
}

export function createGame(
  db: Database.Database,
  input: CreateGameInput,
  options: { dataDir: string }
): GameSnapshot {
  const existingGameId = findGameByCreateCommand(db, input.commandId)
  if (existingGameId) {
    return loadGameSnapshot(db, existingGameId)
  }

  const now = new Date().toISOString()
  const gameId = randomUUID()
  const turnDurationMs = input.turnDurationSec * 1000
  const gameName =
    input.name?.trim() ||
    `比赛 ${new Date().toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-')}`

  let resolvedTeams
  try {
    const roster = loadCurrentRoster(options.dataDir)
    resolvedTeams = resolveTeamsForGame(roster, input.performerMembers)
  } catch (error) {
    if (error instanceof RosterValidationError) {
      throw new GameCreateError(error.message, 'INVALID_CONFIG')
    }
    throw error
  }

  const teamIds = resolvedTeams.map(() => randomUUID())

  let questionSql = `
    SELECT q.id, q.text, q.normalized_text, q.category, q.difficulty, q.points
    FROM questions q
    INNER JOIN bank_questions bq ON bq.question_id = q.id
    WHERE bq.bank_id = @bankId AND q.active = 1
  `
  const params: Record<string, unknown> = { bankId: input.bankId }
  const placeholders = input.categoryFilter.map((_, i) => `@cat${i}`).join(', ')
  questionSql += ` AND q.category IN (${placeholders})`
  input.categoryFilter.forEach((cat, i) => {
    params[`cat${i}`] = cat
  })

  const questions = db.prepare(questionSql).all(params) as QuestionRow[]
  if (questions.length === 0) {
    throw new GameCreateError('可用题目为 0，无法创建比赛', 'NO_QUESTIONS')
  }

  const schedule = buildChallengeSchedule(
    teamIds.map((id, index) => ({ teamId: id, sortOrder: resolvedTeams[index].sortOrder })),
    input.roundCount
  )
  const plannedTurnCount = schedule.length

  const shuffledQuestions = shuffleInPlace([...questions])
  const queueItems = shuffledQuestions.map((q, index) => ({
    id: randomUUID(),
    questionId: q.id,
    queuePosition: index + 1,
    snapshots: q
  }))

  const insertGame = db.prepare(`
    INSERT INTO games (
      id, name, status, end_reason, round_count, turn_duration_ms, score_mode, bank_id,
      current_turn_id, planned_turn_count, archived_at, created_at, started_at, ended_at
    ) VALUES (
      @id, @name, 'GAME_READY', NULL, @roundCount, @turnDurationMs, @scoreMode, @bankId,
      NULL, @plannedTurnCount, NULL, @createdAt, NULL, NULL
    )
  `)

  const insertTeam = db.prepare(`
    INSERT INTO game_teams (id, game_id, sort_order, name, color, total_score)
    VALUES (@id, @gameId, @sortOrder, @name, @color, 0)
  `)

  const insertMember = db.prepare(`
    INSERT INTO game_team_members (id, game_id, team_id, sort_order, name, is_performer)
    VALUES (@id, @gameId, @teamId, @sortOrder, @name, @isPerformer)
  `)

  const insertTurn = db.prepare(`
    INSERT INTO game_turns (
      id, game_id, team_id, round_no, sequence_no, status, end_reason,
      current_queue_item_id, remaining_ms, turn_score, started_at, ended_at
    ) VALUES (
      @id, @gameId, @teamId, @roundNo, @sequenceNo, @status, NULL,
      NULL, @remainingMs, 0, NULL, NULL
    )
  `)

  const insertQueue = db.prepare(`
    INSERT INTO game_question_queue (
      id, game_id, question_id, queue_position, state, shown_turn_id, first_allocated_at,
      verdict, question_text_snapshot, normalized_text_snapshot, category_snapshot,
      difficulty_snapshot, points_snapshot
    ) VALUES (
      @id, @gameId, @questionId, @queuePosition, 'UNUSED', NULL, NULL,
      NULL, @text, @normalized, @category, @difficulty, @points
    )
  `)

  const insertEvent = db.prepare(`
    INSERT INTO game_events (id, game_id, turn_id, command_id, action, reason, created_at)
    VALUES (@id, @gameId, NULL, @commandId, 'GAME_CREATED', NULL, @createdAt)
  `)

  const turnRows: { id: string; teamId: string; roundNo: number; sequenceNo: number; status: string }[] =
    []

  db.transaction(() => {
    insertGame.run({
      id: gameId,
      name: gameName,
      roundCount: input.roundCount,
      turnDurationMs,
      scoreMode: input.scoreMode,
      bankId: input.bankId,
      plannedTurnCount,
      createdAt: now
    })

    resolvedTeams.forEach((team, index) => {
      const teamId = teamIds[index]
      insertTeam.run({
        id: teamId,
        gameId,
        sortOrder: team.sortOrder,
        name: team.name,
        color: team.color
      })
      for (const member of team.members) {
        insertMember.run({
          id: randomUUID(),
          gameId,
          teamId,
          sortOrder: member.sortOrder,
          name: member.name,
          isPerformer: member.isPerformer ? 1 : 0
        })
      }
    })

    schedule.forEach((slot, index) => {
      const turnId = randomUUID()
      const status = index === 0 ? 'TURN_READY' : 'TURN_PENDING'
      insertTurn.run({
        id: turnId,
        gameId,
        teamId: slot.teamId,
        roundNo: slot.roundNo,
        sequenceNo: slot.sequenceNo,
        status,
        remainingMs: turnDurationMs
      })
      turnRows.push({
        id: turnId,
        teamId: slot.teamId,
        roundNo: slot.roundNo,
        sequenceNo: slot.sequenceNo,
        status
      })
    })

    for (const item of queueItems) {
      insertQueue.run({
        id: item.id,
        gameId,
        questionId: item.questionId,
        queuePosition: item.queuePosition,
        text: item.snapshots.text,
        normalized: item.snapshots.normalized_text,
        category: item.snapshots.category,
        difficulty: item.snapshots.difficulty,
        points: item.snapshots.points
      })
    }

    insertEvent.run({
      id: randomUUID(),
      gameId,
      commandId: input.commandId,
      createdAt: now
    })
  })()

  return loadGameSnapshot(db, gameId)
}

export function loadGameSnapshot(db: Database.Database, gameId: string): GameSnapshot {
  const game = db
    .prepare(
      `SELECT id, name, status, round_count AS roundCount, turn_duration_ms AS turnDurationMs,
              score_mode AS scoreMode, planned_turn_count AS plannedTurnCount
       FROM games WHERE id = ?`
    )
    .get(gameId) as
    | {
        id: string
        name: string
        status: string
        roundCount: number
        turnDurationMs: number
        scoreMode: 'UNIFORM' | 'QUESTION_POINTS'
        plannedTurnCount: number
      }
    | undefined

  if (!game) {
    throw new Error(`Game not found: ${gameId}`)
  }

  const queueSize = (
    db.prepare('SELECT COUNT(*) AS c FROM game_question_queue WHERE game_id = ?').get(gameId) as {
      c: number
    }
  ).c

  const memberMap = loadMembersByTeam(db, gameId)

  const teamsRaw = db
    .prepare(
      `SELECT id, name, color, sort_order AS sortOrder, total_score AS totalScore
       FROM game_teams WHERE game_id = ? ORDER BY sort_order`
    )
    .all(gameId) as Array<Omit<GameSnapshot['teams'][number], 'members'>>

  const teams = teamsRaw.map((team) => {
    const entry = memberMap.get(team.id)
    return {
      ...team,
      members: entry?.members ?? [],
      performer: entry?.performer ?? null
    }
  })

  const turns = db
    .prepare(
      `SELECT id, team_id AS teamId, round_no AS roundNo, sequence_no AS sequenceNo, status
       FROM game_turns WHERE game_id = ? ORDER BY sequence_no`
    )
    .all(gameId) as GameSnapshot['turns']

  return {
    id: game.id,
    name: game.name,
    status: game.status,
    roundCount: game.roundCount,
    turnDurationMs: game.turnDurationMs,
    scoreMode: game.scoreMode,
    plannedTurnCount: game.plannedTurnCount,
    queueSize,
    teams,
    turns
  }
}

/** Ensures queue snapshots are immutable after game creation (no update API in batch 1). */
export function assertQueueSnapshotImmutable(
  db: Database.Database,
  gameId: string,
  questionId: string
): boolean {
  const row = db
    .prepare(
      `SELECT question_text_snapshot FROM game_question_queue
       WHERE game_id = ? AND question_id = ?`
    )
    .get(gameId, questionId) as { question_text_snapshot: string } | undefined
  return Boolean(row?.question_text_snapshot)
}
