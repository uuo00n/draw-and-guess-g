import { describe, expect, it } from 'vitest'
import { normalizeQuestionText } from '../src/shared/normalize'

describe('normalizeQuestionText', () => {
  it('applies NFKC trim collapse and lowercase', () => {
    expect(normalizeQuestionText('  Hello   World  ')).toBe('hello world')
    expect(normalizeQuestionText('画蛇添足')).toBe('画蛇添足')
  })
})
