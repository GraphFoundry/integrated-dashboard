import { NavLink } from 'react-router'
import { LayoutDashboard, LineChart, Beaker, History, AlertCircle, GitBranch } from 'lucide-react'
import { cn, shellSidebarClass } from '@/components/common/uiClassTokens'

const navItems = [
  { path: '/overview', label: 'Overview', icon: LayoutDashboard },
  { path: '/metrics', label: 'Metrics', icon: LineChart },
  { path: '/simulations', label: 'Simulations', icon: Beaker },
  { path: '/alerts', label: 'Alerts', icon: AlertCircle },
  { path: '/history', label: 'History', icon: History },
  { path: '/decisions/scheduler', label: 'Scheduler', icon: GitBranch },
]

export default function Sidebar() {
  return (
    <aside className={shellSidebarClass}>
      <div className="border-b border-white/10 p-6">
        <h1 className="text-xl font-bold text-[var(--text-primary)]">Adaptive Microservices</h1>
        <p className="mt-1 text-xs font-medium uppercase tracking-[0.08em] text-[var(--text-muted)]">
          Management Dashboard
        </p>
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
                      ? 'border border-cyan-300/35 bg-gradient-to-r from-cyan-400/15 to-blue-500/15 text-white shadow-[0_8px_24px_rgba(14,116,144,0.25)]'
                      : 'border border-transparent text-[var(--text-secondary)] hover:border-white/15 hover:bg-white/6 hover:text-[var(--text-primary)]'
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
