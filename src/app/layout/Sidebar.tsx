import { NavLink } from 'react-router'
import { LayoutDashboard, LineChart, Beaker, History, AlertCircle, GitBranch } from 'lucide-react'

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
    <aside className="w-64 bg-firebase-sidebar border-r border-firebase-border flex flex-col">
      <div className="p-6 border-b border-firebase-border">
        <h1 className="text-xl font-bold text-firebase-text-primary">Adaptive Microservices</h1>
        <p className="text-xs text-firebase-text-secondary mt-1">Management Dashboard</p>
      </div>
      <nav className="flex-1 p-4">
        <ul className="space-y-1">
          {navItems.map((item) => (
            <li key={item.path}>
              <NavLink
                to={item.path}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-2.5 rounded-lg transition-colors ${isActive
                    ? 'bg-firebase-blue text-white'
                    : 'text-firebase-text-secondary hover:bg-white/5 hover:text-white'
                  }`
                }
              >
                <item.icon className="w-5 h-5" />
                <span className="font-medium text-sm">{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  )
}
