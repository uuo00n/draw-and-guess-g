import { describe, expect, it } from 'vitest'
import {
  buildTemplateWorkbook,
  parseXlsxBuffer,
  resolveImportColumnHeader
} from '../src/main/services/excel-service'

describe('excel import template', () => {
  it('maps template header 题目（必填） to the text column', () => {
    expect(resolveImportColumnHeader('题目（必填）')).toBe('text')
    expect(resolveImportColumnHeader('题目(必填)')).toBe('text')
  })

  it('parses downloaded template without changing the header row', async () => {
    const buffer = await buildTemplateWorkbook()
    const rows = await parseXlsxBuffer(buffer)
    expect(rows.length).toBe(2)
    expect(rows.map((row) => row.text)).toEqual(['长颈鹿', '画蛇添足'])
  })
})
