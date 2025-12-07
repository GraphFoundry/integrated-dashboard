import { NavLink } from 'react-router'
import { LayoutDashboard, LineChart, Beaker, History, AlertCircle } from 'lucide-react'

const navItems = [
  { path: '/overview', label: 'Overview', icon: LayoutDashboard },
  { path: '/metrics', label: 'Metrics', icon: LineChart },
  { path: '/simulations', label: 'Simulations', icon: Beaker },
  { path: '/alerts', label: 'Alerts', icon: AlertCircle },
  { path: '/history', label: 'History', icon: History },
]

export default function Sidebar() {
  return (
    <aside className="w-64 bg-slate-950 border-r border-slate-700 flex flex-col">
      <div className="p-6 border-b border-slate-700">
        <h1 className="text-xl font-bold text-white">Analysis Dashboard</h1>
        <p className="text-xs text-slate-400 mt-1">Predictive Engine</p>
      </div>
      <nav className="flex-1 p-4">
        <ul className="space-y-1">
          {navItems.map((item) => (
            <li key={item.path}>
              <NavLink
                to={item.path}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-2.5 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
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
