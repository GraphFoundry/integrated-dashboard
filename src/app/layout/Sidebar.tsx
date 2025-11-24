import { NavLink } from 'react-router'

const navSections = [
  {
    title: 'Playground',
    items: [
      { path: '/pipeline', label: 'Pipeline Playground', icon: '🔬' },
    ],
  },
  {
    title: 'Analytics',
    items: [
      { path: '/telemetry', label: 'Service Telemetry', icon: '📊' },
      { path: '/decisions', label: 'Decision Logs', icon: '📋' },
      { path: '/alerts', label: 'Alerts', icon: '🚨' },
    ],
  },
]

export default function Sidebar() {
  return (
    <aside className="w-64 bg-slate-950 border-r border-slate-700 flex flex-col">
      <div className="p-6 border-b border-slate-700">
        <h1 className="text-xl font-bold text-white">Analysis Dashboard</h1>
        <p className="text-xs text-slate-400 mt-1">Predictive Engine</p>
      </div>
      <nav className="flex-1 p-4 space-y-6">
        {navSections.map((section) => (
          <div key={section.title}>
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 mb-2">
              {section.title}
            </h2>
            <ul className="space-y-1">
              {section.items.map((item) => (
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
                    <span className="text-lg">{item.icon}</span>
                    <span className="font-medium text-sm">{item.label}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  )
}
