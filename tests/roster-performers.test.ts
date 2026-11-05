import { describe, expect, it } from 'vitest'
import { DEFAULT_ROSTER } from '../src/shared/data/default-roster'
import {
  formatMissingPerformerMessage,
  groupsMissingPerformer
} from '../src/shared/roster-performers'

describe('groupsMissingPerformer', () => {
  it('lists groups without a marked performer', () => {
    const roster = DEFAULT_ROSTER
    const missing = groupsMissingPerformer(roster, [])
    expect(missing.length).toBe(roster.groupCount)
    expect(formatMissingPerformerMessage(roster, missing)).toMatch(/尚未勾选/)
  })

  it('returns empty when every group has one performer', () => {
    const roster = DEFAULT_ROSTER
    const performers = roster.groups.map((group) => group.members[0])
    expect(groupsMissingPerformer(roster, performers)).toEqual([])
  })
})
