/**
 * Format metric values with N/A fallback
 */
export function formatMetric(
  value: number | undefined,
  formatter: (val: number) => string
): string {
  if (value === undefined || value === null) return 'N/A'
  return formatter(value)
}

/**
 * Get risk color for styling (Canvas-compatible HSL values)
 */
export function getRiskColor(riskLevel: string): string {
  switch (riskLevel) {
    case 'CRITICAL':
      return '#ef4444' // red-500
    case 'HIGH':
      return '#f97316' // orange-500
    case 'MEDIUM':
      return '#eab308' // yellow-500
    case 'LOW':
      return '#22c55e' // green-500
    default:
      return '#94a3b8' // slate-400 (visible neutral)
  }
}

/**
 * Get risk badge styling
 */
export function getRiskBadgeClass(riskLevel: string): string {
  switch (riskLevel) {
    case 'CRITICAL':
      return 'bg-red-500/15 text-red-400 border-red-500/35'
    case 'HIGH':
      return 'bg-orange-500/15 text-orange-400 border-orange-500/35'
    case 'MEDIUM':
      return 'bg-yellow-500/15 text-yellow-400 border-yellow-500/35'
    case 'LOW':
      return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/35'
    default:
      return 'bg-[var(--surface-soft)] text-[var(--text-muted)] border-[var(--border)]'
  }
}
