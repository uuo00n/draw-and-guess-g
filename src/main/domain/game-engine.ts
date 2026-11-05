import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import { TURN_SKIP_LIMIT } from '../../shared/constants'
import type {
  AbortGameInput,
  GameCommandInput,
  GameCommandResult,
  GameSummary,
  GameUiEvent,
  SubmitAnswerInput
} from '../../shared/schemas/play'
import {
  detectIssues,
  getRecoveryLock,
  loadGameRow,
  loadQueueItem,
  loadTurnRow,
  setRecoveryLock,
  type GameRow,
  type QueueRow,
  type TurnRow
} from './integrity'
import { authoritativeRemaining, loadPlaySnapshot, resolveTurn } from './play-snapshot'
import { countAvailableQuestions, UNUSED_QUEUE_QUESTION } from './question-availability'
import { TimerEngine, timerEngine } from './timer-engine'

export class GameCommandError extends Error {
  constructor(
    message: string,
    readonly code: 'INVALID_STATE' | 'NO_QUESTIONS' | 'RECOVERY_REQUIRED' | 'NOT_FOUND' = 'INVALID_STATE'
  ) {
    super(message)
    this.name = 'GameCommandError'
  }
}

export type EngineOptions = {
  timer?: TimerEngine
  now?: number
}

type CommandCore = {
  snapshot: GameCommandResult['snapshot']
  applied: boolean
  eventId?: string
  rejectReason?: string
  uiEvent?: GameUiEvent
}

const TERMINAL_GAME = new Set(['GAME_FINISHED', 'GAME_FINISHED_EARLY', 'GAME_ABORTED'])

function immediate<T>(db: Database.Database, fn: () => T): T {
  return db.transaction(fn).immediate()
}

function nowMs(options?: EngineOptions): number {
  return options?.now ?? performance.now()
}

function clock(options?: EngineOptions): TimerEngine {
  return options?.timer ?? timerEngine
}

function isoNow(): string {
  return new Date().toISOString()
}

type Receipt = {
  command_id: string
  event_id: string | null
  applied: number
  reject_reason: string | null
}

function readReceipt(db: Database.Database, commandId: string): Receipt | undefined {
  return db.prepare('SELECT * FROM command_receipts WHERE command_id = ?').get(commandId) as
    | Receipt
    | undefined
}

function writeReceipt(
  db: Database.Database,
  input: { commandId: string; gameId: string; eventId?: string; applied: boolean; rejectReason?: string }
): void {
  db.prepare(
    `INSERT INTO command_receipts (command_id, game_id, event_id, applied, reject_reason, created_at)
     VALUES (@commandId, @gameId, @eventId, @applied, @rejectReason, @createdAt)`
  ).run({
    commandId: input.commandId,
    gameId: input.gameId,
    eventId: input.eventId ?? null,
    applied: input.applied ? 1 : 0,
    rejectReason: input.rejectReason ?? null,
    createdAt: isoNow()
  })
}

function assertHealthy(db: Database.Database, gameId: string, timer: TimerEngine): void {
  const existing = getRecoveryLock(db, gameId)
  if (existing) {
    throw new GameCommandError(
      `比赛需要人工恢复（${existing.reason}），已禁止判题和改分`,
      'RECOVERY_REQUIRED'
    )
  }
  const issue = detectIssues(db, gameId)
  if (issue) {
    setRecoveryLock(db, gameId, issue, timer)
    throw new GameCommandError(`比赛数据异常（${issue}），已禁止判题和自动改分`, 'RECOVERY_REQUIRED')
  }
}

function resultOf(
  db: Database.Database,
  gameId: string,
  timer: TimerEngine,
  now: number,
  applied: boolean,
  eventId?: string,
  rejectReason?: string,
  uiEvent?: GameUiEvent
): CommandCore {
  return {
    snapshot: loadPlaySnapshot(db, gameId, timer, now),
    applied,
    eventId,
    rejectReason,
    uiEvent
  }
}

function duplicate(
  db: Database.Database,
  gameId: string,
  receipt: Receipt,
  timer: TimerEngine,
  now: number
): CommandCore {
  return resultOf(
    db,
    gameId,
    timer,
    now,
    false,
    receipt.event_id ?? undefined,
    receipt.reject_reason ?? 'DUPLICATE'
  )
}

function uiEvent(
  gameId: string,
  eventId: string,
  kind: GameUiEvent['kind'],
  verdict?: GameUiEvent['verdict'],
  turnSequenceNo?: number
): GameUiEvent {
  return {
    eventId,
    gameId,
    kind,
    verdict,
    ...(turnSequenceNo != null ? { turnSequenceNo } : {}),
    emittedAt: isoNow()
  }
}

