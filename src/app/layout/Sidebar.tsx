import { NavLink } from 'react-router'
import { LayoutDashboard, LineChart, Sparkles, History, AlertCircle, GitBranch, X, ShieldAlert } from 'lucide-react'
import { cn, shellSidebarClass } from '@/components/common/uiClassTokens'

const navItems = [
  { path: '/overview', label: 'Overview', icon: LayoutDashboard },
  { path: '/metrics', label: 'Metrics', icon: LineChart },
  { path: '/simulations', label: 'Simulations', icon: Sparkles },
  { path: '/drills', label: 'Drill Director', icon: ShieldAlert },
  { path: '/alerts', label: 'Alerts', icon: AlertCircle },
  { path: '/history', label: 'History', icon: History },
  { path: '/decisions/scheduler', label: 'Scheduler', icon: GitBranch },
]

interface SidebarProps {
  readonly open: boolean
  readonly onClose: () => void
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  return (
    <aside
      className={cn(
        shellSidebarClass,
        'transform transition-transform duration-300 ease-out',
        open ? 'translate-x-0' : '-translate-x-full'
      )}
    >
      <div className="border-b border-[var(--border)] p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-[var(--text-primary)]">Adaptive Microservices</h1>
            <p className="mt-1 text-xs font-medium uppercase tracking-[0.08em] text-[var(--text-muted)]">
              Management Dashboard
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="neon-focus-ring interactive-soft rounded-md border border-[var(--border)] bg-[var(--surface-subtle)] p-2 text-[var(--text-secondary)] hover:border-[var(--ring)] hover:text-[var(--text-primary)]"
            aria-label="Hide sidebar"
            title="Hide sidebar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <nav className="flex-1 p-4">
        <ul className="space-y-2">
          {navItems.map((item) => (
            <li key={item.path}>
              <NavLink
                to={item.path}
                className={({ isActive }) =>
                  cn(
                    'neon-focus-ring interactive-soft group relative flex items-center gap-3 overflow-hidden rounded-xl px-4 py-2.5 text-sm font-semibold',
                    isActive
                      ? 'border border-cyan-300/35 bg-gradient-to-r from-cyan-400/15 to-blue-500/15 text-[var(--text-primary)] shadow-[0_8px_24px_rgba(14,116,144,0.25)]'
                      : 'border border-transparent text-[var(--text-secondary)] hover:border-[var(--border)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)]'
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <span className="absolute left-0 top-1/2 h-7 w-1 -translate-y-1/2 rounded-r-full bg-cyan-300" />
                    )}
                    <item.icon className="h-4.5 w-4.5" />
                    <span>{item.label}</span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  )
}
