import { GAME_RULE_BULLETS } from '@shared/schemas/roster'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const DEFAULT_RULES = [...GAME_RULE_BULLETS]

/** 递增后会把本地已存规则重置为 DEFAULT_RULES */
const GAME_RULES_PERSIST_VERSION = 2

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
    {
      name: 'draw-and-guess-game-rules',
      version: GAME_RULES_PERSIST_VERSION,
      migrate: (persisted, version) => {
        if (version < GAME_RULES_PERSIST_VERSION) {
          return { rules: DEFAULT_RULES }
        }
        const state = persisted as Partial<GameRulesState> | undefined
        const rules = state?.rules
        if (!Array.isArray(rules) || rules.length === 0) {
          return { rules: DEFAULT_RULES }
        }
        return { rules }
      }
    }
  )
)
