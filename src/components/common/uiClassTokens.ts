type ConditionalClass = string | false | null | undefined

export function cn(...classes: ConditionalClass[]): string {
  return classes.filter(Boolean).join(' ')
}

export const pageContainerClass = 'mx-auto w-full max-w-screen-2xl space-y-6 px-4 sm:px-6 lg:px-8'
export const pageContainerSpaciousClass =
  'mx-auto w-full max-w-screen-2xl space-y-8 px-4 sm:px-6 lg:px-8'

export const glassSurfaceClass =
  'surface-glass gloss-highlight rounded-[var(--radius-md)] border border-white/10'
export const glassPanelClass =
  'surface-panel gloss-highlight rounded-[var(--radius-lg)] border border-white/12'

export const loadingCardClass = cn(
  glassPanelClass,
  'p-12 text-center text-[var(--text-secondary)]'
)

export const controlLabelClass = 'mb-2 block text-sm font-semibold text-[var(--text-secondary)]'
export const controlLabelCompactClass =
  'mb-2 block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]'

export const controlInputBaseClass = cn(
  'neon-focus-ring interactive-soft h-11 w-full rounded-[var(--radius-sm)] border border-white/14',
  'bg-white/6 px-4 text-sm text-[var(--text-primary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]',
  'placeholder:text-[var(--text-muted)] hover:border-[var(--color-emerald-300)] disabled:opacity-60'
)

export const controlInputMutedClass = cn(controlInputBaseClass, 'bg-white/8')
export const controlInputPanelClass = cn(controlInputBaseClass, 'bg-black/25')
export const controlInputDarkClass = cn(controlInputBaseClass, 'bg-slate-950/45')

export const iconActionButtonClass = cn(
  'neon-focus-ring interactive-soft inline-flex items-center justify-center rounded-[var(--radius-sm)]',
  'border border-[var(--color-emerald-300)]/45 bg-emerald-500/18 text-emerald-100 shadow-[0_10px_24px_rgba(2,6,23,0.35)]',
  'hover:border-[var(--color-emerald-300)] hover:bg-emerald-500/28 disabled:opacity-50'
)

export const primaryButtonClass = cn(
  'neon-focus-ring interactive-soft rounded-[var(--radius-sm)] px-4 py-2.5 text-sm font-semibold text-white',
  'border border-[var(--color-emerald-300)]/45 bg-gradient-to-r from-emerald-500 to-emerald-400',
  'shadow-[0_10px_24px_rgba(5,150,105,0.38)] hover:brightness-110 disabled:opacity-50'
)

export const secondaryButtonClass = cn(
  'neon-focus-ring interactive-soft rounded-[var(--radius-sm)] px-4 py-2.5 text-sm font-semibold',
  'border border-white/16 bg-white/8 text-[var(--text-secondary)] hover:bg-white/14 hover:text-[var(--text-primary)]',
  'disabled:opacity-50 disabled:hover:bg-white/8 disabled:hover:text-[var(--text-secondary)]'
)

export const successButtonClass = cn(
  'neon-focus-ring interactive-soft inline-flex items-center rounded-[var(--radius-sm)] px-4 py-2.5 text-sm font-semibold text-white',
  'border border-emerald-200/30 bg-gradient-to-r from-emerald-500 to-green-500',
  'shadow-[0_10px_24px_rgba(5,150,105,0.38)] hover:brightness-110 disabled:opacity-50'
)

export const subtleIconButtonClass = cn(iconActionButtonClass, 'h-11 w-11 p-2.5')

export const linkActionButtonClass =
  'neon-focus-ring interactive-soft rounded-md px-2 py-1 text-sm font-semibold text-[var(--color-emerald-300)] hover:text-emerald-100'

export const tableShellClass = cn(
  glassSurfaceClass,
  'overflow-hidden border border-white/10 shadow-[0_16px_30px_rgba(2,6,23,0.24)]'
)

export const tableHeadRowClass =
  'bg-slate-900/72 text-[var(--text-muted)] backdrop-blur-md supports-[backdrop-filter]:bg-slate-900/58'

export const tableBodyRowClass =
  'border-b border-white/8 odd:bg-white/[0.02] even:bg-white/[0.01] hover:bg-emerald-400/[0.07]'

export const tableHeaderCellClass =
  'px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]'

export const tableCellClass = 'px-6 py-4 text-sm text-[var(--text-secondary)]'

export const tableHeadStickyClass = 'sticky top-0 z-10 backdrop-blur-md'

export const tableActionLinkClass = cn(
  linkActionButtonClass,
  'border border-[var(--color-emerald-300)]/45 bg-emerald-400/12 text-[var(--color-emerald-300)] hover:bg-emerald-400/20'
)

export const shellSidebarClass = cn(
  'surface-panel flex h-screen w-72 flex-col border-r border-white/12',
  'sticky top-0 shadow-[0_20px_45px_rgba(2,6,23,0.32)]'
)

export const shellTopbarClass = cn(
  'surface-glass sticky top-0 z-30 h-16 border-b border-white/12',
  'supports-[backdrop-filter]:bg-slate-900/48'
)

export const shellMainClass = 'relative flex-1 overflow-auto p-4 sm:p-6 lg:p-8'

export const sectionHeaderIconClass =
  'surface-glass rounded-lg border border-[var(--color-emerald-300)]/45 p-2 text-[var(--color-emerald-300)]'

export const emphasizedTitleClass = 'text-[var(--text-primary)]'

export const metricHighlightCardClass = cn(
  glassSurfaceClass,
  'interactive-soft group relative overflow-hidden rounded-[var(--radius-md)] p-6',
  'hover:-translate-y-0.5 hover:shadow-[0_18px_34px_rgba(2,6,23,0.32)]'
)

export const glassInteractiveCardClass = cn(
  glassSurfaceClass,
  'interactive-soft rounded-[var(--radius-md)] p-6 hover:-translate-y-0.5 hover:border-[var(--color-emerald-300)]'
)

export const modalPanelClass = cn(
  glassPanelClass,
  'rounded-[var(--radius-md)] border border-white/16 shadow-[0_24px_64px_rgba(2,6,23,0.6)]'
)
