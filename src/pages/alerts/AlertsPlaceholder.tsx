export default function AlertsPlaceholder() {
  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold text-white mb-6">Alerts Dashboard</h1>
      <div className="bg-slate-900 border border-slate-700 rounded-lg p-8 text-center">
        <div className="text-6xl mb-4">🚨</div>
        <h2 className="text-xl font-semibold text-white mb-2">Coming Soon</h2>
        <p className="text-slate-400 mb-4">
          This page is reserved for the Alert Engine UI integration.
        </p>
        <div className="bg-slate-800 border border-slate-600 rounded p-4 text-left max-w-md mx-auto">
          <p className="text-sm text-slate-300 mb-2 font-mono">
            // Placeholder for teammate integration
          </p>
          <ul className="text-xs text-slate-400 space-y-1">
            <li>• Alert list view</li>
            <li>• Alert detail page</li>
            <li>• Alert configuration</li>
            <li>• Notification settings</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
