/**
 * StatusBadge — Centralized badge component for consistent status styling.
 *
 * Variants:
 * - default: neutral slate styling
 * - secondary: lighter slate styling
 * - success: green for positive states (connected, fresh, high confidence)
 * - warning: yellow/amber for caution states (medium confidence)
 * - destructive: red for negative states (unreachable, stale, low confidence)
 * - outline: transparent with border only
 */

type BadgeVariant = 'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'outline'

interface StatusBadgeProps {
  readonly children: React.ReactNode
  readonly variant?: BadgeVariant
  readonly className?: string
}

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  default: 'border-white/18 bg-white/10 text-[var(--text-secondary)]',
  secondary: 'border-white/12 bg-white/6 text-[var(--text-muted)]',
  success: 'border-emerald-300/35 bg-emerald-400/15 text-emerald-200',
  warning: 'border-amber-300/35 bg-amber-400/15 text-amber-200',
  destructive: 'border-rose-300/35 bg-rose-400/15 text-rose-200',
  outline: 'border-white/24 bg-transparent text-[var(--text-secondary)]',
}

export default function StatusBadge({
  children,
  variant = 'default',
  className = '',
}: StatusBadgeProps) {
  const baseClasses =
    'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold tracking-wide shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]'
  const variantClasses = VARIANT_CLASSES[variant]

  return <span className={`${baseClasses} ${variantClasses} ${className}`.trim()}>{children}</span>
}

export type { BadgeVariant }
