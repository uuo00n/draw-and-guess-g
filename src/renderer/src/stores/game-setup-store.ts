import {
  DEFAULT_ROUND_COUNT,
  DEFAULT_TURN_DURATION_SEC,
  ROUND_COUNT_MAX,
  ROUND_COUNT_MIN
} from '@shared/constants'
import { clampTurnDurationSec } from '@shared/constants'
import { normalizeMemberName } from '@shared/normalize'
import { create } from 'zustand'

type GameSetupState = {
  bankId: string | null
  roundCount: number
  turnDurationSec: number
  categoryFilter: string[]
  performerMembers: string[]
  setBankId: (bankId: string) => void
  setRoundCount: (count: number) => void
  setTurnDurationSec: (seconds: number) => void
  setCategoryFilterAll: (categories: string[]) => void
  toggleCategory: (category: string) => void
  togglePerformer: (memberName: string, groupMemberNames: string[]) => void
  resetPerformers: () => void
}

export const useGameSetupStore = create<GameSetupState>((set, get) => ({
  bankId: null,
  roundCount: DEFAULT_ROUND_COUNT,
  turnDurationSec: DEFAULT_TURN_DURATION_SEC,
  categoryFilter: [],
  performerMembers: [],
  setBankId: (bankId) => set({ bankId, categoryFilter: [], performerMembers: [] }),
  setRoundCount: (count) =>
    set({
      roundCount: Math.min(ROUND_COUNT_MAX, Math.max(ROUND_COUNT_MIN, count))
    }),
  setTurnDurationSec: (seconds) => set({ turnDurationSec: clampTurnDurationSec(seconds) }),
  setCategoryFilterAll: (categories) => set({ categoryFilter: [...categories] }),
  toggleCategory: (category) => {
    const current = get().categoryFilter
    set({
      categoryFilter: current.includes(category)
        ? current.filter((item) => item !== category)
        : [...current, category]
    })
  },
  togglePerformer: (memberName, groupMemberNames) => {
    const normalized = normalizeMemberName(memberName)
    const groupSet = new Set(groupMemberNames.map((name) => normalizeMemberName(name)))
    const current = get().performerMembers.map((name) => normalizeMemberName(name))
    if (current.includes(normalized)) {
      set({
        performerMembers: current.filter((name) => name !== normalized)
      })
      return
    }
    set({
      performerMembers: [
        ...current.filter((name) => !groupSet.has(name)),
        normalized
      ]
    })
  },
  resetPerformers: () => set({ performerMembers: [] })
}))
