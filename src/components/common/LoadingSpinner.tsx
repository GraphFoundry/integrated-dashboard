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
  sm: 'w-6 h-6 border-2',
  md: 'w-8 h-8 border-4',
  lg: 'w-12 h-12 border-4',
} as const

export default function LoadingSpinner({
  message,
  size = 'md',
  fullHeight = true,
}: LoadingSpinnerProps) {
  const spinner = (
    <div
      className={`animate-spin rounded-full border-firebase-blue border-t-transparent ${sizeClasses[size]}`}
      role="status"
    >
      <span className="sr-only">Loading</span>
    </div>
  )

  if (!fullHeight) {
    return (
      <div className="flex flex-col items-center gap-3">
        {spinner}
        {message && <p className="text-firebase-text-secondary text-sm">{message}</p>}
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center h-full gap-3">
      {spinner}
      {message && <p className="text-firebase-text-secondary text-sm">{message}</p>}
    </div>
  )
}
