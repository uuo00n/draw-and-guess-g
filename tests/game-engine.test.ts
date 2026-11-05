import { randomUUID } from 'node:crypto'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { openDatabase, openMemoryDatabase } from '../src/main/database/connection'
import type { AppDatabase } from '../src/main/database/connection'
import { TimerEngine } from '../src/main/domain/timer-engine'
import { createGame } from '../src/main/domain/game-create'
import {
  abortGame,
  advanceToNextTeam,
  checkpointRunning,
  GameCommandError,
  getPlaySnapshot,
  pauseTurn,
  recoverDatabase,
  resetTurnTimer,
  resumeTurn,
  settleTimeout,
  startTurn,
  submitAnswer,
  undoLastAnswer
} from '../src/main/domain/game-engine'
import { commitImportRows } from '../src/main/services/question-service'
import { makeTestDataDir, testCreateInput } from './test-roster'

const DURATION = 60_000

function seed(
  db: AppDatabase,
  texts: string[],
  options?: { teams?: number; rounds?: number; seconds?: number }
) {
  const imported = commitImportRows(
    db,
    'seed.xlsx',
    Buffer.from('seed'),
    texts.map((text, index) => ({
      rowNumber: index + 2,
      text,
      category: '测试',
      difficulty: '普通',
      points: index + 1
    }))
  )
  if (!imported.bankId) throw new Error('seed failed')
  const teamCount = options?.teams ?? 2
  const dataDir = makeTestDataDir(teamCount)
  const created = createGame(
    db,
    testCreateInput(
      imported.bankId,
      {
        roundCount: options?.rounds ?? 1,
        turnDurationSec: options?.seconds ?? 60
      },
      teamCount
    ),
    { dataDir }
  )
  return created
}

function queueStates(db: AppDatabase, gameId: string) {
  return db
    .prepare(
      `SELECT id, state, question_text_snapshot AS text, queue_position AS pos
       FROM game_question_queue WHERE game_id = ? ORDER BY queue_position`
    )
    .all(gameId) as Array<{ id: string; state: string; text: string; pos: number }>
}

