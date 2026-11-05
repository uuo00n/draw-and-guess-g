export function AppHeader({
  title,
  subtitle
}: {
  title: string
  subtitle?: string
}): React.JSX.Element {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-brand-muted/20 pb-6">
      <div>
        <p className="text-sm uppercase tracking-[0.2em] text-brand-accent">Genpact Team Challenge</p>
        <h1 className="mt-2 text-3xl font-bold text-brand-text lg:text-4xl">{title}</h1>
        {subtitle ? <p className="mt-2 text-brand-muted">{subtitle}</p> : null}
      </div>
      <div className="text-right text-sm text-brand-muted">
        <div className="text-lg font-semibold text-brand-text">DRAW &amp; GUESS</div>
        <div>你画我猜</div>
      </div>
    </header>
  )
}

export function PageShell({
  children,
  title,
  subtitle
}: {
  children: React.ReactNode
  title: string
  subtitle?: string
}): React.JSX.Element {
  return (
    <div className="app-shell">
      <AppHeader title={title} subtitle={subtitle} />
      {children}
    </div>
  )
}

export function StatPill({ label, value }: { label: string; value: string | number }): React.JSX.Element {
  return (
    <div className="rounded-lg border border-brand-muted/20 bg-brand-bg/40 px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-brand-muted">{label}</div>
      <div className="text-2xl font-semibold text-brand-accent">{value}</div>
    </div>
  )
}
