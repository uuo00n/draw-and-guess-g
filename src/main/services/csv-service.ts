import Papa from 'papaparse'
import { DEFAULT_CATEGORY, DEFAULT_DIFFICULTY, DEFAULT_POINTS } from '../../shared/constants'
import { resolveImportColumnHeader, type ParsedImportRow } from './excel-service'

export function parseCsvText(text: string): ParsedImportRow[] {
  const parsed = Papa.parse<string[]>(text, {
    skipEmptyLines: true
  })
  if (parsed.errors.length > 0) {
    throw new Error(parsed.errors[0]?.message ?? 'CSV 解析失败')
  }
  const data = parsed.data
  if (data.length === 0) return []

  const header = data[0].map((h) => h.trim())
  const columnMap = new Map<number, keyof Omit<ParsedImportRow, 'rowNumber'>>()
  header.forEach((name, index) => {
    const mapped = resolveImportColumnHeader(name)
    if (mapped) columnMap.set(index, mapped)
  })
  if (![...columnMap.values()].includes('text')) {
    throw new Error('缺少必填列「题目」')
  }

  const rows: ParsedImportRow[] = []
  for (let i = 1; i < data.length; i += 1) {
    const line = data[i]
    const draft: ParsedImportRow = {
      rowNumber: i + 1,
      text: '',
      category: DEFAULT_CATEGORY,
      difficulty: DEFAULT_DIFFICULTY,
      points: DEFAULT_POINTS
    }
    let hasContent = false
    columnMap.forEach((field, colIndex) => {
      const raw = (line[colIndex] ?? '').trim()
      if (!raw) return
      hasContent = true
      if (field === 'text') draft.text = raw
      if (field === 'category') draft.category = raw
      if (field === 'difficulty') draft.difficulty = raw
      if (field === 'points') {
        const n = Number.parseInt(raw, 10)
        if (!Number.isNaN(n)) draft.points = n
      }
    })
    if (hasContent) rows.push(draft)
  }
  return rows
}

export function stripUtf8Bom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}
