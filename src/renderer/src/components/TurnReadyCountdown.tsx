import { useEffect, useEffectEvent, useRef, useState } from 'react'
import useSound from 'use-sound'
import tickUrl from '@renderer/assets/sounds/tick.wav'
import { useUiSettings } from '@renderer/stores/ui-settings-store'

type TurnReadyCountdownProps = {
  active: boolean
  seconds?: number
  onComplete: () => void
  onCancel?: () => void
}

export function TurnReadyCountdown({
  active,
  seconds = 3,
  onComplete,
  onCancel
}: TurnReadyCountdownProps): React.JSX.Element | null {
  const muted = useUiSettings((state) => state.muted)
  const [display, setDisplay] = useState(seconds)
  const runId = useRef(0)
  const soundOptions = { volume: 0.45, soundEnabled: !muted, interrupt: true }
  const [playTick] = useSound(tickUrl, soundOptions)
  const tick = useEffectEvent(() => {
    if (!muted) playTick()
  })

  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  useEffect(() => {
    if (!active) {
      setDisplay(seconds)
      return
    }
    const id = ++runId.current
    let remaining = seconds
    setDisplay(remaining)
    tick()

    const timers: number[] = []
    for (let step = 1; step <= seconds; step += 1) {
      timers.push(
        window.setTimeout(() => {
          if (runId.current !== id) return
          remaining -= 1
          if (remaining <= 0) {
            onCompleteRef.current()
            return
          }
          setDisplay(remaining)
          tick()
        }, step * 1000)
      )
    }

    return () => {
      for (const timer of timers) window.clearTimeout(timer)
    }
  }, [active, seconds])

  if (!active) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-midnight/80 backdrop-blur-sm"
      role="dialog"
      aria-live="assertive"
      aria-label="开始挑战倒计时"
    >
      <div className="text-center">
        <p className="text-sm font-semibold tracking-[0.24em] text-gold">准备开始</p>
        <p className="mt-6 text-[120px] font-semibold leading-none tabular-nums text-morning">
          {display}
        </p>
        {onCancel ? (
          <button
            type="button"
            className="mt-10 text-sm text-first-03 underline-offset-4 hover:text-morning hover:underline"
            onClick={onCancel}
          >
            取消
          </button>
        ) : null}
      </div>
    </div>
  )
}
