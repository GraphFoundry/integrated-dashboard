interface ErrorBannerProps {
  /** Error message to display */
  readonly message: string
  /** Optional retry callback. If provided, shows a retry button. */
  readonly onRetry?: () => void
}

export default function ErrorBanner({ message, onRetry }: ErrorBannerProps) {
  return (
    <div className="bg-red-900/20 border border-red-700 rounded-lg p-4" role="alert">
      <p className="text-red-400">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 text-sm text-red-300 hover:text-red-200 underline"
        >
          Retry
        </button>
      )}
    </div>
  )
}
