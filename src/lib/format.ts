/**
 * Format milliseconds to human-readable string
 */
export function formatMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || Number.isNaN(ms)) return 'N/A'
  if (ms < 1) return `${(ms * 1000).toFixed(0)}μs`
  if (ms < 1000) return `${ms.toFixed(0)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

/**
 * Format percentage with specified decimals
 */
export function formatPercent(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return 'N/A'
  return `${value.toFixed(decimals)}%`
}

/**
 * Format requests per second
 */
export function formatRps(rps: number | null | undefined, decimals = 2): string {
  if (rps === null || rps === undefined || Number.isNaN(rps)) return 'N/A'
  return rps.toFixed(decimals)
}

/**
 * Format timestamp to human-readable date/time
 */
export function formatDate(timestamp: string | Date): string {
  try {
    const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp
    if (Number.isNaN(date.getTime())) return 'N/A'
    return date.toLocaleString()
  } catch {
    return 'N/A'
  }
}

/**
 * Format short timestamp (relative or short absolute)
 */
export function formatShortDate(timestamp: string | Date): string {
  try {
    const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp
    if (Number.isNaN(date.getTime())) return 'N/A'

    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`

    return date.toLocaleDateString()
  } catch {
    return 'N/A'
  }
}

/**
 * Format count with K/M suffixes
 */
export function formatCount(count: number | null | undefined): string {
  if (count === null || count === undefined || Number.isNaN(count)) return 'N/A'
  if (count < 1000) return count.toString()
  if (count < 1000000) return `${(count / 1000).toFixed(1)}K`
  return `${(count / 1000000).toFixed(1)}M`
}
