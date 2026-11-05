import { normalizeMemberName } from './normalize'
import type { TeamRoster } from './schemas/roster'
import { groupDisplayName } from './schemas/roster'

export function groupsMissingPerformer(
  roster: TeamRoster,
  performerMembers: string[]
): number[] {
  const performers = new Set(performerMembers.map((name) => normalizeMemberName(name)))
  return [...roster.groups]
    .sort((a, b) => a.group - b.group)
    .filter(
      (group) => !group.members.some((member) => performers.has(normalizeMemberName(member)))
    )
    .map((group) => group.group)
}

export function formatMissingPerformerMessage(_roster: TeamRoster, groupNumbers: number[]): string {
  if (groupNumbers.length === 0) return ''
  const labels = groupNumbers.map((groupNo) => groupDisplayName(groupNo)).join('、')
  return `请为每组勾选一位表演题目人员后再开始。尚未勾选：${labels}`
}
