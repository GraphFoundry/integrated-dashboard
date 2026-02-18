import { LucideIcon } from 'lucide-react'

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
    <section className={`rounded-xl border border-firebase-border bg-firebase-card ${className}`}>
      {(title || description || actions) && (
        <header className="border-b border-firebase-border p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              {title && (
                <div className="flex items-center gap-3">
                  {Icon && <Icon className="h-5 w-5 text-firebase-blue" />}
                  <h2 className="text-xl font-semibold text-firebase-text-primary">{title}</h2>
                </div>
              )}
              {description && (
                <p className="mt-1 text-sm text-firebase-text-secondary">{description}</p>
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
