import { describe, expect, it } from 'vitest'
import { APP_DISPLAY_NAME } from '../src/shared/constants'
import {
  BUNDLED_QUESTION_BANK_NAME,
  isLegacyQuestionBankName,
  pickPreferredQuestionBankId
} from '../src/shared/question-bank-defaults'

describe('question bank defaults', () => {
  it('marks sample template names as legacy', () => {
    expect(isLegacyQuestionBankName('你画我猜-题库模板')).toBe(true)
    expect(isLegacyQuestionBankName(`${APP_DISPLAY_NAME}-题库模板`)).toBe(true)
    expect(isLegacyQuestionBankName(BUNDLED_QUESTION_BANK_NAME)).toBe(false)
  })

  it('prefers the official bank in lists', () => {
    const id = pickPreferredQuestionBankId([
      { id: 'a', name: '你画我猜-题库模板' },
      { id: 'b', name: BUNDLED_QUESTION_BANK_NAME }
    ])
    expect(id).toBe('b')
  })
})
