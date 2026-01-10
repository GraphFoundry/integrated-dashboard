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
    <div className="relative overflow-hidden bg-gradient-to-r from-blue-600/20 via-purple-600/20 to-pink-600/20 rounded-2xl border border-gray-700/50 p-8">
      <div className="relative z-10 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Icon className="w-8 h-8 text-blue-400" />
            <h1 className="text-4xl font-bold text-white">{title}</h1>
          </div>
          {description && <p className="text-gray-300 text-lg">{description}</p>}
        </div>
        {actions && <div className="flex items-center gap-3">{actions}</div>}
      </div>
      <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl"></div>
    </div>
  )
}
