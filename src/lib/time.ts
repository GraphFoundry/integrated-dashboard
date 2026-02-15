/** Maps human-readable time range labels to milliseconds. */
export const TIME_RANGES = {
  '30s': 30 * 1000,
  '1m': 60 * 1000,
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '30m': 30 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
} as const

export type TimeRangeKey = keyof typeof TIME_RANGES

/** Convert a time range label to milliseconds. Defaults to 1h if unknown. */
export function getTimeRangeMs(range: string): number {
  return TIME_RANGES[range as TimeRangeKey] ?? TIME_RANGES['1h']
}
