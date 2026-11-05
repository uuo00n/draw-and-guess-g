import { cn } from '@renderer/lib/utils'

export function StatusNote({
  tone,
  className,
  children
}: {
  tone: 'danger' | 'success'
  className?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn('gp-note', tone === 'danger' ? 'gp-note-danger' : 'gp-note-success', className)}
    >
      {children}
    </div>
  )
}
