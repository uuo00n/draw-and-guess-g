import CountUp from 'react-countup'
import { useReducedMotion } from 'motion/react'
import { useUiSettings } from '@renderer/stores/ui-settings-store'

export function ScoreValue({ value }: { value: number }): React.JSX.Element {
  const effectLevel = useUiSettings((state) => state.effectLevel)
  const reduced = useReducedMotion()
  if (effectLevel === 'off' || reduced) {
    return <span className="tabular-nums">{value}</span>
  }
  return (
    <CountUp
      end={value}
      duration={effectLevel === 'low' ? 0.25 : 0.55}
      preserveValue
      useEasing
    />
  )
}
