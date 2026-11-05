/** Unicode NFKC, trim, collapse whitespace, lowercase (English case folding). */
export function normalizeQuestionText(text: string): string {
  return text.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase()
}

/** 成员姓名规范化：NFKC、trim、合并空白（不做英文小写）。 */
export function normalizeMemberName(text: string): string {
  return text.normalize('NFKC').trim().replace(/\s+/g, ' ')
}
