import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { openMemoryDatabase } from '../src/main/database/connection'
import {
  ensureBundledQuestionBank,
  findOfficialQuestionBankId,
  pruneLegacyQuestionBanks
} from '../src/main/services/bundled-question-bank'
import { BUNDLED_QUESTION_BANK_FILE } from '../src/shared/constants'
import { BUNDLED_QUESTION_BANK_NAME } from '../src/shared/question-bank-defaults'
import { parseXlsxBuffer } from '../src/main/services/excel-service'
import { commitImportRows, purgeUnlinkedQuestions } from '../src/main/services/question-service'

const bundledPath = join(process.cwd(), 'resources/data', BUNDLED_QUESTION_BANK_FILE)

describe('bundled question bank', () => {
  it('imports the official workbook from disk', async () => {
    const buffer = readFileSync(bundledPath)
    const rows = await parseXlsxBuffer(buffer)
    expect(rows.length).toBeGreaterThan(200)

    const db = openMemoryDatabase()
    const result = commitImportRows(db, BUNDLED_QUESTION_BANK_FILE, buffer, rows)
    expect(result.bankId).toBeTruthy()
    expect(result.importedCount).toBeGreaterThan(200)
    expect(result.skippedInvalidCount).toBe(0)
  })

  it('removes legacy template banks that are not referenced by games', () => {
    const db = openMemoryDatabase()
    db.prepare(`
      INSERT INTO question_banks (id, name, source_filename, imported_at, file_sha256, active)
      VALUES ('legacy', '你画我猜-题库模板', '你画我猜-题库模板.xlsx', '2020-01-01T00:00:00.000Z', 'legacy', 1)
    `).run()
    db.prepare(`
      INSERT INTO questions (id, text, normalized_text, category, difficulty, points, active)
      VALUES ('q1', '长颈鹿', '长颈鹿', '动物', '简单', 1, 1)
    `).run()
    db.prepare(`INSERT INTO bank_questions (bank_id, question_id) VALUES ('legacy', 'q1')`).run()
    db.prepare(`
      INSERT INTO question_banks (id, name, source_filename, imported_at, file_sha256, active)
      VALUES ('official', ?, ?, '2021-01-01T00:00:00.000Z', 'official', 1)
    `).run(BUNDLED_QUESTION_BANK_NAME, BUNDLED_QUESTION_BANK_FILE)

    pruneLegacyQuestionBanks(db)
    purgeUnlinkedQuestions(db)

    expect(
      db.prepare('SELECT name FROM question_banks WHERE id = ?').pluck().get('legacy')
    ).toBeUndefined()
    expect(db.prepare('SELECT COUNT(*) AS c FROM questions').get() as { c: number }).toMatchObject({
      c: 0
    })
    expect(findOfficialQuestionBankId(db)).toBe('official')
  })

  it('deactivates legacy banks referenced by finished games', () => {
    const db = openMemoryDatabase()
    db.prepare(`
      INSERT INTO question_banks (id, name, source_filename, imported_at, file_sha256, active)
      VALUES ('legacy', '你画我猜-题库模板', '你画我猜-题库模板.xlsx', '2020-01-01T00:00:00.000Z', 'legacy', 1)
    `).run()
    db.prepare(`
      INSERT INTO games (
        id, name, status, round_count, turn_duration_ms, score_mode, bank_id,
        planned_turn_count, created_at
      ) VALUES ('g1', 'test', 'GAME_FINISHED', 1, 60000, 'CORRECT_ONLY', 'legacy', 1, '2020-01-01T00:00:00.000Z')
    `).run()

    pruneLegacyQuestionBanks(db)

    const row = db
      .prepare('SELECT active FROM question_banks WHERE id = ?')
      .get('legacy') as { active: number }
    expect(row.active).toBe(0)
    expect(
      db.prepare('SELECT COUNT(*) AS c FROM question_banks WHERE active = 1').get() as { c: number }
    ).toMatchObject({ c: 0 })
  })

  it('ensureBundledQuestionBank keeps unrelated active banks', async () => {
    const db = openMemoryDatabase()
    db.prepare(`
      INSERT INTO question_banks (id, name, source_filename, imported_at, file_sha256, active)
      VALUES ('custom', '团建专用题库', 'custom.xlsx', '2020-01-01T00:00:00.000Z', 'sha', 1)
    `).run()
    await ensureBundledQuestionBank(db)
    const names = db
      .prepare('SELECT name FROM question_banks WHERE active = 1 ORDER BY name')
      .pluck()
      .all() as string[]
    expect(names).toContain('团建专用题库')
    expect(names).toContain(BUNDLED_QUESTION_BANK_NAME)
  })
})
