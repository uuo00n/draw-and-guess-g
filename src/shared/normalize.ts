/** Unicode NFKC, trim, collapse whitespace, lowercase (English case folding). */
export function normalizeQuestionText(text: string): string {
  return text.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase()
}
