import { GenpactBrand } from '@renderer/components/branding/GenpactBrand'
import { cn } from '@renderer/lib/utils'

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
    <div className={cn('app-shell', className)}>
      <AppHeader title={title} subtitle={subtitle} />
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
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
