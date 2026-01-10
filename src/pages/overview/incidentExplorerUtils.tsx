import { Info } from 'lucide-react'

interface MetricTooltipProps {
  readonly label: string
  readonly tooltip: string
  readonly children: React.ReactNode
}

export function MetricTooltip({ label, tooltip, children }: MetricTooltipProps) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-slate-500 font-semibold mb-0.5">
        <span>{label}</span>
        <div className="group relative inline-block">
          <Info className="w-3 h-3 text-slate-500 hover:text-slate-400 cursor-help" />
          <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block w-64 z-50">
            <div className="bg-slate-800 text-slate-200 text-xs rounded-lg p-2 shadow-xl border border-slate-700">
              {tooltip}
            </div>
          </div>
        </div>
      </div>
      {children}
    </div>
  )
}

interface ModeButtonProps {
  readonly active: boolean
  readonly onClick: () => void
  readonly children: React.ReactNode
}

export function ModeButton({ active, onClick, children }: ModeButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
        active
          ? 'bg-sky-500 text-white shadow-sm'
          : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
      }`}
    >
      {children}
    </button>
  )
}
