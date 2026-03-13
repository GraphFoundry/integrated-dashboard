type ConditionalClass = string | false | null | undefined

export function cn(...classes: ConditionalClass[]): string {
  return classes.filter(Boolean).join(' ')
}

export const pageContainerClass = 'mx-auto w-full max-w-screen-2xl space-y-6 px-4 sm:px-6 lg:px-8'
export const pageContainerSpaciousClass =
  'mx-auto w-full max-w-screen-2xl space-y-8 px-4 sm:px-6 lg:px-8'

export const glassSurfaceClass =
  'surface-glass gloss-highlight rounded-[var(--radius-md)] border border-[var(--border)]'
export const glassPanelClass =
  'surface-panel gloss-highlight rounded-[var(--radius-lg)] border border-[var(--border)]'

export const loadingCardClass = cn(
  glassPanelClass,
  'p-12 text-center text-[var(--text-secondary)]'
)

export const controlLabelClass = 'mb-2 block text-sm font-semibold text-[var(--text-secondary)]'
export const controlLabelCompactClass =
  'mb-2 block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]'

export const controlInputBaseClass = cn(
  'neon-focus-ring interactive-soft h-11 w-full rounded-[var(--radius-sm)] border border-[var(--input)]',
  'bg-[var(--surface-subtle)] px-4 text-sm text-[var(--text-primary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]',
  'placeholder:text-[var(--text-muted)] hover:border-[var(--ring)] focus:border-[var(--ring)] disabled:opacity-60'
)

export const controlInputMutedClass = cn(controlInputBaseClass, 'bg-[var(--surface-soft)]')
export const controlInputPanelClass = cn(controlInputBaseClass, 'bg-[var(--surface-contrast)]')
export const controlInputDarkClass = cn(controlInputBaseClass, 'bg-[var(--surface-solid)]')
export const controlTextareaClass = cn(
  controlInputBaseClass,
  'min-h-28 h-auto resize-y py-3 bg-[var(--surface-soft)] leading-relaxed'
)

export const iconActionButtonClass = cn(
  'neon-focus-ring interactive-soft inline-flex items-center justify-center rounded-[var(--radius-sm)]',
  'border border-emerald-400 bg-emerald-50 text-emerald-700 shadow-[0_4px_12px_rgba(5,150,105,0.15)]',
  'dark:border-[var(--ring)] dark:bg-emerald-500/18 dark:text-[var(--text-primary)] dark:shadow-[0_10px_24px_rgba(2,6,23,0.2)]',
  'hover:bg-emerald-100 hover:border-emerald-500 dark:hover:bg-emerald-500/28 dark:hover:border-[var(--ring)] disabled:opacity-50'
)

export const primaryButtonClass = cn(
  'neon-focus-ring interactive-soft rounded-[var(--radius-sm)] px-4 py-2.5 text-sm font-semibold text-white',
  'border border-emerald-500 bg-gradient-to-r from-emerald-600 to-emerald-500',
  'shadow-[0_4px_12px_rgba(5,150,105,0.25)] hover:brightness-110 dark:shadow-[0_10px_24px_rgba(5,150,105,0.3)] disabled:opacity-50'
)

export const secondaryButtonClass = cn(
  'neon-focus-ring interactive-soft rounded-[var(--radius-sm)] px-4 py-2.5 text-sm font-semibold',
  'border border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50 hover:text-slate-800',
  'dark:border-[var(--border)] dark:bg-[var(--surface-soft)] dark:text-[var(--text-primary)] dark:hover:border-[var(--ring)] dark:hover:bg-[var(--surface-elevated)] dark:hover:text-[var(--text-primary)]',
  'disabled:opacity-50 disabled:cursor-not-allowed'
)

export const successButtonClass = cn(
  'neon-focus-ring interactive-soft inline-flex items-center rounded-[var(--radius-sm)] px-4 py-2.5 text-sm font-semibold text-white',
  'border border-emerald-500 bg-gradient-to-r from-emerald-600 to-green-500',
  'shadow-[0_4px_12px_rgba(5,150,105,0.25)] hover:brightness-110 dark:shadow-[0_10px_24px_rgba(5,150,105,0.3)] disabled:opacity-50'
)

export const subtleIconButtonClass = cn(iconActionButtonClass, 'h-11 w-11 p-2.5')

export const linkActionButtonClass =
  'neon-focus-ring interactive-soft rounded-md px-2 py-1 text-sm font-semibold text-[var(--text-primary)] hover:text-[var(--text-primary)]'

export const tableShellClass = cn(
  glassSurfaceClass,
  'overflow-hidden border border-[var(--border)] shadow-[0_16px_30px_rgba(2,6,23,0.2)]'
)

export const tableHeadRowClass =
  'bg-[var(--table-head-bg)] text-[var(--text-muted)] backdrop-blur-md supports-[backdrop-filter]:bg-[var(--table-head-bg-support)]'

export const tableBodyRowClass =
  'border-b border-[var(--border)] odd:bg-[var(--table-row-odd)] even:bg-[var(--table-row-even)] hover:bg-[var(--table-row-hover)]'

export const tableHeaderCellClass =
  'px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]'

export const tableCellClass = 'px-6 py-4 text-sm text-[var(--text-secondary)]'

export const tableHeadStickyClass = 'sticky top-0 z-10 backdrop-blur-md'

export const tableActionLinkClass = cn(
  linkActionButtonClass,
  'border border-[var(--ring)] bg-emerald-500/12 text-[var(--text-primary)] hover:bg-emerald-500/20'
)

export const shellSidebarClass = cn(
  'surface-panel fixed inset-y-0 left-0 z-40 flex h-screen w-72 flex-col overflow-y-auto border-r border-[var(--border)]',
  'shadow-[0_20px_45px_rgba(2,6,23,0.22)]'
)

export const shellTopbarClass = cn(
  'surface-glass sticky top-0 z-30 h-16 border-b border-[var(--border)]',
  'supports-[backdrop-filter]:bg-[var(--surface-elevated)]'
)

export const shellMainClass = 'relative flex-1 p-4 sm:p-6 lg:p-8'

export const sectionHeaderIconClass =
  'surface-glass rounded-lg border border-[var(--ring)] p-2 text-[var(--color-emerald-300)]'

export const emphasizedTitleClass = 'text-[var(--text-primary)]'

export const metricHighlightCardClass = cn(
  glassSurfaceClass,
  'interactive-soft group relative overflow-hidden rounded-[var(--radius-md)] p-6',
  'hover:-translate-y-0.5 hover:shadow-[0_18px_34px_rgba(2,6,23,0.22)]'
)

export const glassInteractiveCardClass = cn(
  glassSurfaceClass,
  'interactive-soft rounded-[var(--radius-md)] p-6 hover:-translate-y-0.5 hover:border-[var(--ring)]'
)

export const modalPanelClass = cn(
  glassPanelClass,
  'rounded-[var(--radius-md)] border border-[var(--border-strong)] shadow-[0_24px_64px_rgba(2,6,23,0.45)]'
)
