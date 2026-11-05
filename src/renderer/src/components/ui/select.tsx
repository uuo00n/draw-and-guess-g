import * as React from 'react'
import { cn } from '@renderer/lib/utils'

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  className?: string
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        'h-10 w-full rounded-[10px] border border-first-01 bg-surface px-3 text-sm text-morning focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral disabled:cursor-not-allowed disabled:opacity-40',
        className
      )}
      {...props}
    />
  )
)
Select.displayName = 'Select'
