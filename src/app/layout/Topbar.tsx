export default function Topbar() {
  return (
    <header className="h-16 bg-slate-900 border-b border-slate-700 flex items-center px-6">
      <div className="flex items-center justify-between w-full">
        <div className="text-sm text-slate-400">
          <span className="inline-flex items-center gap-2">
            <span className="w-2 h-2 bg-green-500 rounded-full"></span>
            System Active
          </span>
        </div>
        <div className="text-xs text-slate-500">
          {new Date().toLocaleDateString('en-US', {
            weekday: 'short',
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          })}
        </div>
      </div>
    </header>
  );
}
