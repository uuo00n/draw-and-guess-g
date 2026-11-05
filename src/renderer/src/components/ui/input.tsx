import * as React from 'react'
import { cn } from '@renderer/lib/utils'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  className?: string
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'flex h-10 w-full rounded-[10px] border border-first-01 bg-surface px-3 py-2 text-sm text-morning placeholder:text-first-02 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral disabled:cursor-not-allowed disabled:opacity-40',
        className
      )}
      {...props}
    />
  )
)
Input.displayName = 'Input'
