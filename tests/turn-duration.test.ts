import { describe, expect, it } from 'vitest'
import { clampTurnDurationSec } from '../src/shared/constants'
import { createGameInputSchema } from '../src/shared/schemas/games'
import { randomUUID } from 'node:crypto'

const bankId = '11111111-1111-4111-8111-111111111111'

describe('turn duration bounds', () => {
  it('accepts 30 seconds and rejects 29', () => {
    expect(
      createGameInputSchema.safeParse({
        commandId: randomUUID(),
        bankId,
        categoryFilter: ['测试'],
        turnDurationSec: 30
      }).success
    ).toBe(true)
    expect(
      createGameInputSchema.safeParse({
        commandId: randomUUID(),
        bankId,
        categoryFilter: ['测试'],
        turnDurationSec: 29
      }).success
    ).toBe(false)
  })

  it('commits an unfinished 3 as the 30 second minimum', () => {
    expect(clampTurnDurationSec(3)).toBe(30)
    expect(clampTurnDurationSec(30)).toBe(30)
    expect(clampTurnDurationSec(Number.NaN)).toBe(60)
  })
})
