interface ErrorBannerProps {
  /** Error message to display */
  readonly message: string
  /** Optional retry callback. If provided, shows a retry button. */
  readonly onRetry?: () => void
}

export default function ErrorBanner({ message, onRetry }: ErrorBannerProps) {
  return (
    <div
      className="rounded-lg border border-firebase-error/40 bg-firebase-error/10 p-4"
      role="alert"
    >
      <p className="text-firebase-error">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 text-sm text-firebase-error underline hover:opacity-80"
        >
          Retry
        </button>
      )}
    </div>
  )
}
