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

const variantColors = {
  default: 'border-firebase-border',
  success: 'border-firebase-success/30',
  warning: 'border-firebase-warning/30',
  danger: 'border-firebase-error/30',
}

const trendIcons = {
  up: TrendingUp,
  down: TrendingDown,
  stable: Minus,
}

const trendColors = {
  up: 'text-firebase-success',
  down: 'text-firebase-error',
  stable: 'text-firebase-text-secondary',
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
    <div
      title={tooltip}
      className={`relative overflow-hidden rounded-xl border bg-firebase-card p-4 transition-all duration-200 hover:border-firebase-blue/50 ${variantColors[variant]} ${className}`}
    >
      <div className="mb-1 text-sm text-firebase-text-secondary">{label}</div>
      <div className="flex items-baseline gap-2">
        <div className="text-2xl font-bold text-firebase-text-primary">{value}</div>
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
