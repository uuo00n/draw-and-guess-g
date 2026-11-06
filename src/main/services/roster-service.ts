import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_ROSTER } from '../../shared/data/default-roster'
import { TEAM_PALETTE } from '../../shared/constants'
import { normalizeMemberName } from '../../shared/normalize'
import {
  groupDisplayName,
  sortGroupsByMemberCountDesc,
  playOrderName,
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
  members: Array<{ name: string; sortOrder: number }>
}

export function resolveTeamsForGame(
  roster: TeamRoster,
  participatingGroupNumbers: number[]
): ResolvedTeam[] {
  const sorted = [...roster.groups].sort((a, b) => a.group - b.group)
  const rosterGroupNos = new Set(sorted.map((group) => group.group))
  const participating = participatingGroupNumbers
  const participatingSet = new Set(participating)
  for (const groupNo of participating) {
    if (!rosterGroupNos.has(groupNo)) {
      throw new RosterValidationError(`参赛组号无效：${groupDisplayName(groupNo)}`)
    }
  }
  if (participatingSet.size !== participating.length) {
    throw new RosterValidationError('参赛组号不能重复')
  }
  const filtered = sortGroupsByMemberCountDesc(
    sorted.filter((group) => participatingSet.has(group.group))
  )
  if (filtered.length === 0) {
    throw new RosterValidationError('至少选择一组参赛')
  }

  const paletteIndexByGroup = new Map(sorted.map((group, index) => [group.group, index]))
  const teams: ResolvedTeam[] = []
  filtered.forEach((group, index) => {
    const playOrder = index + 1
    const paletteIndex = paletteIndexByGroup.get(group.group) ?? index
    const members = group.members.map((name, sortOrder) => ({
      name: normalizeMemberName(name),
      sortOrder
    }))
    teams.push({
      groupNo: playOrder,
      name: playOrderName(playOrder),
      color: TEAM_PALETTE[paletteIndex % TEAM_PALETTE.length],
      sortOrder: index,
      members
    })
  })

  return teams
}
