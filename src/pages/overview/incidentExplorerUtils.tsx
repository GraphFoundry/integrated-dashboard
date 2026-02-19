import InfoHint from '@/components/common/InfoHint'

interface MetricTooltipProps {
  readonly label: string
  readonly tooltip: string
  readonly children: React.ReactNode
}

export function MetricTooltip({ label, tooltip, children }: MetricTooltipProps) {
  return (
    <div>
      <div className="inline-flex w-fit items-center gap-1.5 text-xs uppercase tracking-wider text-[var(--text-dim)] font-semibold mb-0.5">
        <span>{label}</span>
        <InfoHint text={tooltip} />
      </div>
      {children}
    </div>
  )
}

interface ModeButtonProps {
  readonly active: boolean
  readonly onClick: () => void
  readonly children: React.ReactNode
}

export function ModeButton({ active, onClick, children }: ModeButtonProps) {
  return (
    <button type="button"
      onClick={onClick}
      className={`neon-focus-ring interactive-soft rounded-lg border px-4 py-2 text-sm font-semibold transition-all ${
        active
          ? 'border-[var(--color-emerald-300)]/45 bg-emerald-500/18 text-[var(--primary-foreground)] shadow-[0_10px_24px_rgba(5,150,105,0.25)]'
          : 'border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--text-secondary)] hover:border-[var(--color-emerald-300)]/45 hover:text-[var(--text-primary)]'
      }`}
    >
      {children}
    </button>
  )
}
