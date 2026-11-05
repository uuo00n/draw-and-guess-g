import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_ROSTER } from '../../shared/data/default-roster'
import { TEAM_PALETTE } from '../../shared/constants'
import { normalizeMemberName } from '../../shared/normalize'
import {
  groupDisplayName,
  validateTeamRoster,
  type TeamRoster,
  RosterValidationError
} from '../../shared/schemas/roster'

export { RosterValidationError }

export function rosterFilePath(dataDir: string): string {
  return join(dataDir, 'team-roster.json')
}

export function loadCurrentRoster(dataDir: string): TeamRoster {
  const path = rosterFilePath(dataDir)
  if (!existsSync(path)) {
    return DEFAULT_ROSTER
  }
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown
    return validateTeamRoster(raw)
  } catch {
    return DEFAULT_ROSTER
  }
}

export function saveCurrentRoster(dataDir: string, roster: TeamRoster): void {
  const validated = validateTeamRoster(roster)
  writeFileSync(rosterFilePath(dataDir), `${JSON.stringify(validated, null, 2)}\n`, 'utf8')
}

export function replaceRosterFromJson(dataDir: string, raw: unknown): TeamRoster {
  const validated = validateTeamRoster(raw)
  saveCurrentRoster(dataDir, validated)
  return validated
}

export type ResolvedTeam = {
  groupNo: number
  name: string
  color: string
  sortOrder: number
  members: Array<{ name: string; sortOrder: number; isPerformer: boolean }>
}

export function resolveTeamsForGame(
  roster: TeamRoster,
  performerMembers: string[]
): ResolvedTeam[] {
  const performers = new Set(performerMembers.map((name) => normalizeMemberName(name)))
  const sorted = [...roster.groups].sort((a, b) => a.group - b.group)
  const teams: ResolvedTeam[] = []
  sorted.forEach((group, index) => {
    const members = group.members.map((name, sortOrder) => {
      const normalized = normalizeMemberName(name)
      return { name: normalized, sortOrder, isPerformer: performers.has(normalized) }
    })
    const performerCount = members.filter((member) => member.isPerformer).length
    if (performerCount > 1) {
      throw new RosterValidationError(
        `${groupDisplayName(group.group)} 只能标记一位表演题目`
      )
    }
    teams.push({
      groupNo: group.group,
      name: groupDisplayName(group.group),
      color: TEAM_PALETTE[index % TEAM_PALETTE.length],
      sortOrder: index,
      members
    })
  })

  const rosterNames = new Set(
    sorted.flatMap((group) => group.members.map((name) => normalizeMemberName(name)))
  )
  for (const marked of performers) {
    if (!rosterNames.has(marked)) {
      throw new RosterValidationError(`表演题目标记无效：${marked}`)
    }
  }

  return teams
}
