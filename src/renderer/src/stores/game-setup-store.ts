import { create } from 'zustand'
import {
  DEFAULT_ROUND_COUNT,
  DEFAULT_TEAM_COUNT,
  DEFAULT_TURN_DURATION_SEC,
  TEAM_COUNT_MAX,
  TEAM_COUNT_MIN,
  TEAM_PALETTE
} from '@shared/constants'

export type TeamDraft = {
  name: string
  color: string
  sortOrder: number
}

type GameSetupDraft = {
  teamCount: number
  roundCount: number
  turnDurationSec: number
  bankId?: string
  categoryFilter: string[]
  teams: TeamDraft[]
  setTeamCount: (count: number) => void
  updateTeam: (index: number, patch: Partial<TeamDraft>) => void
  moveTeam: (index: number, direction: -1 | 1) => void
  setRoundCount: (rounds: number) => void
  setTurnDurationSec: (seconds: number) => void
  setBankId: (bankId: string | undefined) => void
  toggleCategory: (category: string) => void
}

function buildTeams(count: number, existing: TeamDraft[]): TeamDraft[] {
  const next: TeamDraft[] = []
  for (let i = 0; i < count; i += 1) {
    next.push(
      existing[i] ?? {
        name: `第 ${i + 1} 队`,
        color: TEAM_PALETTE[i % TEAM_PALETTE.length],
        sortOrder: i
      }
    )
  }
  return next.map((team, index) => ({ ...team, sortOrder: index }))
}

export const useGameSetupStore = create<GameSetupDraft>((set, get) => ({
  teamCount: DEFAULT_TEAM_COUNT,
  roundCount: DEFAULT_ROUND_COUNT,
  turnDurationSec: DEFAULT_TURN_DURATION_SEC,
  bankId: undefined,
  categoryFilter: [],
  teams: buildTeams(DEFAULT_TEAM_COUNT, []),
  setTeamCount: (count) => {
    const clamped = Math.min(TEAM_COUNT_MAX, Math.max(TEAM_COUNT_MIN, count))
    set({ teamCount: clamped, teams: buildTeams(clamped, get().teams) })
  },
  updateTeam: (index, patch) => {
    set({
      teams: get().teams.map((team, i) => (i === index ? { ...team, ...patch } : team))
    })
  },
  moveTeam: (index, direction) => {
    const teams = [...get().teams]
    const target = index + direction
    if (target < 0 || target >= teams.length) return
    ;[teams[index], teams[target]] = [teams[target], teams[index]]
    set({ teams: teams.map((team, i) => ({ ...team, sortOrder: i })) })
  },
  setRoundCount: (roundCount) => set({ roundCount }),
  setTurnDurationSec: (turnDurationSec) => set({ turnDurationSec }),
  setBankId: (bankId) => set({ bankId, categoryFilter: [] }),
  toggleCategory: (category) => {
    const current = get().categoryFilter
    set({
      categoryFilter: current.includes(category)
        ? current.filter((c) => c !== category)
        : [...current, category]
    })
  }
}))
