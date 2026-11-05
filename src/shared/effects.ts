import type { GameUiEvent } from './schemas/play'

export const effectLevels = ['off', 'low', 'normal'] as const
export type EffectLevel = (typeof effectLevels)[number]

export type EffectCue =
  | 'correct'
  | 'skip'
  | 'start'
  | 'game-start'
  | 'game-end'
  | 'time-up'
  | 'champion'

export type EffectPlan = {
  accept: boolean
  sounds: EffectCue[]
  confetti: 'none' | 'correct' | 'champion'
  championMark: boolean
}

export function planCommittedEffects(
  event: GameUiEvent,
  options: {
    alreadySeen: boolean
    showChampion: boolean
    effectLevel: EffectLevel
    reducedMotion: boolean
    muted: boolean
  }
): EffectPlan {
  if (options.alreadySeen) {
    return { accept: false, sounds: [], confetti: 'none', championMark: false }
  }

  const motionOn = options.effectLevel !== 'off' && !options.reducedMotion
  const sounds: EffectCue[] = []
  let confetti: EffectPlan['confetti'] = 'none'
  let championMark = false

  const validCorrect =
    event.verdict === 'CORRECT' &&
    (event.kind === 'ANSWER_ACCEPTED' || event.kind === 'GAME_FINISHED_EARLY')
  if (validCorrect) {
    if (!options.muted) sounds.push('correct')
    if (motionOn) confetti = 'correct'
  } else if (event.kind === 'ANSWER_ACCEPTED' && event.verdict === 'SKIPPED') {
    if (!options.muted) sounds.push('skip')
  } else if (event.kind === 'TURN_STARTED') {
    if (!options.muted) {
      if (event.turnSequenceNo === 1) sounds.push('game-start')
      else sounds.push('start')
    }
  } else if (event.verdict === 'TIMEOUT' || event.kind === 'TURN_ENDED') {
    if (!options.muted) sounds.push('time-up')
  }

  const formalChampion = event.kind === 'GAME_FINISHED' && options.showChampion
  if (formalChampion) {
    if (!options.muted) sounds.push('champion')
    if (motionOn) {
      confetti = 'champion'
      championMark = true
    }
  }

  if (event.kind === 'GAME_FINISHED' || event.kind === 'GAME_FINISHED_EARLY') {
    if (!options.muted) sounds.push('game-end')
  }

  return { accept: true, sounds, confetti, championMark }
}

export function nextTickSecond(
  previous: number | null,
  remainingMs: number,
  running: boolean
): number | null {
  if (!running) return null
  const second = Math.ceil(remainingMs / 1000)
  if (second < 1 || second > 10) return null
  if (previous === second) return null
  return second
}
