import { randomUUID } from 'node:crypto'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import { openDatabase, openMemoryDatabase, type AppDatabase } from '../src/main/database/connection'
import { createGame } from '../src/main/domain/game-create'
import {
  abortGame,
  advanceToNextTeam,
  pauseTurn,
  settleTimeout,
  startTurn,
  submitAnswer,
  undoLastAnswer
} from '../src/main/domain/game-engine'
import { TimerEngine } from '../src/main/domain/timer-engine'
import { backupDatabaseFile, restoreDatabaseFile } from '../src/main/services/backup-service'
import { getHistory, listHistory } from '../src/main/services/history-service'
import { buildResultsWorkbook } from '../src/main/services/results-export'
import { commitImportRows } from '../src/main/services/question-service'
import { planCommittedEffects, nextTickSecond } from '../src/shared/effects'
import type { GameUiEvent } from '../src/shared/schemas/play'
import { TEAM_PALETTE } from '../src/shared/constants'

const DURATION = 60_000

function seed(db: AppDatabase, texts: string[], rounds = 1) {
  const imported = commitImportRows(
    db,
    'seed.xlsx',
    Buffer.from('seed'),
    texts.map((text, index) => ({
      rowNumber: index + 2,
      text,
      category: '测试',
      difficulty: '普通',
      points: 1
    }))
  )
  if (!imported.bankId) throw new Error('seed failed')
  return createGame(db, {
    name: `团建 ${texts[0]}`,
    bankId: imported.bankId,
    roundCount: rounds,
    turnDurationSec: 60,
    scoreMode: 'UNIFORM',
    teams: [
      { name: '红队', color: TEAM_PALETTE[0], sortOrder: 0 },
      { name: '蓝队', color: TEAM_PALETTE[1], sortOrder: 1 }
    ]
  })
}

function event(partial: Partial<GameUiEvent> & Pick<GameUiEvent, 'kind'>): GameUiEvent {
  return {
    eventId: partial.eventId ?? 'evt-1',
    gameId: partial.gameId ?? '00000000-0000-4000-8000-000000000001',
    kind: partial.kind,
    verdict: partial.verdict,
    turnSequenceNo: partial.turnSequenceNo,
    emittedAt: partial.emittedAt ?? '2026-11-05T00:00:00.000Z'
  }
}

