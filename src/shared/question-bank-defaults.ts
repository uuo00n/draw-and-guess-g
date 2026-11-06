import { APP_DISPLAY_NAME, BUNDLED_QUESTION_BANK_FILE } from './constants'

export const BUNDLED_QUESTION_BANK_NAME = BUNDLED_QUESTION_BANK_FILE.replace(/\.(xlsx|csv)$/i, '')

/** 内置示例模板（长颈鹿 / 画蛇添足），正式包只保留正式版题库。 */
export function isLegacyQuestionBankName(name: string): boolean {
  if (name === BUNDLED_QUESTION_BANK_NAME) return false
  if (name === '你画我猜-题库模板') return true
  if (name === `${APP_DISPLAY_NAME}-题库模板`) return true
  return false
}

export function pickPreferredQuestionBankId<T extends { id: string; name: string }>(
  banks: T[]
): string | undefined {
  const official = banks.find((bank) => bank.name === BUNDLED_QUESTION_BANK_NAME)
  return official?.id ?? banks[0]?.id
}
