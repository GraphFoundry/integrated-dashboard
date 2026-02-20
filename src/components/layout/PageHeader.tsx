import { Shield, LucideIcon } from 'lucide-react'
import { cn, glassPanelClass } from '@/components/common/uiClassTokens'

interface PageHeaderProps {
  title: string
  description?: string
  actions?: React.ReactNode
  icon?: LucideIcon
}

export default function PageHeader({
  title,
  description,
  actions,
  icon: Icon = Shield,
}: Readonly<PageHeaderProps>) {
  return (
    <div className={cn(glassPanelClass, 'relative p-6 md:p-8')}>
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-16 right-0 h-64 w-64 rounded-full bg-emerald-400/12 blur-3xl" />
        <div className="absolute -bottom-20 left-1/4 h-52 w-52 rounded-full bg-indigo-400/10 blur-3xl" />
      </div>

      <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-3">
            <div className="surface-glass rounded-xl border border-[var(--color-emerald-300)]/40 p-2.5">
              <Icon className="h-6 w-6 text-[var(--color-emerald-300)] md:h-7 md:w-7" />
            </div>
            <h1 className="text-3xl font-bold text-[var(--text-primary)] md:text-4xl">{title}</h1>
          </div>
          {description && (
            <p className="max-w-3xl text-sm text-[var(--text-secondary)] md:text-base">{description}</p>
          )}
        </div>

        {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
      </div>
    </div>
  )
}