describe('game core loop', () => {
  it('does not double-score a repeated command or a stale second click', () => {
    const db = openMemoryDatabase()
    const timer = new TimerEngine()
    const game = seed(db, ['苹果', '香蕉', '橙子'])
    const t0 = 1_000_000
    const started = startTurn(db, { gameId: game.id, commandId: randomUUID() }, { timer, now: t0 })
    const questionId = started.snapshot.currentQuestion?.queueItemId
    const turnId = started.snapshot.currentTurn?.id
    expect(questionId).toBeTruthy()
    expect(turnId).toBeTruthy()

    const commandId = randomUUID()
    const first = submitAnswer(
      db,
      {
        commandId,
        gameId: game.id,
        turnId: turnId!,
        currentQueueItemId: questionId!,
        verdict: 'CORRECT'
      },
      { timer, now: t0 + 1000 }
    )
    const replay = submitAnswer(
      db,
      {
        commandId,
        gameId: game.id,
        turnId: turnId!,
        currentQueueItemId: questionId!,
        verdict: 'CORRECT'
      },
      { timer, now: t0 + 1000 }
    )
    const secondClick = submitAnswer(
      db,
      {
        commandId: randomUUID(),
        gameId: game.id,
        turnId: turnId!,
        currentQueueItemId: questionId!,
        verdict: 'CORRECT'
      },
      { timer, now: t0 + 1200 }
    )

    expect(first.applied).toBe(true)
    expect(first.snapshot.teams.find((team) => team.name === '第 1 组')?.totalScore).toBe(1)
    expect(replay.applied).toBe(false)
    expect(replay.rejectReason).toBe('DUPLICATE')
    expect(secondClick.applied).toBe(false)
    expect(secondClick.rejectReason).toBe('STALE')
    const score = getPlaySnapshot(db, game.id, { timer, now: t0 + 1200 }).teams.find(
      (team) => team.name === '第 1 组'
    )?.totalScore
    expect(score).toBe(1)
    const corrects = db
      .prepare(`SELECT COUNT(*) AS c FROM answer_events WHERE game_id = ? AND action = 'CORRECT'`)
      .get(game.id) as { c: number }
    expect(corrects.c).toBe(1)
  })

  it('lets timeout win when remaining time is already zero', () => {
    const db = openMemoryDatabase()
    const timer = new TimerEngine()
    const game = seed(db, ['苹果', '香蕉'])
    const t0 = 2_000_000
    const started = startTurn(db, { gameId: game.id, commandId: randomUUID() }, { timer, now: t0 })
    const raced = submitAnswer(
      db,
      {
        commandId: randomUUID(),
        gameId: game.id,
        turnId: started.snapshot.currentTurn!.id,
        currentQueueItemId: started.snapshot.currentQuestion!.queueItemId,
        verdict: 'CORRECT'
      },
      { timer, now: t0 + DURATION }
    )
    expect(raced.applied).toBe(false)
    expect(raced.rejectReason).toBe('TIMEOUT')
    expect(raced.snapshot.currentTurn?.status).toBe('TURN_FINISHED')
    expect(raced.snapshot.currentTurn?.endReason).toBe('TIME_UP')
    expect(raced.snapshot.teams.every((team) => team.totalScore === 0)).toBe(true)
    const verdict = db
      .prepare(`SELECT verdict, state FROM game_question_queue WHERE game_id = ? AND state = 'JUDGED'`)
      .get(game.id) as { verdict: string; state: string }
    expect(verdict.verdict).toBe('TIMEOUT')
    const timeouts = db
      .prepare(`SELECT COUNT(*) AS c FROM answer_events WHERE action = 'TIMEOUT' AND game_id = ?`)
      .get(game.id) as { c: number }
    expect(timeouts.c).toBe(1)
    settleTimeout(db, game.id, { timer, now: t0 + DURATION })
    const timeoutsAfter = db
      .prepare(`SELECT COUNT(*) AS c FROM answer_events WHERE action = 'TIMEOUT' AND game_id = ?`)
      .get(game.id) as { c: number }
    expect(timeoutsAfter.c).toBe(1)
  })

  it('voids the revealed next question on undo and does not return it to the pool', () => {
    const db = openMemoryDatabase()
    const timer = new TimerEngine()
    const game = seed(db, ['苹果', '香蕉', '橙子'])
    const t0 = 3_000_000
    const started = startTurn(db, { gameId: game.id, commandId: randomUUID() }, { timer, now: t0 })
    const firstText = started.snapshot.currentQuestion!.text
    const judged = submitAnswer(
      db,
      {
        commandId: randomUUID(),
        gameId: game.id,
        turnId: started.snapshot.currentTurn!.id,
        currentQueueItemId: started.snapshot.currentQuestion!.queueItemId,
        verdict: 'CORRECT'
      },
      { timer, now: t0 + 4000 }
    )
    const revealedId = judged.snapshot.currentQuestion!.queueItemId
    const beforeUndo = judged.snapshot.currentTurn!.remainingMs
    expect(beforeUndo).toBe(DURATION - 4000)
    const undone = undoLastAnswer(
      db,
      { gameId: game.id, commandId: randomUUID() },
      { timer, now: t0 + 4000 }
    )
    expect(undone.snapshot.currentQuestion?.text).toBe(firstText)
    expect(undone.snapshot.currentTurn?.remainingMs).toBe(beforeUndo)
    expect(undone.snapshot.teams.find((team) => team.name === '第 1 组')?.totalScore).toBe(0)
    const states = queueStates(db, game.id)
    expect(states.find((row) => row.id === revealedId)?.state).toBe('VOIDED')
    expect(states.filter((row) => row.state === 'CURRENT')).toHaveLength(1)
    const again = submitAnswer(
      db,
      {
        commandId: randomUUID(),
        gameId: game.id,
        turnId: undone.snapshot.currentTurn!.id,
        currentQueueItemId: undone.snapshot.currentQuestion!.queueItemId,
        verdict: 'SKIPPED'
      },
      { timer, now: t0 + 4000 }
    )
    expect(again.snapshot.currentQuestion?.queueItemId).not.toBe(revealedId)
    expect(again.snapshot.teams.find((team) => team.name === '第 1 组')?.totalScore).toBe(0)
    expect(queueStates(db, game.id).find((row) => row.id === revealedId)?.state).toBe('VOIDED')
  })

  it('keeps a single current question and does not reset the clock on correct or skip', () => {
    const db = openMemoryDatabase()
    const timer = new TimerEngine()
    const game = seed(db, ['苹果', '香蕉', '橙子', '葡萄'])
    const t0 = 4_000_000
    const started = startTurn(db, { gameId: game.id, commandId: randomUUID() }, { timer, now: t0 })
    const skipped = submitAnswer(
      db,
      {
        commandId: randomUUID(),
        gameId: game.id,
        turnId: started.snapshot.currentTurn!.id,
        currentQueueItemId: started.snapshot.currentQuestion!.queueItemId,
        verdict: 'SKIPPED'
      },
      { timer, now: t0 + 5000 }
    )
    expect(skipped.snapshot.currentTurn?.remainingMs).toBe(DURATION - 5000)
    expect(skipped.snapshot.currentTurn?.turnScore).toBe(0)
    expect(queueStates(db, game.id).filter((row) => row.state === 'CURRENT')).toHaveLength(1)
    const corrected = submitAnswer(
      db,
      {
        commandId: randomUUID(),
        gameId: game.id,
        turnId: skipped.snapshot.currentTurn!.id,
        currentQueueItemId: skipped.snapshot.currentQuestion!.queueItemId,
        verdict: 'CORRECT'
      },
      { timer, now: t0 + 8000 }
    )
    expect(corrected.snapshot.currentTurn?.remainingMs).toBe(DURATION - 8000)
    expect(corrected.snapshot.currentTurn?.turnScore).toBe(1)
    expect(queueStates(db, game.id).filter((row) => row.state === 'CURRENT')).toHaveLength(1)
  })

  it('does not auto-start the next team and finishes only when every turn times out', () => {
    const db = openMemoryDatabase()
    const timer = new TimerEngine()
    const game = seed(db, ['苹果', '香蕉', '橙子'])
    const t0 = 5_000_000
    const started = startTurn(db, { gameId: game.id, commandId: randomUUID() }, { timer, now: t0 })
    const finished = settleTimeout(db, game.id, { timer, now: t0 + DURATION })
    expect(finished.snapshot.phase).toBe('turn-result')
    expect(finished.snapshot.status).toBe('GAME_ACTIVE')
    expect(finished.snapshot.turns.map((turn) => turn.status)).toEqual(['TURN_FINISHED', 'TURN_PENDING'])
    expect(finished.snapshot.currentQuestion).toBeNull()
    expect(timer.peek(game.id, t0 + DURATION)).toBeNull()
    expect(finished.snapshot.canAdvance).toBe(true)

    const ready = advanceToNextTeam(
      db,
      { gameId: game.id, commandId: randomUUID() },
      { timer, now: t0 + DURATION }
    )
    expect(ready.snapshot.phase).toBe('ready')
    expect(ready.snapshot.currentTurn?.status).toBe('TURN_READY')
    expect(ready.snapshot.currentTurn?.teamName).toBe('第 2 组')
    expect(ready.snapshot.currentQuestion).toBeNull()
    expect(timer.peek(game.id, t0 + DURATION + 1)).toBeNull()

    const second = startTurn(
      db,
      { gameId: game.id, commandId: randomUUID() },
      { timer, now: t0 + DURATION + 10 }
    )
    expect(second.snapshot.phase).toBe('running')
    const done = settleTimeout(db, game.id, { timer, now: t0 + DURATION + 10 + DURATION })
    expect(done.snapshot.status).toBe('GAME_FINISHED')
    expect(done.snapshot.phase).toBe('final')
    expect(done.snapshot.endReason).toBe('NORMAL_COMPLETE')
    expect(done.snapshot.showChampion).toBe(false)
    expect(done.snapshot.canAdvance).toBe(false)
    expect(done.snapshot.turns.every((turn) => turn.status === 'TURN_FINISHED')).toBe(true)
  })

  it('ends the match early when the pool is empty and does not award a champion', () => {
    const db = openMemoryDatabase()
    const timer = new TimerEngine()
    const game = seed(db, ['唯一题'])
    const t0 = 6_000_000
    const started = startTurn(db, { gameId: game.id, commandId: randomUUID() }, { timer, now: t0 })
    const exhausted = submitAnswer(
      db,
      {
        commandId: randomUUID(),
        gameId: game.id,
        turnId: started.snapshot.currentTurn!.id,
        currentQueueItemId: started.snapshot.currentQuestion!.queueItemId,
        verdict: 'CORRECT'
      },
      { timer, now: t0 + 1000 }
    )
    expect(exhausted.snapshot.status).toBe('GAME_FINISHED_EARLY')
    expect(exhausted.snapshot.phase).toBe('final-early')
    expect(exhausted.snapshot.showChampion).toBe(false)
    expect(exhausted.snapshot.canAdvance).toBe(false)
    expect(exhausted.snapshot.turns.map((turn) => turn.status)).toEqual([
      'TURN_EXHAUSTED',
      'TURN_NOT_PLAYED'
    ])
    expect(exhausted.snapshot.teams.find((team) => team.name === '第 1 组')?.totalScore).toBe(1)
  })

  it('prefers timeout over exhaust when the clock and the last question hit together', () => {
    const db = openMemoryDatabase()
    const timer = new TimerEngine()
    const game = seed(db, ['唯一题'])
    const t0 = 7_000_000
    const started = startTurn(db, { gameId: game.id, commandId: randomUUID() }, { timer, now: t0 })
    const raced = submitAnswer(
      db,
      {
        commandId: randomUUID(),
        gameId: game.id,
        turnId: started.snapshot.currentTurn!.id,
        currentQueueItemId: started.snapshot.currentQuestion!.queueItemId,
        verdict: 'CORRECT'
      },
      { timer, now: t0 + DURATION }
    )
    expect(raced.rejectReason).toBe('TIMEOUT')
    expect(raced.snapshot.turns[0]?.status).toBe('TURN_FINISHED')
    expect(raced.snapshot.turns[1]?.status).toBe('TURN_NOT_PLAYED')
    expect(raced.snapshot.status).toBe('GAME_FINISHED_EARLY')
    expect(raced.snapshot.teams.every((team) => team.totalScore === 0)).toBe(true)
  })

  it('pauses without consuming time and restores a running turn as paused', () => {
    const dir = mkdtempSync(join(tmpdir(), 'draw-guess-'))
    const dbPath = join(dir, 'draw-and-guess.db')
    const db = openDatabase(dbPath)
    const timer = new TimerEngine()
    const game = seed(db, ['苹果', '香蕉'])
    const t0 = 8_000_000
    startTurn(db, { gameId: game.id, commandId: randomUUID() }, { timer, now: t0 })
    const paused = pauseTurn(db, { gameId: game.id, commandId: randomUUID() }, { timer, now: t0 + 5000 })
    expect(paused.snapshot.phase).toBe('paused')
    expect(paused.snapshot.currentTurn?.remainingMs).toBe(DURATION - 5000)
    expect(timer.peek(game.id, t0 + 20_000)).toBeNull()
    expect(() =>
      submitAnswer(
        db,
        {
          commandId: randomUUID(),
          gameId: game.id,
          turnId: paused.snapshot.currentTurn!.id,
          currentQueueItemId: paused.snapshot.currentQuestion!.queueItemId,
          verdict: 'CORRECT'
        },
        { timer, now: t0 + 20_000 }
      )
    ).toThrow(GameCommandError)
    const resumed = resumeTurn(
      db,
      { gameId: game.id, commandId: randomUUID() },
      { timer, now: t0 + 20_000 }
    )
    expect(resumed.snapshot.currentTurn?.remainingMs).toBe(DURATION - 5000)
    expect(timer.peek(game.id, t0 + 21_000)).toBe(DURATION - 6000)
    checkpointRunning(db, timer, t0 + 21_000)

    const questionId = resumed.snapshot.currentQuestion?.queueItemId
    const positions = queueStates(db, game.id).map((row) => row.pos)
    db.close()

    const reopened = openDatabase(dbPath)
    const freshTimer = new TimerEngine()
    freshTimer.arm(game.id, resumed.snapshot.currentTurn!.id, 999, 0)
    const notes = recoverDatabase(reopened, freshTimer)
    expect(notes.some((note) => note.endsWith(':paused'))).toBe(true)
    const restored = getPlaySnapshot(reopened, game.id, { timer: freshTimer, now: 0 })
    expect(restored.phase).toBe('paused')
    expect(restored.currentQuestion?.queueItemId).toBe(questionId)
    expect(restored.currentTurn?.remainingMs).toBe(DURATION - 6000)
    expect(freshTimer.peek(game.id, 0)).toBeNull()
    expect(queueStates(reopened, game.id).map((row) => row.pos)).toEqual(positions)
    recoverDatabase(reopened, freshTimer)
    const events = reopened
      .prepare(`SELECT COUNT(*) AS c FROM game_events WHERE action = 'RECOVERED_TO_PAUSED'`)
      .get() as { c: number }
    expect(events.c).toBe(1)
    reopened.close()
  })

  it('locks recovery instead of guessing or repairing scores', () => {
    const db = openMemoryDatabase()
    const timer = new TimerEngine()
    const game = seed(db, ['苹果', '香蕉', '橙子'])
    const t0 = 9_000_000
    const started = startTurn(db, { gameId: game.id, commandId: randomUUID() }, { timer, now: t0 })
    const scoreBefore = started.snapshot.teams.map((team) => team.totalScore)

    db.prepare('DROP INDEX uq_one_current_question_per_game').run()
    const unused = db
      .prepare(
        `SELECT id FROM game_question_queue WHERE game_id = ? AND state = 'UNUSED' ORDER BY queue_position LIMIT 1`
      )
      .get(game.id) as { id: string }
    db.prepare(
      `UPDATE game_question_queue
       SET state = 'CURRENT', shown_turn_id = ?, first_allocated_at = ?
       WHERE id = ?`
    ).run(started.snapshot.currentTurn!.id, new Date().toISOString(), unused.id)

    const locked = getPlaySnapshot(db, game.id, { timer, now: t0 })
    expect(locked.recoveryRequired).toBe(true)
    expect(locked.recoveryReason).toBe('MULTIPLE_CURRENT')
    expect(locked.phase).toBe('recovery')
    expect(locked.teams.map((team) => team.totalScore)).toEqual(scoreBefore)
    expect(() => startTurn(db, { gameId: game.id, commandId: randomUUID() }, { timer, now: t0 })).toThrow(
      /人工恢复|数据异常/
    )
    expect(queueStates(db, game.id).filter((row) => row.state === 'CURRENT')).toHaveLength(2)

    const pointerGame = seed(db, ['柿子', '梨'])
    const pointerTimer = new TimerEngine()
    const running = startTurn(
      db,
      { gameId: pointerGame.id, commandId: randomUUID() },
      { timer: pointerTimer, now: t0 }
    )
    const originalPointer = running.snapshot.currentQuestion!.queueItemId
    db.prepare(`UPDATE game_turns SET current_queue_item_id = ? WHERE id = ?`).run(
      '00000000-0000-4000-8000-000000000099',
      running.snapshot.currentTurn!.id
    )
    const pointerLock = getPlaySnapshot(db, pointerGame.id, { timer: pointerTimer, now: t0 })
    expect(pointerLock.recoveryReason).toBe('ILLEGAL_POINTER')
    const pointerAfter = db
      .prepare('SELECT current_queue_item_id FROM game_turns WHERE id = ?')
      .get(running.snapshot.currentTurn!.id) as { current_queue_item_id: string }
    expect(pointerAfter.current_queue_item_id).not.toBe(originalPointer)

    const scoreGame = seed(db, ['桃', '李'])
    db.prepare('UPDATE game_teams SET total_score = 9 WHERE game_id = ?').run(scoreGame.id)
    const scoreLock = getPlaySnapshot(db, scoreGame.id, { timer: new TimerEngine(), now: t0 })
    expect(scoreLock.recoveryReason).toBe('SCORE_MISMATCH')
    const scores = db
      .prepare('SELECT total_score FROM game_teams WHERE game_id = ? ORDER BY sort_order')
      .all(scoreGame.id) as Array<{ total_score: number }>
    expect(scores.map((row) => row.total_score)).toEqual([9, 9])
  })

  it('aborts from pause without crowning a winner and refuses undo after timeout', () => {
    const db = openMemoryDatabase()
    const timer = new TimerEngine()
    const game = seed(db, ['苹果', '香蕉', '橙子'])
    const t0 = 10_000_000
    const started = startTurn(db, { gameId: game.id, commandId: randomUUID() }, { timer, now: t0 })
    submitAnswer(
      db,
      {
        commandId: randomUUID(),
        gameId: game.id,
        turnId: started.snapshot.currentTurn!.id,
        currentQueueItemId: started.snapshot.currentQuestion!.queueItemId,
        verdict: 'CORRECT'
      },
      { timer, now: t0 + 1000 }
    )
    expect(() => abortGame(db, { gameId: game.id, commandId: randomUUID() }, { timer, now: t0 + 1000 })).toThrow(
      /暂停/
    )
    pauseTurn(db, { gameId: game.id, commandId: randomUUID() }, { timer, now: t0 + 2000 })
    const aborted = abortGame(
      db,
      { gameId: game.id, commandId: randomUUID(), reason: '现场暂停' },
      { timer, now: t0 + 2000 }
    )
    expect(aborted.snapshot.status).toBe('GAME_ABORTED')
    expect(aborted.snapshot.showChampion).toBe(false)
    expect(aborted.snapshot.teams.find((team) => team.name === '第 1 组')?.totalScore).toBe(1)
    expect(aborted.snapshot.turns.some((turn) => turn.status === 'TURN_ABORTED')).toBe(true)
    expect(aborted.snapshot.turns.some((turn) => turn.status === 'TURN_NOT_PLAYED')).toBe(true)
    const voided = queueStates(db, game.id).filter((row) => row.state === 'VOIDED')
    expect(voided.length).toBeGreaterThan(0)
    expect(voided.every((row) => row.state !== 'UNUSED')).toBe(true)

    const timed = seed(db, ['栗子', '枣'])
    const timedTimer = new TimerEngine()
    startTurn(db, { gameId: timed.id, commandId: randomUUID() }, { timer: timedTimer, now: t0 })
    settleTimeout(db, timed.id, { timer: timedTimer, now: t0 + DURATION })
    expect(() =>
      undoLastAnswer(db, { gameId: timed.id, commandId: randomUUID() }, { timer: timedTimer, now: t0 + DURATION })
    ).toThrow(/不能撤销/)
  })

  it('resets paused turn timer back to full challenge duration', () => {
    const db = openMemoryDatabase()
    const timer = new TimerEngine()
    const game = seed(db, ['A', 'B', 'C'])
    const t0 = 12_000_000
    startTurn(db, { gameId: game.id, commandId: randomUUID() }, { timer, now: t0 })
    pauseTurn(db, { gameId: game.id, commandId: randomUUID() }, { timer, now: t0 + 15_000 })
    const paused = getPlaySnapshot(db, game.id, { timer, now: t0 + 15_000 })
    expect(paused.currentTurn!.remainingMs).toBeLessThan(DURATION)

    resetTurnTimer(db, { gameId: game.id, commandId: randomUUID() }, { timer, now: t0 + 16_000 })
    const reset = getPlaySnapshot(db, game.id, { timer, now: t0 + 16_000 })
    expect(reset.currentTurn!.remainingMs).toBe(DURATION)
    expect(reset.canResetTimer).toBe(true)
  })

  it('assigns each normalized question at most once across teams', () => {
    const db = openMemoryDatabase()
    const timer = new TimerEngine()
    const game = seed(db, ['画蛇添足', '画龙点睛'])
    const t0 = 11_000_000
    const first = startTurn(db, { gameId: game.id, commandId: randomUUID() }, { timer, now: t0 })
    const seen = new Set<string>([first.snapshot.currentQuestion!.text])
    submitAnswer(
      db,
      {
        commandId: randomUUID(),
        gameId: game.id,
        turnId: first.snapshot.currentTurn!.id,
        currentQueueItemId: first.snapshot.currentQuestion!.queueItemId,
        verdict: 'SKIPPED'
      },
      { timer, now: t0 + 1000 }
    )
    const mid = getPlaySnapshot(db, game.id, { timer, now: t0 + 1000 })
    expect(seen.has(mid.currentQuestion!.text)).toBe(false)
    seen.add(mid.currentQuestion!.text)
    const ended = submitAnswer(
      db,
      {
        commandId: randomUUID(),
        gameId: game.id,
        turnId: mid.currentTurn!.id,
        currentQueueItemId: mid.currentQuestion!.queueItemId,
        verdict: 'CORRECT'
      },
      { timer, now: t0 + 2000 }
    )
    expect(ended.snapshot.status).toBe('GAME_FINISHED_EARLY')
    const used = queueStates(db, game.id).filter((row) => row.state !== 'UNUSED')
    expect(new Set(used.map((row) => row.text)).size).toBe(used.length)
    expect(used).toHaveLength(2)
  })
})
