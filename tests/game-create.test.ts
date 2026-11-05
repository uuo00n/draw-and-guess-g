import { describe, expect, it } from 'vitest'
import { openMemoryDatabase } from '../src/main/database/connection'
import { createGame, GameCreateError, loadGameSnapshot } from '../src/main/domain/game-create'
import { commitImportRows } from '../src/main/services/question-service'
import { makeTestDataDir, testCreateInput } from './test-roster'
import { randomUUID } from 'node:crypto'

function seedBank(db: ReturnType<typeof openMemoryDatabase>, texts: string[]): string {
  const rows = texts.map((text, index) => ({
    rowNumber: index + 2,
    text,
    category: '测试',
    difficulty: '普通',
    points: 1
  }))
  const result = commitImportRows(db, 'seed.xlsx', Buffer.from('seed'), rows)
  if (!result.bankId) throw new Error('seed failed')
  return result.bankId
}

describe('createGame', () => {
  it('refuses when no questions available', () => {
    const db = openMemoryDatabase()
    const dataDir = makeTestDataDir(2)
    const bankId = randomUUID()
    db.prepare(
      `INSERT INTO question_banks (id, name, source_filename, imported_at, file_sha256, active)
       VALUES (?, 'empty', NULL, datetime('now'), 'x', 1)`
    ).run(bankId)
    expect(() =>
      createGame(db, testCreateInput(bankId), { dataDir })
    ).toThrowError(GameCreateError)
  })

  it('freezes shuffled queue snapshots and turn schedule', () => {
    const db = openMemoryDatabase()
    const dataDir = makeTestDataDir(2)
    const bankId = seedBank(db, ['苹果', '香蕉', '橙子', '葡萄', '西瓜'])
    const snapshot = createGame(db, testCreateInput(bankId), { dataDir })

    expect(snapshot.plannedTurnCount).toBe(2)
    expect(snapshot.queueSize).toBe(5)
    expect(snapshot.turns[0]?.status).toBe('TURN_READY')
    expect(snapshot.turns[1]?.status).toBe('TURN_PENDING')
    expect(snapshot.teams[0]?.members).toHaveLength(1)

    const queue = db
      .prepare(
        `SELECT question_text_snapshot, queue_position FROM game_question_queue
         WHERE game_id = ? ORDER BY queue_position`
      )
      .all(snapshot.id) as Array<{ question_text_snapshot: string; queue_position: number }>
    expect(queue).toHaveLength(5)
    expect(new Set(queue.map((q) => q.question_text_snapshot)).size).toBe(5)

    const before = queue.map((q) => q.question_text_snapshot)
    loadGameSnapshot(db, snapshot.id)
    const after = (
      db
        .prepare(
          `SELECT question_text_snapshot FROM game_question_queue WHERE game_id = ? ORDER BY queue_position`
        )
        .all(snapshot.id) as Array<{ question_text_snapshot: string }>
    ).map((q) => q.question_text_snapshot)
    expect(after).toEqual(before)
  })

  it('only includes selected groups in schedule', () => {
    const db = openMemoryDatabase()
    const dataDir = makeTestDataDir(4)
    const bankId = seedBank(db, ['苹果', '香蕉', '橙子'])
    const snapshot = createGame(
      db,
      testCreateInput(
        bankId,
        {
          roundCount: 1,
          participatingGroupNumbers: [1, 3]
        },
        4
      ),
      { dataDir }
    )
    expect(snapshot.teams).toHaveLength(2)
    expect(snapshot.plannedTurnCount).toBe(2)
    expect(snapshot.teams.map((team) => team.name)).toEqual(['第 1 组', '第 3 组'])
  })

  it('freezes a 30 second challenge', () => {
    const db = openMemoryDatabase()
    const dataDir = makeTestDataDir(2)
    const bankId = seedBank(db, ['苹果'])
    const snapshot = createGame(
      db,
      testCreateInput(bankId, { turnDurationSec: 30 }),
      { dataDir }
    )
    expect(snapshot.turnDurationMs).toBe(30_000)
  })
})

describe('commitImportRows', () => {
  it('does not write bank when every row is invalid', () => {
    const db = openMemoryDatabase()
    const result = commitImportRows(db, 'empty.xlsx', Buffer.from('empty'), [
      { rowNumber: 2, text: '   ', category: '测试', difficulty: '普通', points: 1 },
      { rowNumber: 3, text: 'bad', category: '测试', difficulty: '普通', points: 99 }
    ])
    expect(result.importedCount).toBe(0)
    expect(result.bankId).toBeUndefined()
    const banks = db.prepare('SELECT COUNT(*) AS c FROM question_banks').get() as { c: number }
    expect(banks.c).toBe(0)
  })

  it('deduplicates normalized text globally', () => {
    const db = openMemoryDatabase()
    const first = commitImportRows(db, 'a.xlsx', Buffer.from('a'), [
      { rowNumber: 2, text: 'Hello', category: '测试', difficulty: '普通', points: 1 }
    ])
    const second = commitImportRows(db, 'b.xlsx', Buffer.from('b'), [
      { rowNumber: 2, text: '  hello  ', category: '测试', difficulty: '普通', points: 1 }
    ])
    expect(first.importedCount).toBe(1)
    expect(second.importedCount).toBe(0)
    expect(second.skippedDuplicateCount).toBeGreaterThan(0)
    const count = db.prepare('SELECT COUNT(*) AS c FROM questions').get() as { c: number }
    expect(count.c).toBe(1)
  })
})
