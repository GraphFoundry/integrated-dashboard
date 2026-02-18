import { BarChart3 } from 'lucide-react'
import { cn, glassPanelClass } from '@/components/common/uiClassTokens'

interface EmptyStateProps {
  icon?: string | React.ReactNode
  title?: string
  message: string
  description?: string
  action?: React.ReactNode
}

export default function EmptyState({
  icon = <BarChart3 className="h-12 w-12 text-[var(--color-emerald-300)]" />,
  title,
  message,
  description,
  action,
}: Readonly<EmptyStateProps>) {
  return (
    <div
      className={cn(glassPanelClass, 'rounded-[var(--radius-md)] p-10 text-center md:p-12')}
      role="status"
      aria-live="polite"
    >
      <div className={typeof icon === 'string' ? 'mb-4 text-5xl' : 'mb-4 flex justify-center'}>{icon}</div>
      {title && <h3 className="mb-2 text-lg font-semibold text-[var(--text-primary)]">{title}</h3>}
      <p className="mb-1 text-base font-semibold text-[var(--text-primary)]">{message}</p>
      {description && (
        <p className="mx-auto max-w-2xl text-sm leading-relaxed text-[var(--text-secondary)]">
          {description}
        </p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}
