import { Activity, Menu, X } from 'lucide-react'
import { cn, shellTopbarClass } from '@/components/common/uiClassTokens'
import ThemeModeSelect from '@/components/theme/ThemeModeSelect'

interface TopbarProps {
  readonly sidebarOpen: boolean
  readonly onToggleSidebar: () => void
}

export default function Topbar({ sidebarOpen, onToggleSidebar }: TopbarProps) {
  return (
    <header
      className={cn(
        shellTopbarClass,
        '!fixed right-0 !top-0 !z-50 transition-[left] duration-300 ease-out',
        sidebarOpen ? 'left-72' : 'left-0'
      )}
    >
      <div className="mx-auto flex h-full w-full max-w-screen-2xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onToggleSidebar}
            className="neon-focus-ring interactive-soft inline-flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-subtle)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:border-[var(--ring)] hover:text-[var(--text-primary)]"
            aria-label={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
            title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
          >
            {sidebarOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            <span className="hidden sm:inline">{sidebarOpen ? 'Close menu' : 'Open menu'}</span>
          </button>
          <div className="surface-glass inline-flex items-center gap-2 rounded-full border border-emerald-300/30 px-3 py-1 text-xs font-semibold text-[var(--text-primary)]">
            <Activity className="h-3.5 w-3.5" />
            <span>System Active</span>
          </div>
        </div>

        <div className="flex min-w-0 items-center gap-3">
          <div className="truncate text-xs font-medium text-[var(--text-muted)]">
            {new Date().toLocaleDateString('en-US', {
              weekday: 'short',
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            })}
          </div>
          <ThemeModeSelect />
        </div>
      </div>
    </header>
  )
}
