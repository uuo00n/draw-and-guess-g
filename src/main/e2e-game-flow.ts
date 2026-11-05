import { randomUUID } from 'node:crypto'
import { app } from 'electron'
import type { AppDatabase } from './database/connection'
import { TimerEngine } from './domain/timer-engine'
import { createGame } from './domain/game-create'
import {
  advanceToNextTeam,
  checkpointRunning,
  getPlaySnapshot,
  pauseTurn,
  recoverDatabase,
  resumeTurn,
  settleTimeout,
  startTurn,
  submitAnswer
} from './domain/game-engine'
import { commitImportRows } from './services/question-service'
import { saveCurrentRoster } from './services/roster-service'

const DURATION = 60_000

export type E2EResult = {
  ok: boolean
  steps: string[]
  error?: string
}

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message)
}

function e2eDataDir(): string {
  return `${process.env.E2E_USER_DATA ?? app.getPath('userData')}/data`
}

function seedE2ERoster(): void {
  saveCurrentRoster(e2eDataDir(), {
    total: 2,
    groupCount: 2,
    groups: [
      { group: 1, members: ['E2E-甲'] },
      { group: 2, members: ['E2E-乙'] }
    ]
  })
}

function makeGame(db: AppDatabase, texts: string[], name: string) {
  const imported = commitImportRows(
    db,
    `${name}.xlsx`,
    Buffer.from(name),
    texts.map((text, index) => ({
      rowNumber: index + 2,
      text,
      category: '烟测',
      difficulty: '普通',
      points: 1
    }))
  )
  if (!imported.bankId) throw new Error('导入失败')
  return createGame(
    db,
    {
      commandId: randomUUID(),
      name,
      bankId: imported.bankId,
      turnDurationSec: 60,
      scoreMode: 'UNIFORM',
      categoryFilter: ['烟测'],
      participatingGroupNumbers: [1, 2]
    },
    { dataDir: e2eDataDir() }
  )
}

