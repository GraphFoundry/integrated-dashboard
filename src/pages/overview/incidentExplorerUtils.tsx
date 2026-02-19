import { Info } from 'lucide-react'

interface MetricTooltipProps {
  readonly label: string
  readonly tooltip: string
  readonly children: React.ReactNode
}

export function MetricTooltip({ label, tooltip, children }: MetricTooltipProps) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-[var(--text-dim)] font-semibold mb-0.5">
        <span>{label}</span>
        <div className="group relative inline-block">
          <Info className="w-3 h-3 text-[var(--text-dim)] hover:text-[var(--text-muted)] cursor-help" />
          <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block w-64 z-50">
            <div className="bg-[var(--surface-solid)] text-[var(--text-primary)] text-xs rounded-lg p-2 shadow-xl border border-[var(--border)]">
              {tooltip}
            </div>
          </div>
        </div>
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
