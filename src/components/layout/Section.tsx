import { LucideIcon } from 'lucide-react'
import { cn, glassSurfaceClass } from '@/components/common/uiClassTokens'

interface SectionProps {
  title?: string
  description?: string
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
  icon?: LucideIcon
}

export default function Section({
  title,
  description,
  actions,
  children,
  className = '',
  icon: Icon,
}: Readonly<SectionProps>) {
  return (
    <section className={cn(glassSurfaceClass, 'rounded-[var(--radius-md)]', className)}>
      {(title || description || actions) && (
        <header className="border-b border-white/10 p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              {title && (
                <div className="flex items-center gap-3">
                  {Icon && (
                    <div className="surface-glass rounded-lg border border-cyan-300/25 p-2">
                      <Icon className="h-4 w-4 text-cyan-300" />
                    </div>
                  )}
                  <h2 className="text-xl font-semibold text-[var(--text-primary)]">{title}</h2>
                </div>
              )}
              {description && (
                <p className="mt-1 text-sm text-[var(--text-secondary)]">{description}</p>
              )}
            </div>
            {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
          </div>
        </header>
      )}
      <div className="p-6">{children}</div>
    </section>
  )
}
