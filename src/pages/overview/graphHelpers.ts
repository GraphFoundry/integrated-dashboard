/**
 * Format metric values with N/A fallback
 */
export function formatMetric(value: number | undefined, formatter: (val: number) => string): string {
  if (value === undefined || value === null) return 'N/A'
  return formatter(value)
}

/**
 * Get risk color for styling
 */
export function getRiskColor(riskLevel: string): string {
  switch (riskLevel) {
    case 'CRITICAL':
      return '#dc2626' // red-600
    case 'HIGH':
      return '#ef4444' // red-400
    case 'MEDIUM':
      return '#facc15' // yellow-400
    case 'LOW':
      return '#4ade80' // green-400
    default:
      return '#94a3b8' // slate-400
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
