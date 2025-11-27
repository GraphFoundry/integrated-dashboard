interface EmptyStateProps {
  icon?: string
  title?: string
  message: string
  action?: React.ReactNode
}

export default function EmptyState({ icon = '📊', title, message, action }: Readonly<EmptyStateProps>) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-12 text-center">
      <div className="text-5xl mb-4">{icon}</div>
      {title && <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>}
      <p className="text-slate-400">{message}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}
