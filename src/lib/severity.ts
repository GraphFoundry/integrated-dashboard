export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'warning' | 'info'

/** Returns text color class for severity level (used in list views). */
export function getSeverityTextColor(severity: string): string {
  switch (severity) {
    case 'critical': return 'text-red-500'
    case 'high':     return 'text-orange-500'
    case 'medium':   return 'text-yellow-500'
    case 'low':      return 'text-blue-500'
    default:         return 'text-gray-500'
  }
}

/** Returns bg + text + border classes for severity badges (used in detail views). */
export function getSeverityBadgeClasses(severity: string): string {
  switch (severity) {
    case 'critical': return 'bg-red-500/20 text-red-400 border-red-500'
    case 'high':     return 'bg-orange-500/20 text-orange-400 border-orange-500'
    case 'medium':   return 'bg-yellow-500/20 text-yellow-400 border-yellow-500'
    case 'low':      return 'bg-blue-500/20 text-blue-400 border-blue-500'
    default:         return 'bg-gray-500/20 text-gray-400 border-gray-500'
  }
}
