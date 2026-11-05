import * as React from 'react'
import { cn } from '@renderer/lib/utils'

export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return (
    <div
      className={cn('rounded-[16px] border border-line bg-surface/95 p-6', className)}
      {...props}
    />
  )
}

export function CardTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>): React.JSX.Element {
  return <h2 className={cn('text-xl font-semibold text-morning', className)} {...props} />
}

export function CardDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>): React.JSX.Element {
  return <p className={cn('text-sm text-first-03', className)} {...props} />
}
