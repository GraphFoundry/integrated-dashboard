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
  default: 'bg-slate-700 text-slate-200 border border-slate-600',
  secondary: 'bg-slate-800 text-slate-300 border border-slate-600',
  success: 'bg-green-900/50 text-green-400 border border-green-700',
  warning: 'bg-yellow-900/50 text-yellow-400 border border-yellow-700',
  destructive: 'bg-red-900/50 text-red-400 border border-red-700',
  outline: 'bg-transparent text-slate-400 border border-slate-600',
}

export default function StatusBadge({
  children,
  variant = 'default',
  className = '',
}: StatusBadgeProps) {
  const baseClasses = 'px-2 py-1 rounded text-xs font-medium inline-flex items-center gap-1'
  const variantClasses = VARIANT_CLASSES[variant]

  return (
    <span className={`${baseClasses} ${variantClasses} ${className}`.trim()}>
      {children}
    </span>
  )
}

// Re-export variant type for external use
export type { BadgeVariant }