function requireMutableGame(game: GameRow): void {
  if (TERMINAL_GAME.has(game.status)) {
    throw new GameCommandError('比赛已结束，不能继续操作', 'INVALID_STATE')
  }
}

function insertAnswer(
  db: Database.Database,
  input: {
    id: string
    gameId: string
    turnId: string
    queueItemId: string | null
    commandId: string
    action: string
    scoreDelta: number
    remainingMs: number | null
    revertsEventId?: string | null
    reason?: string | null
  }
): void {
  db.prepare(
    `INSERT INTO answer_events (
      id, game_id, turn_id, queue_item_id, command_id, action, score_delta,
      remaining_ms, occurred_at, reverts_event_id, reason
    ) VALUES (
      @id, @gameId, @turnId, @queueItemId, @commandId, @action, @scoreDelta,
      @remainingMs, @occurredAt, @revertsEventId, @reason
    )`
  ).run({
    ...input,
    occurredAt: isoNow(),
    revertsEventId: input.revertsEventId ?? null,
    reason: input.reason ?? null
  })
}

function insertGameEvent(
  db: Database.Database,
  input: {
    id: string
    gameId: string
    turnId: string | null
    commandId: string
    action: string
    reason?: string | null
  }
): void {
  db.prepare(
    `INSERT INTO game_events (id, game_id, turn_id, command_id, action, reason, created_at)
     VALUES (@id, @gameId, @turnId, @commandId, @action, @reason, @createdAt)`
  ).run({
    ...input,
    reason: input.reason ?? null,
    createdAt: isoNow()
  })
}

function addScore(db: Database.Database, turn: TurnRow, delta: number): void {
  db.prepare('UPDATE game_turns SET turn_score = turn_score + ? WHERE id = ?').run(delta, turn.id)
  db.prepare('UPDATE game_teams SET total_score = total_score + ? WHERE id = ?').run(delta, turn.team_id)
}

function takeNextUnused(db: Database.Database, gameId: string, turnId: string): QueueRow | null {
  const row = db
    .prepare(
      `SELECT * FROM game_question_queue
       WHERE game_id = ? AND ${UNUSED_QUEUE_QUESTION}
       ORDER BY queue_position LIMIT 1`
    )
    .get(gameId) as QueueRow | undefined
  if (!row) return null
  db.prepare('INSERT INTO used_questions (normalized_text) VALUES (?)')
    .run(row.normalized_text_snapshot)
  const at = isoNow()
  const changed = db
    .prepare(
      `UPDATE game_question_queue
       SET state = 'CURRENT', shown_turn_id = ?, first_allocated_at = ?
       WHERE id = ? AND state = 'UNUSED'`
    )
    .run(turnId, at, row.id)
  if (changed.changes !== 1) throw new GameCommandError('题目分配失败')
  return loadQueueItem(db, row.id)
}

function markUnstarted(
  db: Database.Database,
  gameId: string,
  reason: 'POOL_EXHAUSTED' | 'USER_ABORTED'
): void {
  db.prepare(
    `UPDATE game_turns
     SET status = 'TURN_NOT_PLAYED', end_reason = ?, ended_at = ?, current_queue_item_id = NULL
     WHERE game_id = ? AND status IN ('TURN_PENDING', 'TURN_READY')`
  ).run(reason, isoNow(), gameId)
}

function concludeAfterTimeUp(db: Database.Database, gameId: string): GameUiEvent['kind'] {
  const unfinished = db
    .prepare(
      `SELECT COUNT(*) AS c FROM game_turns
       WHERE game_id = ? AND status != 'TURN_FINISHED'`
    )
    .get(gameId) as { c: number }
  if (Number(unfinished.c) === 0) {
    db.prepare(
      `UPDATE games SET status = 'GAME_FINISHED', end_reason = 'NORMAL_COMPLETE', ended_at = ? WHERE id = ?`
    ).run(isoNow(), gameId)
    return 'GAME_FINISHED'
  }
  if (countAvailableQuestions(db, gameId) === 0) {
    markUnstarted(db, gameId, 'POOL_EXHAUSTED')
    db.prepare(
      `UPDATE games SET status = 'GAME_FINISHED_EARLY', end_reason = 'POOL_EXHAUSTED', ended_at = ? WHERE id = ?`
    ).run(isoNow(), gameId)
    return 'GAME_FINISHED_EARLY'
  }
  return 'TURN_ENDED'
}

