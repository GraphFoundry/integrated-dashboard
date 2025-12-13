import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

export type TrendDirection = 'up' | 'down' | 'stable'

interface KPIStatCardProps {
  label: string
  value: string | number
  trend?: TrendDirection
  trendLabel?: string
  variant?: 'default' | 'success' | 'warning' | 'danger'
  className?: string
}

const variantClasses = {
  default: 'bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border-blue-500/30 hover:border-blue-500/50 hover:shadow-lg hover:shadow-blue-500/20',
  success: 'bg-gradient-to-br from-green-500/10 to-emerald-500/10 border-green-500/30 hover:border-green-500/50 hover:shadow-lg hover:shadow-green-500/20',
  warning: 'bg-gradient-to-br from-orange-500/10 to-red-500/10 border-orange-500/30 hover:border-orange-500/50 hover:shadow-lg hover:shadow-orange-500/20',
  danger: 'bg-gradient-to-br from-red-500/10 to-pink-500/10 border-red-500/30 hover:border-red-500/50 hover:shadow-lg hover:shadow-red-500/20',
}

const trendIcons = {
  up: TrendingUp,
  down: TrendingDown,
  stable: Minus,
}

const trendColors = {
  up: 'text-green-400',
  down: 'text-red-400',
  stable: 'text-slate-400',
}

export default function KPIStatCard({
  label,
  value,
  trend,
  trendLabel,
  variant = 'default',
  className = '',
}: Readonly<KPIStatCardProps>) {
  const TrendIcon = trend ? trendIcons[trend] : null

  const glowClasses = {
    default: 'bg-blue-500/5 group-hover:bg-blue-500/10',
    success: 'bg-green-500/5 group-hover:bg-green-500/10',
    warning: 'bg-orange-500/5 group-hover:bg-orange-500/10',
    danger: 'bg-red-500/5 group-hover:bg-red-500/10',
  }

  return (
    <div className={`group relative overflow-hidden backdrop-blur-sm border rounded-xl p-4 transition-all duration-300 ${variantClasses[variant]} ${className}`}>
      <div className="text-sm text-slate-400 mb-1">{label}</div>
      <div className="flex items-baseline gap-2">
        <div className="text-2xl font-bold text-white">{value}</div>
        {trend && TrendIcon && (
          <div className={`flex items-center gap-1 text-xs ${trendColors[trend]}`}>
            <TrendIcon className="w-3 h-3" />
            {trendLabel && <span>{trendLabel}</span>}
          </div>
        )}
      </div>
      {/* Glowing blur effect */}
      <div className={`absolute bottom-0 right-0 w-32 h-32 rounded-full blur-2xl transition-all ${glowClasses[variant]}`}></div>
    </div>
  )
}
