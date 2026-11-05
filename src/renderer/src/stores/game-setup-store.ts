import { DEFAULT_TURN_DURATION_SEC } from '@shared/constants'
import { clampTurnDurationSec } from '@shared/constants'
import { create } from 'zustand'

type GameSetupState = {
  bankId: string | null
  turnDurationSec: number
  categoryFilter: string[]
  /** 默认空；仅勾选的组号同批参赛 */
  participatingGroupNumbers: number[]
  setBankId: (bankId: string) => void
  setTurnDurationSec: (seconds: number) => void
  setCategoryFilterAll: (categories: string[]) => void
  toggleCategory: (category: string) => void
  setParticipatingGroupsAll: (groupNumbers: number[]) => void
  toggleParticipatingGroup: (groupNo: number) => void
}

export const useGameSetupStore = create<GameSetupState>((set, get) => ({
  bankId: null,
  turnDurationSec: DEFAULT_TURN_DURATION_SEC,
  categoryFilter: [],
  participatingGroupNumbers: [],
  setBankId: (bankId) =>
    set({ bankId, categoryFilter: [], participatingGroupNumbers: [] }),
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
  setParticipatingGroupsAll: (groupNumbers) =>
    set({ participatingGroupNumbers: [...groupNumbers].sort((a, b) => a - b) }),
  toggleParticipatingGroup: (groupNo) => {
    const current = get().participatingGroupNumbers
    if (current.includes(groupNo)) {
      set({
        participatingGroupNumbers: current.filter((no) => no !== groupNo)
      })
      return
    }
    set({
      participatingGroupNumbers: [...current, groupNo].sort((a, b) => a - b)
    })
  }
}))
