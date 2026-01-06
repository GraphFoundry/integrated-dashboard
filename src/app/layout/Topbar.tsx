export default function Topbar() {
  return (
    <header className="h-16 bg-firebase-dark border-b border-firebase-border flex items-center px-6">
      <div className="flex items-center justify-between w-full">
        <div className="text-sm text-firebase-text-secondary">
          <span className="inline-flex items-center gap-2">
            <span className="w-2 h-2 bg-firebase-success rounded-full"></span>
            System Active
          </span>
        </div>
        <div className="text-xs text-firebase-text-muted">
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
