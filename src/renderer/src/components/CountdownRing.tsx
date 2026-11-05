import { CountdownCircleTimer } from 'react-countdown-circle-timer'

type CountdownRingProps = {
  turnId: string
  syncKey: string
  durationSeconds: number
  syncRemainingSeconds: number
  isRunning: boolean
  displayRemainingMs: number
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
  return (
    <CountdownCircleTimer
      key={`${turnId}:${syncKey}`}
      isPlaying={isRunning}
      duration={safeDuration}
      initialRemainingTime={initial}
      colors={['#FFFFFF', '#FFAD28', '#FF555F']}
      colorsTime={[safeDuration, Math.min(10, safeDuration), 0]}
      size={240}
      strokeWidth={14}
      trailColor="#1c3b4d"
      onComplete={() => undefined}
    >
      {() => (
        <span className="text-4xl font-semibold tabular-nums text-brand-text">
          {Math.ceil(displayRemainingMs / 1000)}s
        </span>
      )}
    </CountdownCircleTimer>
  )
}
