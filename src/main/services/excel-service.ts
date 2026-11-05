import ExcelJS from 'exceljs'
import { DEFAULT_CATEGORY, DEFAULT_DIFFICULTY, DEFAULT_POINTS } from '../../shared/constants'

export type ParsedImportRow = {
  rowNumber: number
  text: string
  category: string
  difficulty: string
  points: number
}

const HEADER_ALIASES: Record<string, keyof Omit<ParsedImportRow, 'rowNumber'>> = {
  题目: 'text',
  分类: 'category',
  难度: 'difficulty',
  分值: 'points',
  question: 'text',
  category: 'category',
  difficulty: 'difficulty',
  points: 'points'
}

/** 模板表头为「题目（必填）」等带标注形式，导入时需与 spec §9.1 对齐。 */
export function resolveImportColumnHeader(
  header: string
): keyof Omit<ParsedImportRow, 'rowNumber'> | undefined {
  const trimmed = header.trim()
  const direct = HEADER_ALIASES[trimmed.toLowerCase()] ?? HEADER_ALIASES[trimmed]
  if (direct) return direct
  const withoutRequiredHint = trimmed.replace(/[（(]必填[）)]/g, '').trim()
  return (
    HEADER_ALIASES[withoutRequiredHint.toLowerCase()] ?? HEADER_ALIASES[withoutRequiredHint]
  )
}

const DIFFICULTY_ALIASES: Record<string, string> = {
  普通: '普通',
  简单: '简单',
  中等: '中等',
  困难: '困难',
  easy: '简单',
  medium: '中等',
  hard: '困难',
  normal: '普通'
}

function cellToString(value: ExcelJS.CellValue): string {
  if (value == null) return ''
  if (typeof value === 'object' && value !== null && 'richText' in value) {
    const rich = value as ExcelJS.CellRichTextValue
    return rich.richText.map((part) => part.text).join('')
  }
  if (typeof value === 'object' && value !== null && 'result' in value) {
    return String((value as ExcelJS.CellFormulaValue).result ?? '')
  }
  return String(value)
}

export async function parseXlsxBuffer(buffer: Buffer): Promise<ParsedImportRow[]> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer)
  const sheet = workbook.worksheets[0]
  if (!sheet) {
    return []
  }

  const headerRow = sheet.getRow(1)
  const columnMap = new Map<number, keyof Omit<ParsedImportRow, 'rowNumber'>>()
  headerRow.eachCell((cell, colNumber) => {
    const header = cellToString(cell.value).trim()
    const mapped = resolveImportColumnHeader(header)
    if (mapped) {
      columnMap.set(colNumber, mapped)
    }
  })

  if (![...columnMap.values()].includes('text')) {
    throw new Error('缺少必填列「题目」')
  }

  const rows: ParsedImportRow[] = []
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return
    const draft: ParsedImportRow = {
      rowNumber,
      text: '',
      category: DEFAULT_CATEGORY,
      difficulty: DEFAULT_DIFFICULTY,
      points: DEFAULT_POINTS
    }
    let hasContent = false
    columnMap.forEach((field, colNumber) => {
      const raw = cellToString(row.getCell(colNumber).value).trim()
      if (!raw) return
      hasContent = true
      if (field === 'text') draft.text = raw
      if (field === 'category') draft.category = raw
      if (field === 'difficulty') {
        draft.difficulty = DIFFICULTY_ALIASES[raw.toLowerCase()] ?? raw
      }
      if (field === 'points') {
        const n = Number.parseInt(raw, 10)
        if (!Number.isNaN(n)) draft.points = n
      }
    })
    if (hasContent) {
      rows.push(draft)
    }
  })
  return rows
}

export async function buildTemplateWorkbook(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('题库')
  sheet.addRow(['题目（必填）', '分类', '难度', '分值'])
  sheet.addRow(['长颈鹿', '动物', '简单', 1])
  sheet.addRow(['画蛇添足', '成语', '中等', 2])
  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer)
}

export async function exportBankWorkbook(
  bankName: string,
  rows: Array<{ text: string; category: string; difficulty: string; points: number; active: boolean }>
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('题库')
  sheet.addRow(['题目', '分类', '难度', '分值', '启用状态'])
  for (const row of rows) {
    const safeText = row.text.startsWith('=') ? `'${row.text}` : row.text
    sheet.addRow([safeText, row.category, row.difficulty, row.points, row.active ? '启用' : '禁用'])
  }
  const meta = workbook.addWorksheet('元数据')
  meta.addRow(['题库名称', bankName])
  meta.addRow(['导出时间', new Date().toISOString()])
  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer)
}
