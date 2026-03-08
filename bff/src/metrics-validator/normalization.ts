function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function clampToPercentageRange(value: number): number {
  if (value < 0) {
    return 0
  }

  if (value > 100) {
    return 100
  }

  return value
}

/**
 * Normalize telemetry values to dashboard percentage form.
 * Fractions in [0, 1] are converted to percentage points.
 * Values > 1 are treated as already-percent and clamped to 100 max.
 */
function normalizePercentageMetricForDisplay(
  value: number | null | undefined
): number | null {
  if (!isFiniteNumber(value)) {
    return null
  }

  if (value <= 1) {
    return clampToPercentageRange(value * 100)
  }

  return clampToPercentageRange(value)
}

/**
 * Normalize error-rate telemetry to dashboard percentage form.
 */
export function normalizeErrorRateForDisplay(
  value: number | null | undefined
): number | null {
  return normalizePercentageMetricForDisplay(value)
}

/**
 * Normalize availability telemetry to dashboard percentage form.
 */
export function normalizeAvailabilityForDisplay(
  value: number | null | undefined
): number | null {
  return normalizePercentageMetricForDisplay(value)
}

/**
 * Format request-rate values to match dashboard card/table display.
 */
export function formatRequestRateForDisplay(
  value: number | null | undefined
): string {
  if (!isFiniteNumber(value)) {
    return 'N/A'
  }

  if (value > 0 && value < 0.0001) {
    return '<0.0001'
  }

  return value.toFixed(2)
}

/**
 * Format percentage values to match dashboard card/table display.
 */
export function formatPercentForDisplay(
  value: number | null | undefined,
  decimals: number = 2
): string {
  if (!isFiniteNumber(value)) {
    return 'N/A'
  }

  return `${value.toFixed(decimals)}%`
}

/**
 * Format latency to match dashboard card/table display.
 */
export function formatLatencyForDisplay(
  milliseconds: number | null | undefined
): string {
  if (!isFiniteNumber(milliseconds)) {
    return 'N/A'
  }

  if (milliseconds < 1) {
    return `${(milliseconds * 1000).toFixed(0)}μs`
  }

  if (milliseconds < 1000) {
    return `${milliseconds.toFixed(0)}ms`
  }

  return `${(milliseconds / 1000).toFixed(2)}s`
}

/**
 * Success-rate display in the dashboard table is derived from normalized error-rate.
 */
export function formatSuccessRateFromErrorRateForDisplay(
  normalizedErrorRatePercent: number | null | undefined
): string {
  if (!isFiniteNumber(normalizedErrorRatePercent)) {
    return 'N/A'
  }

  return formatPercentForDisplay(100 - normalizedErrorRatePercent)
}
