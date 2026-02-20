interface ErrorBannerProps {
  /** Error message to display */
  readonly message: string
  /** Optional retry callback. If provided, shows a retry button. */
  readonly onRetry?: () => void
}

export default function ErrorBanner({ message, onRetry }: ErrorBannerProps) {
  return (
    <div
      className="surface-glass rounded-[var(--radius-sm)] border border-rose-300/35 bg-rose-500/15 p-4"
      role="alert"
      aria-live="assertive"
    >
      <p className="text-sm font-medium text-rose-100">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="neon-focus-ring interactive-soft mt-3 rounded-lg border border-rose-200/30 bg-rose-500/15 px-3 py-1.5 text-sm font-semibold text-rose-100 hover:bg-rose-500/25"
        >
          Retry
        </button>
      )}
    </div>
  )
}
