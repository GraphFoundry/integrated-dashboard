import { Shield, LucideIcon } from 'lucide-react'

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
    <div className="relative overflow-hidden rounded-2xl border border-firebase-border bg-gradient-to-r from-firebase-blue/20 via-firebase-card to-firebase-card p-6 md:p-8">
      <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Icon className="h-8 w-8 text-firebase-blue" />
            <h1 className="text-3xl font-bold text-firebase-text-primary md:text-4xl">{title}</h1>
          </div>
          {description && (
            <p className="text-base text-firebase-text-secondary md:text-lg">{description}</p>
          )}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
      </div>
      <div className="pointer-events-none absolute right-0 top-0 h-56 w-56 rounded-full bg-firebase-blue/15 blur-3xl" />
    </div>
  )
}
