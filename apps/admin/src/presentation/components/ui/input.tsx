import type { InputHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

type InputProps = InputHTMLAttributes<HTMLInputElement>

export function Input({ className, type, ...props }: InputProps): React.JSX.Element {
  return (
    <input
      type={type}
      className={cn(
        'flex h-10 w-full rounded-md border border-gray-400 bg-white px-3 py-2 text-sm text-gray-900',
        // gray-500 (#6b7280) = 4.7:1 on white — passes WCAG AA. gray-400 fails (2.9:1).
        'placeholder:text-gray-500',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}
