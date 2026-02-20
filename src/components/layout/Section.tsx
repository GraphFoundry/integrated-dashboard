import { LucideIcon } from 'lucide-react'
import { cn, glassSurfaceClass } from '@/components/common/uiClassTokens'
import InfoHint from '@/components/common/InfoHint'

interface SectionProps {
  title?: string
  description?: string
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
  contentClassName?: string
  icon?: LucideIcon
}

export default function Section({
  title,
  description,
  actions,
  children,
  className = '',
  contentClassName = '',
  icon: Icon,
}: Readonly<SectionProps>) {
  return (
    <section className={cn(glassSurfaceClass, 'rounded-[var(--radius-md)]', className)}>
      {(title || description || actions) && (
        <header className="border-b border-[var(--border)] p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              {title && (
                <div className="flex items-center gap-3">
                  {Icon && (
                    <div className="surface-glass rounded-lg border border-[var(--color-emerald-300)]/40 p-2">
                      <Icon className="h-4 w-4 text-[var(--color-emerald-300)]" />
                    </div>
                  )}
                  <h2 className="text-xl font-semibold text-[var(--text-primary)]">
                    {title}
                    {description ? (
                      <span className="ml-1 inline-flex align-middle">
                        <InfoHint text={description} />
                      </span>
                    ) : null}
                  </h2>
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
      <div className={cn('p-6', contentClassName)}>{children}</div>
    </section>
  )
}
