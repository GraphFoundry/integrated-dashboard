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
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-12 text-center">
      <div className={typeof icon === 'string' ? 'text-5xl mb-4' : 'flex justify-center mb-4'}>
        {icon}
      </div>
      {title && <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>}
      <p className="text-slate-300 font-medium mb-1">{message}</p>
      {description && <p className="text-slate-400 text-sm max-w-md mx-auto">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}