describe('history, export, and backup', () => {
  it('lists finished, early, and aborted games and keeps voided questions', () => {
    const db = openMemoryDatabase()
    const timer = new TimerEngine()
    const t0 = 2_000_000

    const early = seed(db, ['唯一题'])
    const earlyStart = startTurn(db, { gameId: early.id, commandId: randomUUID() }, { timer, now: t0 })
    submitAnswer(
      db,
      {
        commandId: randomUUID(),
        gameId: early.id,
        turnId: earlyStart.snapshot.currentTurn!.id,
        currentQueueItemId: earlyStart.snapshot.currentQuestion!.queueItemId,
        verdict: 'CORRECT'
      },
      { timer, now: t0 + 500 }
    )

    const aborted = seed(db, ['甲', '乙', '丙'])
    startTurn(db, { gameId: aborted.id, commandId: randomUUID() }, { timer, now: t0 })
    pauseTurn(db, { gameId: aborted.id, commandId: randomUUID() }, { timer, now: t0 + 1000 })
    abortGame(db, { gameId: aborted.id, commandId: randomUUID(), reason: '现场中止' }, { timer, now: t0 + 1100 })

    const finished = seed(db, ['苹果', '香蕉', '橙子'])
    const first = startTurn(db, { gameId: finished.id, commandId: randomUUID() }, { timer, now: t0 })
    submitAnswer(
      db,
      {
        commandId: randomUUID(),
        gameId: finished.id,
        turnId: first.snapshot.currentTurn!.id,
        currentQueueItemId: first.snapshot.currentQuestion!.queueItemId,
        verdict: 'CORRECT'
      },
      { timer, now: t0 + 1000 }
    )
    const undone = undoLastAnswer(
      db,
      { gameId: finished.id, commandId: randomUUID() },
      { timer, now: t0 + 1500 }
    )
    expect(undone.applied).toBe(true)
    settleTimeout(db, finished.id, { timer, now: t0 + DURATION })
    advanceToNextTeam(db, { gameId: finished.id, commandId: randomUUID() }, { timer, now: t0 + DURATION })
    startTurn(db, { gameId: finished.id, commandId: randomUUID() }, { timer, now: t0 + DURATION + 10 })
    const done = settleTimeout(db, finished.id, { timer, now: t0 + DURATION + 10 + DURATION })
    expect(done.snapshot.status).toBe('GAME_FINISHED')
    expect(done.snapshot.showChampion).toBe(false)

    const scored = seed(db, ['梨', '桃', '李'])
    const lead = startTurn(db, { gameId: scored.id, commandId: randomUUID() }, { timer, now: t0 })
    submitAnswer(
      db,
      {
        commandId: randomUUID(),
        gameId: scored.id,
        turnId: lead.snapshot.currentTurn!.id,
        currentQueueItemId: lead.snapshot.currentQuestion!.queueItemId,
        verdict: 'CORRECT'
      },
      { timer, now: t0 + 800 }
    )
    settleTimeout(db, scored.id, { timer, now: t0 + DURATION })
    advanceToNextTeam(db, { gameId: scored.id, commandId: randomUUID() }, { timer, now: t0 + DURATION })
    startTurn(db, { gameId: scored.id, commandId: randomUUID() }, { timer, now: t0 + DURATION + 20 })
    settleTimeout(db, scored.id, { timer, now: t0 + DURATION + 20 + DURATION })

    const all = listHistory(db)
    expect(all.map((item) => item.status)).toEqual([
      'GAME_FINISHED',
      'GAME_FINISHED',
      'GAME_ABORTED',
      'GAME_FINISHED_EARLY'
    ])
    expect(listHistory(db, { status: 'GAME_ABORTED' })).toHaveLength(1)
    expect(listHistory(db, { status: 'GAME_FINISHED_EARLY' })[0]?.outcomeLabel).toBe('不授冠')
    expect(listHistory(db, { keyword: '梨' })[0]?.outcomeLabel).toBe('冠军 红队')
    expect(listHistory(db, { keyword: '苹果' })[0]?.outcomeLabel).toBe('并列')

    const earlyHistory = getHistory(db, early.id)
    expect(earlyHistory.showChampion).toBe(false)
    expect(earlyHistory.turns.map((turn) => turn.status)).toEqual(['TURN_EXHAUSTED', 'TURN_NOT_PLAYED'])
    expect(earlyHistory.questions.some((question) => question.verdict === 'CORRECT')).toBe(true)
    expect(earlyHistory.events.some((row) => row.action === 'CORRECT' && row.questionText === '唯一题')).toBe(
      true
    )

    const undoneHistory = getHistory(db, finished.id)
    expect(undoneHistory.questions.some((question) => question.state === 'VOIDED')).toBe(true)
    expect(undoneHistory.events.some((row) => row.action === 'VOIDED')).toBe(true)
    expect(undoneHistory.showChampion).toBe(false)
  })

  it('writes status, unplayed turns, and voided questions into the workbook', async () => {
    const db = openMemoryDatabase()
    const timer = new TimerEngine()
    const t0 = 3_000_000
    const game = seed(db, ['唯一题'])
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
      { timer, now: t0 + 400 }
    )

    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load((await buildResultsWorkbook(db, game.id)) as unknown as ExcelJS.Buffer)
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      '总览',
      '排行',
      '逐题',
      '修正',
      '题目使用',
      '挑战排程'
    ])
    const overview = workbook.getWorksheet('总览')
    const values = overview?.getSheetValues().flat().map((cell) => String(cell ?? ''))
    expect(values).toContain('GAME_FINISHED_EARLY')
    expect(values).toContain('否')
    const schedule = workbook.getWorksheet('挑战排程')
    const scheduleText = JSON.stringify(schedule?.getSheetValues())
    expect(scheduleText).toContain('TURN_NOT_PLAYED')
    expect(scheduleText).toContain('TURN_EXHAUSTED')
  })

  it('restores a backup without leaving a running clock', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'draw-guess-backup-'))
    const live = openDatabase(join(dir, 'live.db'))
    const timer = new TimerEngine()
    const t0 = 4_000_000
    const game = seed(live, ['苹果', '香蕉'])
    startTurn(live, { gameId: game.id, commandId: randomUUID() }, { timer, now: t0 })
    expect(timer.activeGameIds()).toEqual([game.id])

    const backupPath = join(dir, 'backup.db')
    await backupDatabaseFile(live, backupPath)
    live.prepare(`UPDATE games SET name = '被改掉的名字' WHERE id = ?`).run(game.id)

    const safetyPath = join(dir, 'safety.db')
    await restoreDatabaseFile(live, backupPath, safetyPath, timer)
    const restored = live.prepare('SELECT name, status FROM games WHERE id = ?').get(game.id) as {
      name: string
      status: string
    }
    expect(restored.name).toBe('团建 苹果')
    expect(restored.status).toBe('GAME_ACTIVE')
    const turn = live.prepare(`SELECT status FROM game_turns WHERE game_id = ? AND sequence_no = 1`).get(game.id) as {
      status: string
    }
    expect(turn.status).toBe('TURN_PAUSED')
    expect(timer.activeGameIds()).toEqual([])
    expect(getHistory(live, game.id).name).toBe('团建 苹果')
    live.close()
  })
})

