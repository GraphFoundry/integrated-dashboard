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