function exhaustGame(db: Database.Database, turn: TurnRow, remainingMs: number): void {
  db.prepare(
    `UPDATE game_turns
     SET status = 'TURN_EXHAUSTED', end_reason = 'POOL_EXHAUSTED', current_queue_item_id = NULL,
         remaining_ms = ?, ended_at = ?
     WHERE id = ?`
  ).run(remainingMs, isoNow(), turn.id)
  markUnstarted(db, turn.game_id, 'POOL_EXHAUSTED')
  db.prepare(
    `UPDATE games SET status = 'GAME_FINISHED_EARLY', end_reason = 'POOL_EXHAUSTED', ended_at = ?, current_turn_id = ? WHERE id = ?`
  ).run(isoNow(), turn.id, turn.game_id)
}

function finishOnExhaustion(
  db: Database.Database,
  input: GameCommandInput,
  turn: TurnRow,
  remaining: number,
  timer: TimerEngine,
  now: number
): CommandCore {
  exhaustGame(db, turn, remaining)
  timer.disarm(input.gameId)
  const eventId = randomUUID()
  writeReceipt(db, { commandId: input.commandId, gameId: input.gameId, eventId, applied: true })
  return resultOf(
    db, input.gameId, timer, now, true, eventId, undefined,
    uiEvent(input.gameId, eventId, 'GAME_FINISHED_EARLY')
  )
}

/** One-shot TIMEOUT. Caller must already hold the write transaction. */
function applyTimeoutBody(
  db: Database.Database,
  gameId: string,
  timer: TimerEngine,
  now: number
): { eventId: string; applied: boolean; kind: GameUiEvent['kind'] } {
  const running = db
    .prepare(`SELECT * FROM game_turns WHERE game_id = ? AND status = 'TURN_RUNNING'`)
    .get(gameId) as TurnRow | undefined
  if (!running) {
    const existing = db
      .prepare(
        `SELECT id FROM answer_events WHERE game_id = ? AND action = 'TIMEOUT' ORDER BY occurred_at DESC LIMIT 1`
      )
      .get(gameId) as { id: string } | undefined
    return { eventId: existing?.id ?? '', applied: false, kind: 'TURN_ENDED' }
  }
  const remaining = authoritativeRemaining(running, timer, now)
  if (remaining > 0) {
    throw new GameCommandError('仍有剩余时间', 'INVALID_STATE')
  }
  const prior = db
    .prepare(`SELECT id FROM answer_events WHERE turn_id = ? AND action = 'TIMEOUT'`)
    .get(running.id) as { id: string } | undefined
  if (prior) {
    timer.disarm(gameId)
    return { eventId: prior.id, applied: false, kind: 'TURN_ENDED' }
  }
  const commandId = `timeout:${running.id}`
  const eventId = randomUUID()
  if (!running.current_queue_item_id) {
    setRecoveryLock(db, gameId, 'ILLEGAL_POINTER', timer)
    throw new GameCommandError('当前题指针非法，已停止自动结算', 'RECOVERY_REQUIRED')
  }
  const item = loadQueueItem(db, running.current_queue_item_id)
  if (!item || item.state !== 'CURRENT') {
    setRecoveryLock(db, gameId, 'ILLEGAL_POINTER', timer)
    throw new GameCommandError('当前题指针非法，已停止自动结算', 'RECOVERY_REQUIRED')
  }
  db.prepare(`UPDATE game_question_queue SET state = 'JUDGED', verdict = 'TIMEOUT' WHERE id = ?`).run(item.id)
  insertAnswer(db, {
    id: eventId,
    gameId,
    turnId: running.id,
    queueItemId: item.id,
    commandId,
    action: 'TIMEOUT',
    scoreDelta: 0,
    remainingMs: 0
  })
  db.prepare(
    `UPDATE game_turns
     SET status = 'TURN_FINISHED', end_reason = 'TIME_UP', remaining_ms = 0,
         current_queue_item_id = NULL, ended_at = ?
     WHERE id = ?`
  ).run(isoNow(), running.id)
  timer.disarm(gameId)
  const kind = concludeAfterTimeUp(db, gameId)
  if (!readReceipt(db, commandId)) {
    writeReceipt(db, { commandId, gameId, eventId, applied: true })
  }
  return { eventId, applied: true, kind }
}

export function settleTimeout(
  db: Database.Database,
  gameId: string,
  options?: EngineOptions
): CommandCore {
  const timer = clock(options)
  const now = nowMs(options)
  return immediate(db, () => {
    assertHealthy(db, gameId, timer)
    const timeout = applyTimeoutBody(db, gameId, timer, now)
    return resultOf(
      db,
      gameId,
      timer,
      now,
      timeout.applied,
      timeout.eventId,
      timeout.applied ? undefined : 'DUPLICATE',
      timeout.applied ? uiEvent(gameId, timeout.eventId, timeout.kind, 'TIMEOUT') : undefined
    )
  })
}