describe('effect policy', () => {
  const base = {
    alreadySeen: false,
    showChampion: true,
    effectLevel: 'normal' as const,
    reducedMotion: false,
    muted: false
  }

  it('plays a correct cue only for a newly committed correct verdict', () => {
    const first = planCommittedEffects(event({ kind: 'ANSWER_ACCEPTED', verdict: 'CORRECT' }), base)
    expect(first.accept).toBe(true)
    expect(first.sounds).toEqual(['correct'])
    expect(first.confetti).toBe('correct')
    expect(first.championMark).toBe(false)

    const replay = planCommittedEffects(event({ kind: 'ANSWER_ACCEPTED', verdict: 'CORRECT' }), {
      ...base,
      alreadySeen: true
    })
    expect(replay).toEqual({ accept: false, sounds: [], confetti: 'none', championMark: false })

    const timeout = planCommittedEffects(event({ kind: 'TURN_ENDED', verdict: 'TIMEOUT' }), base)
    expect(timeout.confetti).toBe('none')
    expect(timeout.sounds).toEqual(['time-up'])
  })

  it('uses game-start only for the first team challenge', () => {
    const opening = planCommittedEffects(
      event({ kind: 'TURN_STARTED', turnSequenceNo: 1 }),
      base
    )
    expect(opening.sounds).toEqual(['game-start'])

    const nextTeam = planCommittedEffects(event({ kind: 'TURN_STARTED', turnSequenceNo: 2 }), base)
    expect(nextTeam.sounds).toEqual(['start'])
  })

  it('withholds the champion cue unless the match finished with a unique winner', () => {
    const early = planCommittedEffects(
      event({ kind: 'GAME_FINISHED_EARLY', verdict: 'CORRECT' }),
      { ...base, showChampion: false }
    )
    expect(early.sounds).toEqual(['correct', 'game-end'])
    expect(early.confetti).toBe('correct')
    expect(early.championMark).toBe(false)

    const aborted = planCommittedEffects(event({ kind: 'GAME_ABORTED' }), base)
    expect(aborted.confetti).toBe('none')
    expect(aborted.championMark).toBe(false)
    expect(aborted.sounds).not.toContain('champion')

    const tie = planCommittedEffects(event({ kind: 'GAME_FINISHED' }), { ...base, showChampion: false })
    expect(tie.championMark).toBe(false)
    expect(tie.confetti).toBe('none')
    expect(tie.sounds).toEqual(['game-end'])

    const champion = planCommittedEffects(event({ kind: 'GAME_FINISHED' }), base)
    expect(champion.championMark).toBe(true)
    expect(champion.confetti).toBe('champion')
    expect(champion.sounds).toEqual(['champion', 'game-end'])

    const quiet = planCommittedEffects(event({ kind: 'GAME_FINISHED' }), {
      ...base,
      muted: true,
      effectLevel: 'off'
    })
    expect(quiet.sounds).toEqual([])
    expect(quiet.championMark).toBe(false)
  })

  it('ticks each of the last ten seconds once and stays silent while paused', () => {
    expect(nextTickSecond(null, 10_000, true)).toBe(10)
    expect(nextTickSecond(10, 9_200, true)).toBe(null)
    expect(nextTickSecond(10, 9_200, false)).toBe(null)
    expect(nextTickSecond(10, 8_900, true)).toBe(9)
    expect(nextTickSecond(1, 0, true)).toBe(null)
  })
})
