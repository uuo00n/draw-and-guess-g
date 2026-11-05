import { UNUSED_BANK_QUESTION } from '../domain/question-availability'
import { createHash, randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import { IMPORT_MAX_ROWS } from '../../shared/constants'
import { normalizeQuestionText } from '../../shared/normalize'
import type { ImportResult, QuestionPage, QuestionQuery } from '../../shared/schemas/questions'
import type { ParsedImportRow } from '../services/excel-service'
import { parseCsvText, stripUtf8Bom } from '../services/csv-service'
import { parseXlsxBuffer } from '../services/excel-service'

export type ImportFilePayload = {
  fileName: string
  buffer: Buffer
}

function validateRow(row: ParsedImportRow): string | null {
  const text = row.text.trim()
  if (!text) return '题目不能为空'
  if (text.length > 80) return '题目长度不能超过 80 字'
  if (!Number.isInteger(row.points) || row.points < 1 || row.points > 10) {
    return '分值必须是 1–10 的整数'
  }
  return null
}

export async function parseImportFile(payload: ImportFilePayload): Promise<ParsedImportRow[]> {
  const lower = payload.fileName.toLowerCase()
  if (lower.endsWith('.csv')) {
    const text = stripUtf8Bom(payload.buffer.toString('utf8'))
    return parseCsvText(text)
  }
  if (lower.endsWith('.xlsx')) {
    return parseXlsxBuffer(payload.buffer)
  }
  throw new Error('仅支持 .xlsx 或 .csv 文件')
}

export function commitImportRows(
  db: Database.Database,
  fileName: string,
  buffer: Buffer,
  rows: ParsedImportRow[]
): ImportResult {
  const sha256 = createHash('sha256').update(buffer).digest('hex')
  const now = new Date().toISOString()
  const bankName = fileName.replace(/\.(xlsx|csv)$/i, '') || '导入题库'

  const errors: ImportResult['errors'] = []
  let skippedInvalid = 0
  let skippedDuplicate = 0

  const validRows: ParsedImportRow[] = []
  const seenNormalized = new Set<string>()

  if (rows.length > IMPORT_MAX_ROWS) {
    throw new Error(`有效行数超过 ${IMPORT_MAX_ROWS} 条上限`)
  }

  for (const row of rows) {
    const err = validateRow(row)
    if (err) {
      skippedInvalid += 1
      errors.push({ rowNumber: row.rowNumber, message: err })
      continue
    }
    const normalized = normalizeQuestionText(row.text)
    if (seenNormalized.has(normalized)) {
      skippedDuplicate += 1
      errors.push({ rowNumber: row.rowNumber, message: '文件内重复题目' })
      continue
    }
    seenNormalized.add(normalized)
    validRows.push({ ...row, text: row.text.trim() })
  }

  if (validRows.length === 0) {
    return {
      fileName,
      totalRows: rows.length,
      importedCount: 0,
      skippedDuplicateCount: skippedDuplicate,
      skippedInvalidCount: skippedInvalid,
      errors
    }
  }

  const bankId = randomUUID()
  const insertBank = db.prepare(`
    INSERT INTO question_banks (id, name, source_filename, imported_at, file_sha256, active)
    VALUES (@id, @name, @source, @importedAt, @sha, 1)
  `)
  const findQuestion = db.prepare('SELECT id FROM questions WHERE normalized_text = ?')
  const insertQuestion = db.prepare(`
    INSERT INTO questions (id, text, normalized_text, category, difficulty, points, active)
    VALUES (@id, @text, @normalized, @category, @difficulty, @points, 1)
  `)
  const linkBank = db.prepare(`
    INSERT OR IGNORE INTO bank_questions (bank_id, question_id) VALUES (@bankId, @questionId)
  `)

  let importedCount = 0

  try {
    db.transaction(() => {
      insertBank.run({
        id: bankId,
        name: bankName,
        source: fileName,
        importedAt: now,
        sha: sha256
      })

      for (const row of validRows) {
        const normalized = normalizeQuestionText(row.text)
        const existing = findQuestion.get(normalized) as { id: string } | undefined
        let questionId = existing?.id
        if (!questionId) {
          questionId = randomUUID()
          insertQuestion.run({
            id: questionId,
            text: row.text,
            normalized: normalized,
            category: row.category || '未分类',
            difficulty: row.difficulty || '普通',
            points: row.points
          })
          importedCount += 1
        } else {
          skippedDuplicate += 1
          errors.push({ rowNumber: row.rowNumber, message: '题库中已存在相同题目' })
        }
        linkBank.run({ bankId, questionId })
      }
    })()
  } catch (error) {
    throw new Error(`导入失败，已回滚：${(error as Error).message}`)
  }

  return {
    bankId,
    fileName,
    totalRows: rows.length,
    importedCount,
    skippedDuplicateCount: skippedDuplicate,
    skippedInvalidCount: skippedInvalid,
    errors
  }
}

export function listBanks(db: Database.Database) {
  return db
    .prepare(
      `SELECT b.id, b.name, b.source_filename AS sourceFilename, b.imported_at AS importedAt,
              COUNT(bq.question_id) AS questionCount,
              SUM(CASE WHEN q.active = 1 THEN 1 ELSE 0 END) AS activeQuestionCount
       FROM question_banks b
       LEFT JOIN bank_questions bq ON bq.bank_id = b.id
       LEFT JOIN questions q ON q.id = bq.question_id
       WHERE b.active = 1
       GROUP BY b.id
       ORDER BY b.imported_at DESC`
    )
    .all()
    .map((row) => ({
      id: String((row as { id: string }).id),
      name: String((row as { name: string }).name),
      sourceFilename: (row as { sourceFilename: string | null }).sourceFilename,
      importedAt: (row as { importedAt: string | null }).importedAt,
      questionCount: Number((row as { questionCount: number }).questionCount ?? 0),
      activeQuestionCount: Number((row as { activeQuestionCount: number }).activeQuestionCount ?? 0)
    }))
}

export function listQuestions(db: Database.Database, query: QuestionQuery): QuestionPage {
  const page = query.page ?? 1
  const pageSize = query.pageSize ?? 50
  const offset = (page - 1) * pageSize

  const where: string[] = ['1=1']
  const params: Record<string, unknown> = {}

  if (query.bankId) {
    where.push('bq.bank_id = @bankId')
    params.bankId = query.bankId
  }
  if (query.category) {
    where.push('q.category = @category')
    params.category = query.category
  }
  if (query.search) {
    where.push('q.text LIKE @search')
    params.search = `%${query.search}%`
  }
  if (query.activeOnly !== false) {
    where.push('q.active = 1')
  }

  if (query.unusedOnly) where.push(UNUSED_BANK_QUESTION)

  const whereSql = where.join(' AND ')
  const total = (
    db
      .prepare(
        `SELECT COUNT(DISTINCT q.id) AS c
         FROM questions q
         LEFT JOIN bank_questions bq ON bq.question_id = q.id
         WHERE ${whereSql}`
      )
      .get(params) as { c: number }
  ).c

  const items = db
    .prepare(
      `SELECT q.id, q.text, q.category, q.difficulty, q.points, q.active,
              GROUP_CONCAT(bq.bank_id) AS bankIds
       FROM questions q
       LEFT JOIN bank_questions bq ON bq.question_id = q.id
       WHERE ${whereSql}
       GROUP BY q.id
       ORDER BY q.text
       LIMIT @limit OFFSET @offset`
    )
    .all({ ...params, limit: pageSize, offset })
    .map((row) => {
      const r = row as {
        id: string
        text: string
        category: string
        difficulty: string
        points: number
        active: number
        bankIds: string | null
      }
      return {
        id: r.id,
        text: r.text,
        category: r.category,
        difficulty: r.difficulty,
        points: r.points,
        active: r.active === 1,
        bankIds: r.bankIds ? r.bankIds.split(',') : []
      }
    })

  const categories = db
    .prepare(
      `SELECT DISTINCT q.category FROM questions q
       LEFT JOIN bank_questions bq ON bq.question_id = q.id
       WHERE ${query.bankId ? 'bq.bank_id = @bankId AND' : ''} q.active = 1
       ORDER BY q.category`
    )
    .all(query.bankId ? { bankId: query.bankId } : {})
    .map((r) => String((r as { category: string }).category))

  return { items, total, page, pageSize, categories }
}

export function countActiveQuestions(db: Database.Database): number {
  return (
    db.prepare('SELECT COUNT(*) AS c FROM questions WHERE active = 1').get() as { c: number }
  ).c
}

export function getBankExportRows(
  db: Database.Database,
  bankId: string
): Array<{ text: string; category: string; difficulty: string; points: number; active: boolean }> {
  return db
    .prepare(
      `SELECT q.text, q.category, q.difficulty, q.points, q.active
       FROM questions q
       INNER JOIN bank_questions bq ON bq.question_id = q.id
       WHERE bq.bank_id = ?
       ORDER BY q.text`
    )
    .all(bankId)
    .map((row) => {
      const r = row as {
        text: string
        category: string
        difficulty: string
        points: number
        active: number
      }
      return {
        text: r.text,
        category: r.category,
        difficulty: r.difficulty,
        points: r.points,
        active: r.active === 1
      }
    })
}

export function getBankName(db: Database.Database, bankId: string): string {
  const row = db.prepare('SELECT name FROM question_banks WHERE id = ?').get(bankId) as
    | { name: string }
    | undefined
  return row?.name ?? '题库'
}
