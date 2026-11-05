import { describe, expect, it } from 'vitest'
import { clampTurnDurationSec } from '../src/shared/constants'
import { createGameInputSchema } from '../src/shared/schemas/games'

const bankId = '11111111-1111-4111-8111-111111111111'
const teams = [
  { name: 'A', color: '#ff0000', sortOrder: 0 },
  { name: 'B', color: '#00ff00', sortOrder: 1 }
]

describe('turn duration bounds', () => {
  it('accepts 30 seconds and rejects 29', () => {
    expect(
      createGameInputSchema.safeParse({ bankId, turnDurationSec: 30, teams }).success
    ).toBe(true)
    expect(
      createGameInputSchema.safeParse({ bankId, turnDurationSec: 29, teams }).success
    ).toBe(false)
  })

  it('commits an unfinished 3 as the 30 second minimum', () => {
    expect(clampTurnDurationSec(3)).toBe(30)
    expect(clampTurnDurationSec(30)).toBe(30)
    expect(clampTurnDurationSec(Number.NaN)).toBe(60)
  })
})
