import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { EffectLevel } from '@shared/effects'

type UiSettingsState = {
  muted: boolean
  effectLevel: EffectLevel
  fullscreen: boolean
  setMuted: (muted: boolean) => void
  setEffectLevel: (effectLevel: EffectLevel) => void
  setFullscreen: (fullscreen: boolean) => void
}

export const useUiSettings = create<UiSettingsState>()(
  persist(
    (set) => ({
      muted: false,
      effectLevel: 'normal',
      fullscreen: false,
      setMuted: (muted) => set({ muted }),
      setEffectLevel: (effectLevel) => set({ effectLevel }),
      setFullscreen: (fullscreen) => set({ fullscreen })
    }),
    { name: 'draw-and-guess-ui' }
  )
)
