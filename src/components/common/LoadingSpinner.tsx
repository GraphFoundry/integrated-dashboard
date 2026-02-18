import { type ReactNode } from 'react'

interface LoadingSpinnerProps {
  /** Optional message displayed below the spinner */
  readonly message?: ReactNode
  /** Spinner size: 'sm' (w-6 h-6), 'md' (w-8 h-8), 'lg' (w-12 h-12) */
  readonly size?: 'sm' | 'md' | 'lg'
  /** If true, wraps spinner in a full-height flex container */
  readonly fullHeight?: boolean
}

const sizeClasses = {
  sm: 'h-6 w-6 border-2',
  md: 'h-8 w-8 border-[3px]',
  lg: 'h-12 w-12 border-4',
} as const

export default function LoadingSpinner({
  message,
  size = 'md',
  fullHeight = true,
}: LoadingSpinnerProps) {
  const spinner = (
    <div className="relative">
      <div
        className={`animate-spin rounded-full border-cyan-300/75 border-t-transparent ${sizeClasses[size]}`}
        role="status"
      >
        <span className="sr-only">Loading</span>
      </div>
      <div className="absolute inset-0 rounded-full blur-md bg-cyan-300/20" />
    </div>
  )

  if (!fullHeight) {
    return (
      <div className="flex flex-col items-center gap-3">
        {spinner}
        {message && <p className="text-sm text-[var(--text-secondary)]">{message}</p>}
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3">
      {spinner}
      {message && <p className="text-sm text-[var(--text-secondary)]">{message}</p>}
    </div>
  )
}
