import { ArrowUp } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'

const FADE_START_PX = 72
const FADE_END_PX = 200

export function scrollTopFadeOpacity(scrollTop: number): number {
  if (scrollTop <= FADE_START_PX) return 0
  if (scrollTop >= FADE_END_PX) return 1
  return (scrollTop - FADE_START_PX) / (FADE_END_PX - FADE_START_PX)
}

export function ScrollToTopButton({
  opacity,
  onClick,
  className
}: {
  opacity: number
  onClick: () => void
  className?: string
}): React.JSX.Element {
  const visible = opacity > 0.02

  return (
    <Button
      type="button"
      variant="secondary"
      size="default"
      aria-label="回到顶部"
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
      onClick={onClick}
      className={cn(
        'scroll-to-top fixed z-40 h-11 w-11 rounded-full p-0 shadow-lg transition-[opacity,transform] duration-200',
        visible ? 'pointer-events-auto' : 'pointer-events-none',
        className
      )}
      style={{
        opacity,
        transform: `translateY(${visible ? 0 : 8}px)`
      }}
    >
      <ArrowUp className="h-5 w-5" aria-hidden />
    </Button>
  )
}
