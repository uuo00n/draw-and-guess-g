import { GenpactBrand } from '@renderer/components/branding/GenpactBrand'
import {
  ScrollToTopButton,
  scrollTopFadeOpacity
} from '@renderer/components/layout/ScrollToTopButton'
import { cn } from '@renderer/lib/utils'
import { useCallback, useRef, useState } from 'react'

export function AppHeader({
  title,
  subtitle
}: {
  title: string
  subtitle?: string
}): React.JSX.Element {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
      <div className="flex min-w-0 items-center gap-4">
        <GenpactBrand variant="wordmark" height={48} />
        <div className="hidden h-10 w-px bg-first-01 sm:block" />
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-[0.28em] text-gold">DALIAN DIGITAL</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-morning lg:text-4xl">
            {title}
          </h1>
          {subtitle ? <p className="mt-1 text-sm text-first-03">{subtitle}</p> : null}
        </div>
      </div>
      <div className="text-right">
        <div className="text-sm font-semibold tracking-[0.16em] text-morning">DRAW &amp; GUESS</div>
        <div className="text-xs text-first-03">Genpact Dalian Digital · 你画我猜</div>
      </div>
    </header>
  )
}

export function ScrollablePageRoot({
  children,
  header,
  className,
  scrollClassName
}: {
  children: React.ReactNode
  header?: React.ReactNode
  className?: string
  scrollClassName?: string
}): React.JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const opacity = scrollTopFadeOpacity(scrollTop)

  const onScroll = useCallback((): void => {
    setScrollTop(scrollRef.current?.scrollTop ?? 0)
  }, [])

  const scrollToTop = useCallback((): void => {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  return (
    <div className={cn('app-shell app-shell--scroll', className)}>
      {header ? <div className="app-shell__pin shrink-0">{header}</div> : null}
      <div
        ref={scrollRef}
        className={cn('app-shell__scroll min-h-0 flex-1 overflow-y-auto overscroll-y-contain', scrollClassName)}
        onScroll={onScroll}
      >
        {children}
      </div>
      <ScrollToTopButton opacity={opacity} onClick={scrollToTop} />
    </div>
  )
}

export function PageShell({
  children,
  title,
  subtitle,
  className
}: {
  children: React.ReactNode
  title: string
  subtitle?: string
  className?: string
}): React.JSX.Element {
  return (
    <ScrollablePageRoot
      className={className}
      header={<AppHeader title={title} subtitle={subtitle} />}
    >
      <div className="flex min-h-0 flex-col pb-1">{children}</div>
    </ScrollablePageRoot>
  )
}

export function StatPill({
  label,
  value
}: {
  label: string
  value: string | number
}): React.JSX.Element {
  return (
    <div className="rounded-[16px] border border-line bg-surface px-4 py-3">
      <div className="text-[11px] font-semibold tracking-[0.14em] text-first-03 uppercase">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold text-gold tabular-nums">{value}</div>
    </div>
  )
}