export function startTurn(
  db: Database.Database,
  input: GameCommandInput,
  options?: EngineOptions
): CommandCore {
  const timer = clock(options)
  const now = nowMs(options)
  return immediate(db, () => {
    const receipt = readReceipt(db, input.commandId)
    if (receipt) return duplicate(db, input.gameId, receipt, timer, now)
    assertHealthy(db, input.gameId, timer)
    const game = loadGameRow(db, input.gameId)
    requireMutableGame(game)
    const turn = resolveTurn(db, game)
    if (!turn || turn.status !== 'TURN_READY') {
      throw new GameCommandError('当前没有可开始的准备挑战', 'INVALID_STATE')
    }
    const item = takeNextUnused(db, input.gameId, turn.id)
    if (!item) {
      return finishOnExhaustion(db, input, turn, turn.remaining_ms, timer, now)
    }
    const at = isoNow()
    db.prepare(
      `UPDATE game_turns
       SET status = 'TURN_RUNNING', current_queue_item_id = ?, started_at = COALESCE(started_at, ?)
       WHERE id = ?`
    ).run(item.id, at, turn.id)
    db.prepare(
      `UPDATE games
       SET status = 'GAME_ACTIVE', current_turn_id = ?, started_at = COALESCE(started_at, ?)
       WHERE id = ?`
    ).run(turn.id, at, input.gameId)
    const started = loadTurnRow(db, turn.id)
    timer.arm(input.gameId, turn.id, started.remaining_ms, now)
    const eventId = randomUUID()
    writeReceipt(db, { commandId: input.commandId, gameId: input.gameId, eventId, applied: true })
    return resultOf(
      db,
      input.gameId,
      timer,
      now,
      true,
      eventId,
      undefined,
      uiEvent(input.gameId, eventId, 'TURN_STARTED', undefined, turn.sequence_no)
    )
  })
}

export function submitAnswer(
  db: Database.Database,
  input: SubmitAnswerInput,
  options?: EngineOptions
): CommandCore {
  const timer = clock(options)
  const now = nowMs(options)
  return immediate(db, () => {
    const receipt = readReceipt(db, input.commandId)
    if (receipt) return duplicate(db, input.gameId, receipt, timer, now)
    assertHealthy(db, input.gameId, timer)
    const game = loadGameRow(db, input.gameId)
    requireMutableGame(game)
    const turn = loadTurnRow(db, input.turnId)
    if (turn.game_id !== input.gameId) throw new GameCommandError('挑战不属于该比赛', 'INVALID_STATE')
    if (game.current_turn_id && game.current_turn_id !== turn.id) {
      throw new GameCommandError('不是当前挑战', 'INVALID_STATE')
    }
    if (turn.status !== 'TURN_RUNNING') {
      throw new GameCommandError('只有进行中的挑战可以判题', 'INVALID_STATE')
    }
    const remaining = authoritativeRemaining(turn, timer, now)
    if (remaining <= 0) {
      const timeout = applyTimeoutBody(db, input.gameId, timer, now)
      writeReceipt(db, {
        commandId: input.commandId,
        gameId: input.gameId,
        eventId: timeout.eventId,
        applied: false,
        rejectReason: 'TIMEOUT'
      })
      return resultOf(
        db,
        input.gameId,
        timer,
        now,
        false,
        timeout.eventId,
        'TIMEOUT',
        timeout.applied ? uiEvent(input.gameId, timeout.eventId, timeout.kind, 'TIMEOUT') : undefined
      )
    }
    const item = turn.current_queue_item_id ? loadQueueItem(db, turn.current_queue_item_id) : null
    if (!item || item.id !== input.currentQueueItemId || item.state !== 'CURRENT') {
      writeReceipt(db, {
        commandId: input.commandId,
        gameId: input.gameId,
        applied: false,
        rejectReason: 'STALE'
      })
      return resultOf(db, input.gameId, timer, now, false, undefined, 'STALE')
    }
    if (input.verdict === 'SKIPPED') {
      const skipRow = db
        .prepare(
          `SELECT COUNT(*) AS c FROM answer_events e
           WHERE e.turn_id = ? AND e.action = 'SKIPPED'
             AND NOT EXISTS (
               SELECT 1 FROM answer_events u WHERE u.reverts_event_id = e.id
             )`
        )
        .get(turn.id) as { c: number }
      if (Number(skipRow.c) >= TURN_SKIP_LIMIT) {
        throw new GameCommandError(`每组每场最多跳过 ${TURN_SKIP_LIMIT} 次`, 'INVALID_STATE')
      }
    }
    const delta =
      input.verdict === 'CORRECT'
        ? game.score_mode === 'QUESTION_POINTS'
          ? item.points_snapshot
          : 1
        : 0
    db.prepare(`UPDATE game_question_queue SET state = 'JUDGED', verdict = ? WHERE id = ?`).run(
      input.verdict,
      item.id
    )
    const eventId = randomUUID()
    insertAnswer(db, {
      id: eventId,
      gameId: input.gameId,
      turnId: turn.id,
      queueItemId: item.id,
      commandId: input.commandId,
      action: input.verdict,
      scoreDelta: delta,
      remainingMs: remaining
    })
    addScore(db, turn, delta)
    const next = takeNextUnused(db, input.gameId, turn.id)
    if (!next) {
      exhaustGame(db, turn, remaining)
      timer.disarm(input.gameId)
    } else {
      db.prepare(
        `UPDATE game_turns SET current_queue_item_id = ?, remaining_ms = ? WHERE id = ?`
      ).run(next.id, remaining, turn.id)
    }
    writeReceipt(db, { commandId: input.commandId, gameId: input.gameId, eventId, applied: true })
    const kind: GameUiEvent['kind'] = next ? 'ANSWER_ACCEPTED' : 'GAME_FINISHED_EARLY'
    return resultOf(
      db,
      input.gameId,
      timer,
      now,
      true,
      eventId,
      undefined,
      uiEvent(input.gameId, eventId, kind, input.verdict)
    )
  })
}

