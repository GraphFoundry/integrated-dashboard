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
    <div className={`bg-firebase-card rounded-lg border border-firebase-border ${className}`}>
      {(title || description || actions) && (
        <div className="border-b border-firebase-border p-6">
          <div className="flex items-start justify-between">
            <div>
              {title && (
                <div className="flex items-center gap-3">
                  {Icon && <Icon className="w-5 h-5 text-firebase-blue" />}
                  <h2 className="text-xl font-semibold text-firebase-text-primary">{title}</h2>
                </div>
              )}
              {description && <p className="text-sm text-firebase-text-secondary mt-1">{description}</p>}
            </div>
            {actions && <div className="flex items-center gap-3">{actions}</div>}
          </div>
        </div>
      )}
      <div className="p-6">{children}</div>
    </div>
  )
}
