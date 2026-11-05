import * as React from 'react'
import { cn } from '@renderer/lib/utils'

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'flex h-10 w-full rounded-md border border-brand-muted/30 bg-brand-surface px-3 py-2 text-sm text-brand-text placeholder:text-brand-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent',
        className
      )}
      {...props}
    />
  )
)
Input.displayName = 'Input'
