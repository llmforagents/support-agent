import type { LabelHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

type LabelProps = LabelHTMLAttributes<HTMLLabelElement>

export function Label({ className, children, ...props }: LabelProps): React.JSX.Element {
  return (
    <label
      className={cn(
        'text-sm font-medium leading-none',
        'peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
        className,
      )}
      {...props}
    >
      {children}
    </label>
  )
}