export function pauseTurn(
  db: Database.Database,
  input: GameCommandInput,
  options?: EngineOptions
): CommandCore {
  const timer = clock(options)
  const now = nowMs(options)
  return immediate(db, () => {
    const receipt = readReceipt(db, input.commandId)
    if (receipt) return duplicate(db, input.gameId, receipt, timer, now)
    assertHealthy(db, input.gameId, timer)
    const game = loadGameRow(db, input.gameId)
    requireMutableGame(game)
    const turn = resolveTurn(db, game)
    if (!turn || turn.status !== 'TURN_RUNNING') {
      writeReceipt(db, {
        commandId: input.commandId,
        gameId: input.gameId,
        applied: false,
        rejectReason: 'INVALID_STATE'
      })
      return resultOf(db, input.gameId, timer, now, false, undefined, 'INVALID_STATE')
    }
    const remaining = authoritativeRemaining(turn, timer, now)
    if (remaining <= 0) {
      const timeout = applyTimeoutBody(db, input.gameId, timer, now)
      writeReceipt(db, {
        commandId: input.commandId,
        gameId: input.gameId,
        eventId: timeout.eventId,
        applied: false,
        rejectReason: 'TIMEOUT'
      })
      return resultOf(
        db,
        input.gameId,
        timer,
        now,
        false,
        timeout.eventId,
        'TIMEOUT',
        timeout.applied ? uiEvent(input.gameId, timeout.eventId, timeout.kind, 'TIMEOUT') : undefined
      )
    }
    db.prepare(`UPDATE game_turns SET status = 'TURN_PAUSED', remaining_ms = ? WHERE id = ?`).run(
      remaining,
      turn.id
    )
    timer.disarm(input.gameId)
    const eventId = randomUUID()
    writeReceipt(db, { commandId: input.commandId, gameId: input.gameId, eventId, applied: true })
    return resultOf(db, input.gameId, timer, now, true, eventId)
  })
}

export function resumeTurn(
  db: Database.Database,
  input: GameCommandInput,
  options?: EngineOptions
): CommandCore {
  const timer = clock(options)
  const now = nowMs(options)
  return immediate(db, () => {
    const receipt = readReceipt(db, input.commandId)
    if (receipt) return duplicate(db, input.gameId, receipt, timer, now)
    assertHealthy(db, input.gameId, timer)
    const game = loadGameRow(db, input.gameId)
    requireMutableGame(game)
    const turn = resolveTurn(db, game)
    if (!turn || turn.status !== 'TURN_PAUSED') {
      throw new GameCommandError('当前挑战没有暂停', 'INVALID_STATE')
    }
    if (turn.remaining_ms <= 0) {
      db.prepare(`UPDATE game_turns SET status = 'TURN_RUNNING' WHERE id = ?`).run(turn.id)
      timer.arm(input.gameId, turn.id, 0, now)
      const timeout = applyTimeoutBody(db, input.gameId, timer, now)
      writeReceipt(db, {
        commandId: input.commandId,
        gameId: input.gameId,
        eventId: timeout.eventId,
        applied: true
      })
      return resultOf(
        db,
        input.gameId,
        timer,
        now,
        true,
        timeout.eventId,
        undefined,
        uiEvent(input.gameId, timeout.eventId, timeout.kind, 'TIMEOUT')
      )
    }
    db.prepare(`UPDATE game_question_queue SET state = 'VOIDED' WHERE id = ? AND state = 'CURRENT'`)
      .run(turn.current_queue_item_id)
    const next = takeNextUnused(db, input.gameId, turn.id)
    if (!next) {
      return finishOnExhaustion(db, input, turn, turn.remaining_ms, timer, now)
    }
    db.prepare(`UPDATE game_turns SET status = 'TURN_RUNNING', current_queue_item_id = ? WHERE id = ?`)
      .run(next.id, turn.id)
    timer.arm(input.gameId, turn.id, turn.remaining_ms, now)
    const eventId = randomUUID()
    writeReceipt(db, { commandId: input.commandId, gameId: input.gameId, eventId, applied: true })
    return resultOf(db, input.gameId, timer, now, true, eventId)
  })
}