export function runElectronGameFlow(db: AppDatabase): E2EResult {
  const steps: string[] = []
  const timer = new TimerEngine()
  try {
    seedE2ERoster()
    const game = makeGame(db, ['长颈鹿', '火锅', '画蛇添足', '需求变更'], '闭环')
    const t0 = 50_000_000
    const ready = getPlaySnapshot(db, game.id, { timer, now: t0 })
    assert(ready.phase === 'ready', '创建后应停在准备页')
    assert(ready.currentQuestion == null, '准备页不能展示题目')
    assert(ready.turns[1]?.status === 'TURN_PENDING', '下一队不能自动开始')
    steps.push('ready')

    const started = startTurn(db, { gameId: game.id, commandId: randomUUID() }, { timer, now: t0 })
    assert(started.snapshot.phase === 'running', '开始后应公开倒计时')
    assert(Boolean(started.snapshot.currentQuestion?.text), '应公开题目')
    const turnId = started.snapshot.currentTurn!.id
    const firstQuestion = started.snapshot.currentQuestion!.queueItemId
    steps.push('started')

    const commandId = randomUUID()
    const correct = submitAnswer(
      db,
      { commandId, gameId: game.id, turnId, currentQueueItemId: firstQuestion, verdict: 'CORRECT' },
      { timer, now: t0 + 3000 }
    )
    assert(correct.applied, '答对应生效')
    assert(correct.snapshot.currentTurn?.remainingMs === DURATION - 3000, '答对不能重置倒计时')
    assert(correct.snapshot.currentTurn?.turnScore === 1, '答对加 1 分')
    const replay = submitAnswer(
      db,
      { commandId, gameId: game.id, turnId, currentQueueItemId: firstQuestion, verdict: 'CORRECT' },
      { timer, now: t0 + 3000 }
    )
    assert(!replay.applied && replay.snapshot.currentTurn?.turnScore === 1, '重复 commandId 不能加分')
    const stale = submitAnswer(
      db,
      {
        commandId: randomUUID(),
        gameId: game.id,
        turnId,
        currentQueueItemId: firstQuestion,
        verdict: 'CORRECT'
      },
      { timer, now: t0 + 3200 }
    )
    assert(!stale.applied && stale.rejectReason === 'STALE', '旧题双击不能加分')
    steps.push('correct-once')

    const skipped = submitAnswer(
      db,
      {
        commandId: randomUUID(),
        gameId: game.id,
        turnId,
        currentQueueItemId: correct.snapshot.currentQuestion!.queueItemId,
        verdict: 'SKIPPED'
      },
      { timer, now: t0 + 4000 }
    )
    assert(skipped.snapshot.currentTurn?.turnScore === 1, '跳过不加分')
    assert(skipped.snapshot.currentTurn?.remainingMs === DURATION - 4000, '跳过不能重置倒计时')
    steps.push('skip')

    const ended = settleTimeout(db, game.id, { timer, now: t0 + DURATION })
    assert(ended.snapshot.phase === 'turn-result', '到时应进入本队结算')
    assert(ended.snapshot.turns[1]?.status === 'TURN_PENDING', '结算后下一队仍未开始')
    steps.push('team-finished')

    const next = advanceToNextTeam(
      db,
      { gameId: game.id, commandId: randomUUID() },
      { timer, now: t0 + DURATION }
    )
    assert(next.snapshot.phase === 'ready', '下一队必须手动进入准备')
    assert(next.snapshot.currentQuestion == null, '准备页仍不展示题目')
    assert(timer.peek(game.id, t0 + DURATION) == null, '准备页不能自动开表')
    steps.push('manual-next')

    const second = startTurn(
      db,
      { gameId: game.id, commandId: randomUUID() },
      { timer, now: t0 + DURATION + 5 }
    )
    const done = settleTimeout(db, game.id, { timer, now: t0 + DURATION + 5 + DURATION })
    assert(done.snapshot.status === 'GAME_FINISHED', '全部按时间结束才是 GAME_FINISHED')
    assert(done.snapshot.phase === 'final', '应进入结果页')
    assert(second.snapshot.currentTurn?.teamName === '第 2 组', '第二组才开始挑战')
    steps.push('final')

    const race = makeGame(db, ['超时题', '备用题'], '超时优先')
    const raceStart = startTurn(
      db,
      { gameId: race.id, commandId: randomUUID() },
      { timer, now: t0 }
    )
    const raced = submitAnswer(
      db,
      {
        commandId: randomUUID(),
        gameId: race.id,
        turnId: raceStart.snapshot.currentTurn!.id,
        currentQueueItemId: raceStart.snapshot.currentQuestion!.queueItemId,
        verdict: 'CORRECT'
      },
      { timer, now: t0 + DURATION }
    )
    assert(raced.rejectReason === 'TIMEOUT', '零秒应优先超时')
    assert(raced.snapshot.teams.every((team) => team.totalScore === 0), '超时不能加分')
    steps.push('timeout-priority')

    const resumeGame = makeGame(db, ['暂停题', '另一题'], '恢复')
    startTurn(db, { gameId: resumeGame.id, commandId: randomUUID() }, { timer, now: t0 })
    pauseTurn(db, { gameId: resumeGame.id, commandId: randomUUID() }, { timer, now: t0 + 2000 })
    resumeTurn(db, { gameId: resumeGame.id, commandId: randomUUID() }, { timer, now: t0 + 9000 })
    checkpointRunning(db, timer, t0 + 10_000)
    const question = getPlaySnapshot(db, resumeGame.id, { timer, now: t0 + 10_000 }).currentQuestion
      ?.queueItemId
    const positions = db
      .prepare('SELECT queue_position FROM game_question_queue WHERE game_id = ? ORDER BY queue_position')
      .all(resumeGame.id)
    recoverDatabase(db, timer)
    const restored = getPlaySnapshot(db, resumeGame.id, { timer, now: t0 + 10_000 })
    assert(restored.phase === 'paused', '运行中的倒计时重启后应暂停')
    assert(restored.currentQuestion?.queueItemId === question, '应重展同一题')
    assert(timer.peek(resumeGame.id, t0 + 10_000) == null, '恢复后不能自动开表')
    const positionsAfter = db
      .prepare('SELECT queue_position FROM game_question_queue WHERE game_id = ? ORDER BY queue_position')
      .all(resumeGame.id)
    assert(JSON.stringify(positionsAfter) === JSON.stringify(positions), '恢复不能重洗队列')
    steps.push('recover-paused')

    return { ok: true, steps }
  } catch (error) {
    return { ok: false, steps, error: error instanceof Error ? error.message : String(error) }
  }
}