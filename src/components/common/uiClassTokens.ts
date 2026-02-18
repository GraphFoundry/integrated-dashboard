type ConditionalClass = string | false | null | undefined

export function cn(...classes: ConditionalClass[]): string {
  return classes.filter(Boolean).join(' ')
}

export const controlLabelClass = 'mb-2 block text-sm font-medium text-gray-300'
export const controlLabelCompactClass =
  'mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-400'

export const controlInputBaseClass =
  'w-full rounded-lg border px-4 py-2.5 text-sm text-white transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2'
export const controlInputMutedClass = cn(
  controlInputBaseClass,
  'border-gray-600/50 bg-gray-700/70'
)
export const controlInputPanelClass = cn(controlInputBaseClass, 'border-gray-700 bg-gray-900/50')
export const controlInputDarkClass = cn(
  controlInputBaseClass,
  'border-slate-600/50 bg-slate-800'
)

export const iconActionButtonClass =
  'inline-flex items-center justify-center rounded-lg bg-blue-600 text-white transition-colors hover:bg-blue-700 disabled:bg-slate-600 disabled:opacity-50'
export const primaryButtonClass =
  'rounded-lg bg-blue-600 px-4 py-2 font-medium text-white transition-colors hover:bg-blue-700'
export const secondaryButtonClass =
  'rounded-lg bg-slate-700 px-4 py-2 font-medium text-white transition-colors hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-600'
