import { useState } from 'react'
import { NavLink, useLocation } from 'react-router'
import { LayoutDashboard, LineChart, Sparkles, History, AlertCircle, GitBranch, X, ShieldAlert, TrendingUpDown, ChevronDown, Settings2, Gauge, type LucideIcon } from 'lucide-react'
import { cn, shellSidebarClass } from '@/components/common/uiClassTokens'

const topNavItems = [
  { path: '/overview', label: 'Overview', icon: LayoutDashboard },
]

const predictiveSubItems = [
  { path: '/metrics', label: 'Metrics', icon: LineChart },
  { path: '/simulations', label: 'Simulations', icon: Sparkles },
  { path: '/drills', label: 'Drill Director', icon: ShieldAlert },
  { path: '/history', label: 'History', icon: History },
]

const bottomNavItems = [
  { path: '/alerts', label: 'Alerts', icon: AlertCircle },
  { path: '/decisions/scheduler', label: 'Scheduler', icon: GitBranch },
  { path: '/config', label: 'Config', icon: Settings2 },
  { path: '/latency', label: 'Latency', icon: Gauge },
]

interface SidebarProps {
  readonly open: boolean
  readonly onClose: () => void
}

function NavItem({ path, label, icon: Icon }: { path: string; label: string; icon: LucideIcon }) {
  return (
    <li>
      <NavLink
        to={path}
        className={({ isActive }) =>
          cn(
            'neon-focus-ring interactive-soft group relative flex items-center gap-3 overflow-hidden rounded-xl px-4 py-2.5 text-sm font-semibold',
            isActive
              ? 'border border-cyan-300/35 bg-gradient-to-r from-cyan-400/15 to-blue-500/15 text-[var(--text-primary)] shadow-[0_8px_24px_rgba(14,116,144,0.25)]'
              : 'border border-transparent text-[var(--text-secondary)] hover:border-[var(--border)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)]'
          )
        }
      >
        {(props) => (
          <>
            {props.isActive && (
              <span className="absolute left-0 top-1/2 h-7 w-1 -translate-y-1/2 rounded-r-full bg-cyan-300" />
            )}
            <Icon className="h-4.5 w-4.5" />
            <span>{label}</span>
          </>
        )}
      </NavLink>
    </li>
  )
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const location = useLocation()
  const isPredictiveActive = predictiveSubItems.some((item) => location.pathname.startsWith(item.path))
  const [predictiveOpen, setPredictiveOpen] = useState(isPredictiveActive)

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
          {topNavItems.map((item) => (
            <NavItem key={item.path} {...item} />
          ))}

          {/* Predictive Analysis group */}
          <li>
            <button
              type="button"
              onClick={() => setPredictiveOpen((prev) => !prev)}
              className={cn(
                'neon-focus-ring interactive-soft group relative flex w-full items-center gap-3 overflow-hidden rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors',
                isPredictiveActive
                  ? 'border border-cyan-300/35 bg-gradient-to-r from-cyan-400/15 to-blue-500/15 text-[var(--text-primary)] shadow-[0_8px_24px_rgba(14,116,144,0.25)]'
                  : 'border border-transparent text-[var(--text-secondary)] hover:border-[var(--border)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)]'
              )}
            >
              {isPredictiveActive && (
                <span className="absolute left-0 top-1/2 h-7 w-1 -translate-y-1/2 rounded-r-full bg-cyan-300" />
              )}
              <TrendingUpDown className="h-4.5 w-4.5 shrink-0" />
              <span className="flex-1 text-left">Predictive Analysis</span>
              <ChevronDown
                className={cn(
                  'h-3.5 w-3.5 shrink-0 transition-transform duration-200',
                  predictiveOpen ? 'rotate-180' : 'rotate-0'
                )}
              />
            </button>

            {/* Sub-items */}
            <div
              className={cn(
                'overflow-hidden transition-all duration-200 ease-out',
                predictiveOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
              )}
            >
              <ul className="mt-1 space-y-1 border-l border-[var(--border)] ml-5 pl-3">
                {predictiveSubItems.map((sub) => (
                  <li key={sub.path}>
                    <NavLink
                      to={sub.path}
                      className={({ isActive }) =>
                        cn(
                          'neon-focus-ring interactive-soft group relative flex items-center gap-3 overflow-hidden rounded-lg px-3 py-2 text-sm font-medium',
                          isActive
                            ? 'border border-cyan-300/25 bg-gradient-to-r from-cyan-400/10 to-blue-500/10 text-[var(--text-primary)]'
                            : 'border border-transparent text-[var(--text-secondary)] hover:border-[var(--border)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)]'
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {isActive && (
                            <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-cyan-300" />
                          )}
                          <sub.icon className="h-3.5 w-3.5 shrink-0" />
                          <span>{sub.label}</span>
                        </>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          </li>

          {bottomNavItems.map((item) => (
            <NavItem key={item.path} {...item} />
          ))}
        </ul>
      </nav>
    </aside>
  )
}
