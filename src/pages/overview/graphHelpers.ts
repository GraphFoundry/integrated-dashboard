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
      return 'bg-red-900/40 text-red-200 border-red-700'
    case 'HIGH':
      return 'bg-red-900/30 text-red-300 border-red-700'
    case 'MEDIUM':
      return 'bg-yellow-900/30 text-yellow-300 border-yellow-700'
    case 'LOW':
      return 'bg-green-900/30 text-green-300 border-green-700'
    default:
      return 'bg-slate-900/30 text-slate-400 border-slate-700'
  }
}
