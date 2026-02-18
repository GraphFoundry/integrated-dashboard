import { Activity } from 'lucide-react'
import { shellTopbarClass } from '@/components/common/uiClassTokens'

export default function Topbar() {
  return (
    <header className={shellTopbarClass}>
      <div className="mx-auto flex h-full w-full max-w-screen-2xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="surface-glass inline-flex items-center gap-2 rounded-full border border-emerald-300/30 px-3 py-1 text-xs font-semibold text-emerald-300">
          <Activity className="h-3.5 w-3.5" />
          <span>System Active</span>
        </div>

        <div className="text-xs font-medium text-[var(--text-muted)]">
          {new Date().toLocaleDateString('en-US', {
            weekday: 'short',
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          })}
        </div>
      </div>
    </header>
  )
}