export function resetTurnTimer(
  db: Database.Database,
  input: GameCommandInput,
  options?: EngineOptions
): CommandCore {
  const timer = clock(options)
  const now = nowMs(options)
  return immediate(db, () => {
    const receipt = readReceipt(db, input.commandId)
    if (receipt) return duplicate(db, input.gameId, receipt, timer, now)
    assertHealthy(db, input.gameId, timer)
    const game = loadGameRow(db, input.gameId)
    requireMutableGame(game)
    const turn = resolveTurn(db, game)
    if (!turn || turn.status !== 'TURN_PAUSED') {
      throw new GameCommandError('请先暂停后再重新计时', 'INVALID_STATE')
    }
    db.prepare(`UPDATE game_turns SET remaining_ms = ? WHERE id = ?`).run(
      game.turn_duration_ms,
      turn.id
    )
    timer.disarm(input.gameId)
    const eventId = randomUUID()
    writeReceipt(db, { commandId: input.commandId, gameId: input.gameId, eventId, applied: true })
    return resultOf(db, input.gameId, timer, now, true, eventId)
  })
}

export function undoLastAnswer(
  db: Database.Database,
  input: GameCommandInput,
  options?: EngineOptions
): CommandCore {
  const timer = clock(options)
  const now = nowMs(options)
  return immediate(db, () => {
    const receipt = readReceipt(db, input.commandId)
    if (receipt) return duplicate(db, input.gameId, receipt, timer, now)
    assertHealthy(db, input.gameId, timer)
    const game = loadGameRow(db, input.gameId)
    requireMutableGame(game)
    const turn = resolveTurn(db, game)
    if (!turn || (turn.status !== 'TURN_RUNNING' && turn.status !== 'TURN_PAUSED')) {
      throw new GameCommandError('已结算、已耗尽或未开始的挑战不能撤销', 'INVALID_STATE')
    }
    const remaining = authoritativeRemaining(turn, timer, now)
    if (turn.status === 'TURN_RUNNING' && remaining <= 0) {
      const timeout = applyTimeoutBody(db, input.gameId, timer, now)
      writeReceipt(db, {
        commandId: input.commandId,
        gameId: input.gameId,
        eventId: timeout.eventId,
        applied: false,
        rejectReason: 'TIMEOUT'
      })
      return resultOf(
        db,
        input.gameId,
        timer,
        now,
        false,
        timeout.eventId,
        'TIMEOUT',
        timeout.applied ? uiEvent(input.gameId, timeout.eventId, timeout.kind, 'TIMEOUT') : undefined
      )
    }
    const latest = db
      .prepare(
        `SELECT * FROM answer_events
         WHERE turn_id = ? AND action IN ('CORRECT', 'SKIPPED')
         ORDER BY occurred_at DESC, rowid DESC LIMIT 1`
      )
      .get(turn.id) as
      | { id: string; queue_item_id: string | null; score_delta: number; action: string }
      | undefined
    if (!latest || !latest.queue_item_id) {
      throw new GameCommandError('没有可撤销的答对或跳过', 'INVALID_STATE')
    }
    const reverted = db
      .prepare('SELECT id FROM answer_events WHERE reverts_event_id = ?')
      .get(latest.id) as { id: string } | undefined
    if (reverted) throw new GameCommandError('最近一次判定已经撤销', 'INVALID_STATE')
    const previous = loadQueueItem(db, latest.queue_item_id)
    if (!previous || previous.state !== 'JUDGED') {
      throw new GameCommandError('上一题无法撤销', 'INVALID_STATE')
    }
    db.prepare(`UPDATE game_question_queue SET state = 'VOIDED', verdict = NULL WHERE id = ?`)
      .run(previous.id)
    const undoId = randomUUID()
    insertAnswer(db, {
      id: undoId,
      gameId: input.gameId,
      turnId: turn.id,
      queueItemId: previous.id,
      commandId: input.commandId,
      action: 'UNDO',
      scoreDelta: -latest.score_delta,
      remainingMs: remaining,
      revertsEventId: latest.id
    })
    addScore(db, turn, -latest.score_delta)
    db.prepare('UPDATE game_turns SET remaining_ms = ? WHERE id = ?').run(remaining, turn.id)
    writeReceipt(db, { commandId: input.commandId, gameId: input.gameId, eventId: undoId, applied: true })
    return resultOf(db, input.gameId, timer, now, true, undoId)
  })
}

