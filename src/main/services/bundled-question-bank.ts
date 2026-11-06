import { readFileSync } from 'node:fs'
import type { AppDatabase } from '../database/connection'
import { BUNDLED_QUESTION_BANK_FILE } from '../../shared/constants'
import {
  BUNDLED_QUESTION_BANK_NAME,
  isLegacyQuestionBankName
} from '../../shared/question-bank-defaults'
import { parseXlsxBuffer } from './excel-service'
import { commitImportRows, purgeUnlinkedQuestions } from './question-service'
import { bundledQuestionBankExists, bundledQuestionBankPath } from './bundled-resources'

export function findOfficialQuestionBankId(db: AppDatabase): string | undefined {
  const row = db
    .prepare(
      `SELECT id FROM question_banks
       WHERE active = 1 AND (name = ? OR source_filename = ?)
       LIMIT 1`
    )
    .get(BUNDLED_QUESTION_BANK_NAME, BUNDLED_QUESTION_BANK_FILE) as { id: string } | undefined
  return row?.id
}

/** 删除或停用旧示例模板；已有比赛引用的题库只停用，避免破坏历史。 */
export function pruneLegacyQuestionBanks(db: AppDatabase): void {
  const legacy = db
    .prepare('SELECT id, name FROM question_banks WHERE active = 1')
    .all() as Array<{ id: string; name: string }>

  const deactivate = db.prepare('UPDATE question_banks SET active = 0 WHERE id = ?')
  const remove = db.prepare('DELETE FROM question_banks WHERE id = ?')
  const usedByGame = db.prepare('SELECT 1 FROM games WHERE bank_id = ? LIMIT 1')

  db.transaction(() => {
    for (const bank of legacy) {
      if (!isLegacyQuestionBankName(bank.name)) continue
      if (usedByGame.get(bank.id)) {
        deactivate.run(bank.id)
      } else {
        remove.run(bank.id)
      }
    }
  })()
}

export async function ensureBundledQuestionBank(db: AppDatabase): Promise<void> {
  pruneLegacyQuestionBanks(db)
  purgeUnlinkedQuestions(db)
  if (findOfficialQuestionBankId(db)) return

  if (!bundledQuestionBankExists()) {
    console.warn(`Bundled question bank missing: ${bundledQuestionBankPath()}`)
    return
  }

  const path = bundledQuestionBankPath()
  const buffer = readFileSync(path)
  const rows = await parseXlsxBuffer(buffer)
  const result = commitImportRows(db, BUNDLED_QUESTION_BANK_FILE, buffer, rows)
  if (!result.bankId) {
    throw new Error(
      `内置题库导入失败：有效题目 ${result.importedCount} 条，无效 ${result.skippedInvalidCount} 条`
    )
  }
}

export function readBundledQuestionBankBuffer(): Buffer {
  if (!bundledQuestionBankExists()) {
    throw new Error('内置题库文件不存在')
  }
  return readFileSync(bundledQuestionBankPath())
}
