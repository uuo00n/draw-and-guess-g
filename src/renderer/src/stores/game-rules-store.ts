import { GAME_RULE_BULLETS } from '@shared/schemas/roster'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const DEFAULT_RULES = [...GAME_RULE_BULLETS]

type GameRulesState = {
  rules: string[]
  setRules: (rules: string[]) => void
  resetRules: () => void
}

export const useGameRulesStore = create<GameRulesState>()(
  persist(
    (set) => ({
      rules: DEFAULT_RULES,
      setRules: (rules) => {
        const trimmed = rules.map((line) => line.trim()).filter(Boolean)
        set({ rules: trimmed.length > 0 ? trimmed : DEFAULT_RULES })
      },
      resetRules: () => set({ rules: DEFAULT_RULES })
    }),
    { name: 'draw-and-guess-game-rules' }
  )
)