export function advanceToNextTeam(
  db: Database.Database,
  input: GameCommandInput,
  options?: EngineOptions
): CommandCore {
  const timer = clock(options)
  const now = nowMs(options)
  return immediate(db, () => {
    const receipt = readReceipt(db, input.commandId)
    if (receipt) return duplicate(db, input.gameId, receipt, timer, now)
    assertHealthy(db, input.gameId, timer)
    const game = loadGameRow(db, input.gameId)
    if (game.status !== 'GAME_ACTIVE') {
      throw new GameCommandError('当前比赛不能切换下一队', 'INVALID_STATE')
    }
    const turn = resolveTurn(db, game)
    if (!turn || turn.status !== 'TURN_FINISHED') {
      throw new GameCommandError('请先完成本队结算，再手动开始下一队', 'INVALID_STATE')
    }
    const next = db
      .prepare('SELECT * FROM game_turns WHERE game_id = ? AND sequence_no = ?')
      .get(input.gameId, turn.sequence_no + 1) as TurnRow | undefined
    if (!next || next.status !== 'TURN_PENDING') {
      throw new GameCommandError('没有等待中的下一队', 'INVALID_STATE')
    }
    if (countAvailableQuestions(db, input.gameId) === 0) {
      markUnstarted(db, input.gameId, 'POOL_EXHAUSTED')
      db.prepare(`UPDATE games SET status = 'GAME_FINISHED_EARLY', end_reason = 'POOL_EXHAUSTED', ended_at = ? WHERE id = ?`)
        .run(isoNow(), input.gameId)
      const eventId = randomUUID()
      writeReceipt(db, { commandId: input.commandId, gameId: input.gameId, eventId, applied: true })
      return resultOf(db, input.gameId, timer, now, true, eventId, undefined,
        uiEvent(input.gameId, eventId, 'GAME_FINISHED_EARLY'))
    }
    db.prepare(`UPDATE game_turns SET status = 'TURN_READY' WHERE id = ?`).run(next.id)
    db.prepare('UPDATE games SET current_turn_id = ? WHERE id = ?').run(next.id, input.gameId)
    const eventId = randomUUID()
    insertGameEvent(db, {
      id: eventId,
      gameId: input.gameId,
      turnId: next.id,
      commandId: input.commandId,
      action: 'TURN_ADVANCED'
    })
    timer.disarm(input.gameId)
    writeReceipt(db, { commandId: input.commandId, gameId: input.gameId, eventId, applied: true })
    return resultOf(db, input.gameId, timer, now, true, eventId)
  })
}

export function abortGame(
  db: Database.Database,
  input: AbortGameInput,
  options?: EngineOptions
): CommandCore {
  const timer = clock(options)
  const now = nowMs(options)
  return immediate(db, () => {
    const receipt = readReceipt(db, input.commandId)
    if (receipt) return duplicate(db, input.gameId, receipt, timer, now)
    assertHealthy(db, input.gameId, timer)
    const game = loadGameRow(db, input.gameId)
    requireMutableGame(game)
    const turn = resolveTurn(db, game)
    if (turn?.status === 'TURN_RUNNING') {
      throw new GameCommandError('请先暂停，再确认中止整场比赛', 'INVALID_STATE')
    }
    if (turn?.status === 'TURN_PAUSED' && turn.current_queue_item_id) {
      const item = loadQueueItem(db, turn.current_queue_item_id)
      if (item?.state === 'CURRENT') {
        db.prepare(`UPDATE game_question_queue SET state = 'VOIDED' WHERE id = ?`).run(item.id)
        insertAnswer(db, {
          id: randomUUID(),
          gameId: input.gameId,
          turnId: turn.id,
          queueItemId: item.id,
          commandId: `${input.commandId}:voided`,
          action: 'VOIDED',
          scoreDelta: 0,
          remainingMs: turn.remaining_ms,
          reason: 'USER_ABORTED'
        })
      }
      db.prepare(
        `UPDATE game_turns
         SET status = 'TURN_ABORTED', end_reason = 'USER_ABORTED', current_queue_item_id = NULL, ended_at = ?
         WHERE id = ?`
      ).run(isoNow(), turn.id)
    }
    markUnstarted(db, input.gameId, 'USER_ABORTED')
    db.prepare(
      `UPDATE games SET status = 'GAME_ABORTED', end_reason = 'USER_ABORTED', ended_at = ? WHERE id = ?`
    ).run(isoNow(), input.gameId)
    timer.disarm(input.gameId)
    const eventId = randomUUID()
    insertGameEvent(db, {
      id: eventId,
      gameId: input.gameId,
      turnId: turn?.id ?? null,
      commandId: input.commandId,
      action: 'GAME_ABORTED',
      reason: input.reason ?? null
    })
    writeReceipt(db, { commandId: input.commandId, gameId: input.gameId, eventId, applied: true })
    return resultOf(
      db,
      input.gameId,
      timer,
      now,
      true,
      eventId,
      undefined,
      uiEvent(input.gameId, eventId, 'GAME_ABORTED')
    )
  })
}

