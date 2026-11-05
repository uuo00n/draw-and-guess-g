import { useEffect, useState } from 'react'
import { CountdownCircleTimer } from 'react-countdown-circle-timer'

type CountdownRingProps = {
  turnId: string
  syncKey: string
  durationSeconds: number
  syncRemainingSeconds: number
  isRunning: boolean
  displayRemainingMs: number
}

function ringPalette(durationSeconds: number): { colors: `#${string}`[]; colorsTime: number[] } {
  const full = Math.max(1, durationSeconds)
  const warn = Math.min(15, Math.max(2, Math.round(full * 0.25)))
  const urgent = Math.min(5, warn - 1)
  if (warn >= full || urgent <= 0) {
    return { colors: ['#FFFFFF', '#FF555F'], colorsTime: [full, 0] }
  }
  return {
    colors: ['#FFFFFF', '#FFAD28', '#FF555F', '#FF555F'],
    colorsTime: [full, warn, urgent, 0]
  }
}

function useRingSize(): number {
  const [size, setSize] = useState(220)
  useEffect(() => {
    const apply = (): void => {
      const height = window.innerHeight
      if (height < 700) setSize(128)
      else if (height < 820) setSize(168)
      else setSize(220)
    }
    apply()
    window.addEventListener('resize', apply)
    return () => window.removeEventListener('resize', apply)
  }, [])
  return size
}

export function CountdownRing({
  turnId,
  syncKey,
  durationSeconds,
  syncRemainingSeconds,
  isRunning,
  displayRemainingMs
}: CountdownRingProps): React.JSX.Element {
  const safeDuration = Math.max(1, durationSeconds)
  const initial = Math.min(safeDuration, Math.max(0, syncRemainingSeconds))
  const palette = ringPalette(safeDuration)
  const size = useRingSize()
  const seconds = Math.ceil(displayRemainingMs / 1000)
  const tone = seconds <= 5 ? 'text-coral' : seconds <= 15 ? 'text-gold' : 'text-morning'
  return (
    <CountdownCircleTimer
      key={`${turnId}:${syncKey}`}
      isPlaying={isRunning}
      duration={safeDuration}
      initialRemainingTime={initial}
      colors={palette.colors as [`#${string}`, `#${string}`, ...`#${string}`[]]}
      colorsTime={palette.colorsTime as [number, number, ...number[]]}
      size={size}
      strokeWidth={size < 160 ? 10 : 14}
      trailColor="#444744"
      onComplete={() => undefined}
    >
      {() => (
        <span
          className={`font-semibold tabular-nums ${tone}`}
          style={{ fontSize: size < 160 ? 32 : 40 }}
        >
          {seconds}s
        </span>
      )}
    </CountdownCircleTimer>
  )
}
