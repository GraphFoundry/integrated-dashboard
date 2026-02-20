import { cn, metricHighlightCardClass } from '@/components/common/uiClassTokens'
import InfoHint from '@/components/common/InfoHint'

type MetricTone = 'default' | 'indigo' | 'blue' | 'rose' | 'amber' | 'emerald' | 'purple'

interface MetricHighlightCardProps {
  readonly label: string
  readonly description: string
  readonly icon: React.ComponentType<{ className?: string }>
  readonly value: React.ReactNode
  readonly valueClassName?: string
  readonly note?: React.ReactNode
  readonly tone?: MetricTone
  readonly className?: string
  readonly tooltip?: string
}

const TONE_STYLES: Record<MetricTone, { border: string; icon: string; glow: string }> = {
  default: {
    border: 'hover:border-[var(--color-emerald-300)]/60',
    icon: 'text-[var(--color-emerald-300)]',
    glow: 'bg-emerald-400/12',
  },
  indigo: {
    border: 'hover:border-indigo-300/35',
    icon: 'text-indigo-300',
    glow: 'bg-indigo-400/10',
  },
  blue: {
    border: 'hover:border-blue-300/35',
    icon: 'text-blue-300',
    glow: 'bg-blue-400/10',
  },
  rose: {
    border: 'hover:border-rose-300/35',
    icon: 'text-rose-300',
    glow: 'bg-rose-400/10',
  },
  amber: {
    border: 'hover:border-amber-300/35',
    icon: 'text-amber-300',
    glow: 'bg-amber-400/10',
  },
  emerald: {
    border: 'hover:border-emerald-300/35',
    icon: 'text-emerald-300',
    glow: 'bg-emerald-400/10',
  },
  purple: {
    border: 'hover:border-purple-300/35',
    icon: 'text-purple-300',
    glow: 'bg-purple-400/10',
  },
}

export default function MetricHighlightCard({
  label,
  description,
  icon: Icon,
  value,
  valueClassName = 'text-[var(--text-primary)]',
  note,
  tone = 'default',
  className,
  tooltip,
}: Readonly<MetricHighlightCardProps>) {
  const styles = TONE_STYLES[tone]
  const hintText = tooltip ?? description

  return (
    <div className={cn(metricHighlightCardClass, styles.border, className)}>
      <div className={cn('absolute -right-8 -top-10 h-32 w-32 rounded-full blur-2xl', styles.glow)} />
      <div className="absolute right-0 top-0 p-4 opacity-15 transition-opacity group-hover:opacity-30">
        <Icon className={cn('h-16 w-16', styles.icon)} />
      </div>
      <div className="relative z-10 flex h-full flex-col justify-between">
        <div>
          <h3 className="mb-1 min-w-0 break-words text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
            {label}
            <span className="ml-1 inline-flex align-middle">
              <InfoHint text={hintText} />
            </span>
          </h3>
          <p className="mb-4 text-xs text-[var(--text-secondary)]">{description}</p>
        </div>
        <div>
          <div className={cn('text-3xl font-bold tracking-tight whitespace-nowrap', valueClassName)}>{value}</div>
          {note}
        </div>
      </div>
    </div>
  )
}