export function pauseRunningForExit(
  db: Database.Database,
  timer: TimerEngine,
  now: number
): void {
  const activeGames = timer.activeGameIds()
  const pendingTimer = new TimerEngine()

  // Pause commands disarm their timer before committing. Use a separate timer until every
  // pause has committed so a failed save leaves the original deadlines intact.
  immediate(db, () => {
    for (const gameId of activeGames) {
      const turnId = timer.turnId(gameId)
      const remaining = timer.peek(gameId, now)
      if (turnId == null || remaining == null) continue
      pendingTimer.arm(gameId, turnId, remaining, now)
      const result = pauseTurn(db, { gameId, commandId: randomUUID() }, { timer: pendingTimer, now })
      if (!result.applied && result.rejectReason !== 'TIMEOUT') {
        throw new Error(`Unable to pause active game ${gameId}: ${result.rejectReason}`)
      }
    }
  })
  for (const gameId of activeGames) timer.disarm(gameId)
}

export function recoverDatabase(db: Database.Database, timer: TimerEngine = timerEngine): string[] {
  const notes: string[] = []
  const games = db.prepare('SELECT id, status FROM games').all() as Array<{ id: string; status: string }>
  for (const game of games) {
    if (getRecoveryLock(db, game.id)) {
      timer.disarm(game.id)
      notes.push(`${game.id}:already-locked`)
      continue
    }
    const issue = detectIssues(db, game.id)
    if (issue) {
      setRecoveryLock(db, game.id, issue, timer)
      notes.push(`${game.id}:${issue}`)
      continue
    }
    if (game.status !== 'GAME_READY' && game.status !== 'GAME_ACTIVE') continue
    const running = db
      .prepare(`SELECT * FROM game_turns WHERE game_id = ? AND status = 'TURN_RUNNING'`)
      .all(game.id) as TurnRow[]
    for (const turn of running) {
      const commandId = `recover:${turn.id}`
      immediate(db, () => {
        db.prepare(`UPDATE game_turns SET status = 'TURN_PAUSED' WHERE id = ? AND status = 'TURN_RUNNING'`).run(
          turn.id
        )
        const exists = db.prepare('SELECT id FROM game_events WHERE command_id = ?').get(commandId) as
          | { id: string }
          | undefined
        if (!exists) {
          insertGameEvent(db, {
            id: randomUUID(),
            gameId: game.id,
            turnId: turn.id,
            commandId,
            action: 'RECOVERED_TO_PAUSED'
          })
        }
      })
      timer.disarm(game.id)
      notes.push(`${game.id}:paused`)
    }
  }
  return notes
}

export function checkpointRunning(
  db: Database.Database,
  timer: TimerEngine = timerEngine,
  now = performance.now()
): void {
  for (const gameId of timer.activeGameIds()) {
    if (getRecoveryLock(db, gameId)) {
      timer.disarm(gameId)
      continue
    }
    const remaining = timer.peek(gameId, now)
    const turnId = timer.turnId(gameId)
    if (remaining == null || !turnId) continue
    db.prepare(
      `UPDATE game_turns SET remaining_ms = ? WHERE id = ? AND status = 'TURN_RUNNING'`
    ).run(remaining, turnId)
    if (remaining <= 0) {
      try {
        settleTimeout(db, gameId, { timer, now })
      } catch {
        timer.disarm(gameId)
      }
    }
  }
}

export function listGameSummaries(
  db: Database.Database,
  timer: TimerEngine = timerEngine,
  now = performance.now()
): GameSummary[] {
  const rows = db
    .prepare('SELECT id, created_at FROM games ORDER BY created_at DESC LIMIT 20')
    .all() as Array<{ id: string; created_at: string }>
  return rows.map((row) => {
    const snapshot = loadPlaySnapshot(db, row.id, timer, now)
    return {
      id: snapshot.id,
      name: snapshot.name,
      status: snapshot.status,
      createdAt: row.created_at,
      phase: snapshot.phase
    }
  })
}

export function getPlaySnapshot(
  db: Database.Database,
  gameId: string,
  options?: EngineOptions
): GameCommandResult['snapshot'] {
  return loadPlaySnapshot(db, gameId, clock(options), nowMs(options))
}
