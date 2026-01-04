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
  default: 'bg-firebase-card text-firebase-text-primary border border-firebase-border',
  secondary: 'bg-firebase-card text-firebase-text-secondary border border-firebase-border',
  success: 'bg-firebase-success/20 text-firebase-success border border-firebase-success/30',
  warning: 'bg-firebase-warning/20 text-firebase-warning border border-firebase-warning/30',
  destructive: 'bg-firebase-error/20 text-firebase-error border border-firebase-error/30',
  outline: 'bg-transparent text-firebase-text-secondary border border-firebase-border',
}

export default function StatusBadge({
  children,
  variant = 'default',
  className = '',
}: StatusBadgeProps) {
  const baseClasses = 'px-2 py-1 rounded text-xs font-medium inline-flex items-center gap-1'
  const variantClasses = VARIANT_CLASSES[variant]

  return <span className={`${baseClasses} ${variantClasses} ${className}`.trim()}>{children}</span>
}

// Re-export variant type for external use
export type { BadgeVariant }
