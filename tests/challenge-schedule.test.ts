import { describe, expect, it } from 'vitest'
import { buildChallengeSchedule } from '../src/main/domain/challenge-schedule'

describe('buildChallengeSchedule', () => {
  it('orders teams by sortOrder each round', () => {
    const schedule = buildChallengeSchedule(
      [
        { teamId: 'b', sortOrder: 1 },
        { teamId: 'a', sortOrder: 0 }
      ],
      2
    )
    expect(schedule).toEqual([
      { teamId: 'a', roundNo: 1, sequenceNo: 1 },
      { teamId: 'b', roundNo: 1, sequenceNo: 2 },
      { teamId: 'a', roundNo: 2, sequenceNo: 3 },
      { teamId: 'b', roundNo: 2, sequenceNo: 4 }
    ])
  })
})
