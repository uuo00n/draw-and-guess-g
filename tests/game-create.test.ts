import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { openMemoryDatabase } from '../src/main/database/connection'
import { createGame, GameCreateError, loadGameSnapshot } from '../src/main/domain/game-create'
import { commitImportRows } from '../src/main/services/question-service'

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
    const bankId = randomUUID()
    db.prepare(
      `INSERT INTO question_banks (id, name, source_filename, imported_at, file_sha256, active)
       VALUES (?, 'empty', NULL, datetime('now'), 'x', 1)`
    ).run(bankId)
    expect(() =>
      createGame(db, {
        bankId,
        roundCount: 1,
        turnDurationSec: 60,
        scoreMode: 'UNIFORM',
        teams: [
          { name: 'A', color: '#ff0000', sortOrder: 0 },
          { name: 'B', color: '#00ff00', sortOrder: 1 }
        ]
      })
    ).toThrowError(GameCreateError)
  })

  it('freezes shuffled queue snapshots and turn schedule', () => {
    const db = openMemoryDatabase()
    const bankId = seedBank(db, ['苹果', '香蕉', '橙子', '葡萄', '西瓜'])
    const snapshot = createGame(db, {
      bankId,
      roundCount: 2,
      turnDurationSec: 60,
      scoreMode: 'UNIFORM',
      teams: [
        { name: '红队', color: '#ff555f', sortOrder: 0 },
        { name: '蓝队', color: '#4da3ff', sortOrder: 1 }
      ]
    })

    expect(snapshot.plannedTurnCount).toBe(4)
    expect(snapshot.queueSize).toBe(5)
    expect(snapshot.turns[0]?.status).toBe('TURN_READY')
    expect(snapshot.turns[1]?.status).toBe('TURN_PENDING')

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
