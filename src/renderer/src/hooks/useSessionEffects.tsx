import { Component, useEffect, useEffectEvent, useRef, useState, type ReactNode } from 'react'
import confetti from 'canvas-confetti'
import { Lottie } from 'lottie-react'
import useSound from 'use-sound'
import type { GameUiEvent, PlaySnapshot } from '@shared/schemas/play'
import { nextTickSecond, planCommittedEffects, type EffectCue } from '@shared/effects'
import championMark from '@renderer/assets/champion-mark.json'
import correctUrl from '@renderer/assets/sounds/correct.wav'
import skipUrl from '@renderer/assets/sounds/skip.wav'
import startUrl from '@renderer/assets/sounds/start.wav'
import gameStartUrl from '@renderer/assets/sounds/game-start.wav'
import gameEndUrl from '@renderer/assets/sounds/game-end.wav'
import tickUrl from '@renderer/assets/sounds/tick.wav'
import timeUpUrl from '@renderer/assets/sounds/time-up.wav'
import championUrl from '@renderer/assets/sounds/champion.wav'
import { useUiSettings } from '@renderer/stores/ui-settings-store'

const seenEventIds = new Set<string>()

function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function burst(kind: 'correct' | 'champion'): void {
  confetti({
    particleCount: kind === 'champion' ? 70 : 36,
    spread: kind === 'champion' ? 70 : 46,
    startVelocity: kind === 'champion' ? 32 : 22,
    scalar: 0.8,
    ticks: 90,
    disableForReducedMotion: true,
    origin: { y: 0.35 },
    colors: ['#FFAD28', '#FF555F', '#FFFFFF', '#FFF2DF']
  })
}

export function useSessionEffects(
  gameId: string,
  snapshot: PlaySnapshot | null,
  displayRemainingMs: number
): { championMark: boolean } {
  const muted = useUiSettings((state) => state.muted)
  const effectLevel = useUiSettings((state) => state.effectLevel)
  const [showMark, setShowMark] = useState(false)
  const [championSerial, setChampionSerial] = useState(0)
  const pendingChampion = useRef<GameUiEvent | null>(null)
  const gameEndTimer = useRef<number | undefined>(undefined)
  const lastTick = useRef<number | null>(null)
  const turnId = snapshot?.currentTurn?.id ?? null
  const soundOptions = { volume: 0.45, soundEnabled: !muted, interrupt: true }
  const [playCorrect] = useSound(correctUrl, soundOptions)
  const [playSkip] = useSound(skipUrl, soundOptions)
  const [playStart] = useSound(startUrl, soundOptions)
  const [playGameStart] = useSound(gameStartUrl, soundOptions)
  const [playGameEnd] = useSound(gameEndUrl, soundOptions)
  const [playTick] = useSound(tickUrl, soundOptions)
  const [playTimeUp, { duration: timeUpDuration }] = useSound(timeUpUrl, {
    ...soundOptions,
    volume: 0.85
  })
  const [playChampion] = useSound(championUrl, soundOptions)

  const players: Record<EffectCue, () => void> = {
    correct: playCorrect,
    skip: playSkip,
    start: playStart,
    'game-start': playGameStart,
    'game-end': playGameEnd,
    'time-up': playTimeUp,
    champion: playChampion
  }

  const playDelayedGameEnd = useEffectEvent((): void => {
    gameEndTimer.current = undefined
    playGameEnd()
  })

  const playPlan = useEffectEvent((plan: ReturnType<typeof planCommittedEffects>): void => {
    try {
      const followsTimeout = plan.sounds.includes('time-up')
      for (const cue of plan.sounds) {
        if (cue === 'game-end' && followsTimeout && timeUpDuration) {
          gameEndTimer.current = window.setTimeout(playDelayedGameEnd, timeUpDuration + 100)
        } else {
          players[cue]()
        }
      }
      if (plan.confetti !== 'none') burst(plan.confetti)
      if (plan.championMark) setShowMark(true)
    } catch {
      // 动效失败不回滚已提交的判题。
    }
  })

  useEffect(() => {
    lastTick.current = null
    setShowMark(false)
  }, [turnId])

  useEffect(() => {
    return () => window.clearTimeout(gameEndTimer.current)
  }, [gameId])

  const onCommittedEvent = useEffectEvent((event: GameUiEvent): void => {
    if (event.gameId !== gameId || seenEventIds.has(event.eventId)) return
    seenEventIds.add(event.eventId)
    if (event.kind === 'GAME_FINISHED') {
      pendingChampion.current = event
      setChampionSerial((value) => value + 1)
    }
    playPlan(
      planCommittedEffects(event, {
        alreadySeen: false,
        showChampion: false,
        effectLevel,
        reducedMotion: reducedMotion(),
        muted
      })
    )
  })

  useEffect(() => {
    return window.gameAPI.events.subscribe((event) => onCommittedEvent(event))
  }, [])

  useEffect(() => {
    const event = pendingChampion.current
    if (!event || snapshot?.id !== event.gameId || snapshot.status !== 'GAME_FINISHED') return
    pendingChampion.current = null
    if (!snapshot.showChampion) return
    const plan = planCommittedEffects(event, {
      alreadySeen: false,
      showChampion: true,
      effectLevel,
      reducedMotion: reducedMotion(),
      muted
    })
    playPlan({ ...plan, sounds: plan.sounds.filter((cue) => cue === 'champion') })
  }, [snapshot, effectLevel, muted, championSerial])

  useEffect(() => {
    const second = nextTickSecond(
      lastTick.current,
      displayRemainingMs,
      snapshot?.phase === 'running'
    )
    if (second == null) return
    lastTick.current = second
    if (muted) return
    try {
      playTick()
    } catch {
      // 音效缺失时计时仍然继续。
    }
  }, [displayRemainingMs, snapshot?.phase, muted, playTick])

  return { championMark: showMark && snapshot?.showChampion === true }
}

export function ChampionMark({ active }: { active: boolean }): React.JSX.Element | null {
  const effectLevel = useUiSettings((state) => state.effectLevel)
  if (!active || effectLevel === 'off' || reducedMotion()) return null
  return (
    <EffectBoundary>
      <Lottie src={championMark} loop={false} autoplay aria-hidden className="mx-auto h-24 w-24" />
    </EffectBoundary>
  )
}

class EffectBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  render(): ReactNode {
    return this.state.failed ? null : this.props.children
  }
}
