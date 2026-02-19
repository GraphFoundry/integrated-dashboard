import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { cn, glassSurfaceClass } from '@/components/common/uiClassTokens'
import InfoHint from '@/components/common/InfoHint'

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
  default: 'border-[var(--border)]',
  success: 'border-emerald-300/35',
  warning: 'border-amber-300/35',
  danger: 'border-rose-300/35',
}

const trendIcons = {
  up: TrendingUp,
  down: TrendingDown,
  stable: Minus,
}

const trendColors = {
  up: 'text-emerald-700',
  down: 'text-rose-700',
  stable: 'text-[var(--text-muted)]',
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
  const hintText = tooltip ?? `Simple explanation of what "${label}" means on this card.`

  return (
    <div
      className={cn(
        glassSurfaceClass,
        'interactive-soft rounded-[var(--radius-md)] p-4 hover:-translate-y-0.5 hover:border-[var(--color-emerald-300)]/60',
        variantColors[variant],
        className
      )}
    >
      <div className="mb-1 flex items-start gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
        <span className="min-w-0 break-words leading-tight">{label}</span>
        <InfoHint text={hintText} />
      </div>
      <div className="flex items-baseline gap-2">
        <div className="text-2xl font-bold text-[var(--text-primary)]">{value}</div>
        {trend && TrendIcon && (
          <div className={cn('flex items-center gap-1 text-xs font-semibold', trendColors[trend])}>
            <TrendIcon className="h-3 w-3" />
            {trendLabel && <span>{trendLabel}</span>}
          </div>
        )}
      </div>
    </div>
  )
}
