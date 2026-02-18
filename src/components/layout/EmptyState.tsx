interface EmptyStateProps {
  icon?: string | React.ReactNode
  title?: string
  message: string
  description?: string
  action?: React.ReactNode
}

export default function EmptyState({
  icon = '📊',
  title,
  message,
  description,
  action,
}: Readonly<EmptyStateProps>) {
  return (
    <div className="rounded-xl border border-firebase-border bg-firebase-card p-12 text-center">
      <div className={typeof icon === 'string' ? 'mb-4 text-5xl' : 'mb-4 flex justify-center'}>
        {icon}
      </div>
      {title && <h3 className="mb-2 text-lg font-semibold text-firebase-text-primary">{title}</h3>}
      <p className="mb-1 font-medium text-firebase-text-primary">{message}</p>
      {description && (
        <p className="mx-auto max-w-md text-sm text-firebase-text-secondary">{description}</p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}
