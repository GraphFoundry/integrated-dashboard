import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

export type TrendDirection = 'up' | 'down' | 'stable'

interface KPIStatCardProps {
  label: string
  value: string | number
  trend?: TrendDirection
  trendLabel?: string
  variant?: 'default' | 'success' | 'warning' | 'danger'
  className?: string
  tooltip?: string
}

const variantClasses = {
  default: 'bg-slate-800 border-slate-700',
  success: 'bg-green-900/20 border-green-700',
  warning: 'bg-yellow-900/20 border-yellow-700',
  danger: 'bg-red-900/20 border-red-700',
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
  tooltip,
}: Readonly<KPIStatCardProps>) {
  const TrendIcon = trend ? trendIcons[trend] : null

  return (
    <div className={`border rounded-lg p-4 ${variantClasses[variant]} ${className}`}>
      <div className="flex items-center gap-2 mb-1">
        <div className="text-sm text-slate-400">{label}</div>
        {tooltip && (
          <div className="group relative">
            <span className="cursor-help text-slate-500 text-xs">ⓘ</span>
            <div className="invisible group-hover:visible absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-xs p-2 bg-slate-900 border border-slate-700 rounded shadow-lg text-xs text-slate-300 z-20">
              {tooltip}
            </div>
          </div>
        )}
      </div>
      <div className="flex items-baseline gap-2">
        <div className="text-2xl font-bold text-white">{value}</div>
        {trend && TrendIcon && (
          <div className={`flex items-center gap-1 text-xs ${trendColors[trend]}`}>
            <TrendIcon className="w-3 h-3" />
            {trendLabel && <span>{trendLabel}</span>}
          </div>
        )}
      </div>
    </div>
  )
}
