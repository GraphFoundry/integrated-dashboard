import { type MetricsPageDisplayedValues } from './metrics-page-browser'
import {
  normalizeAvailabilityForDisplay,
  normalizeErrorRateForDisplay
} from './normalization'

type DisplayedChartSeries = MetricsPageDisplayedValues['chartSeries']

type ValidateChartSeriesAgainstTelemetryInput = {
  rawTelemetryPoints: ReadonlyArray<Record<string, unknown>>
  telemetryStepSeconds: number
  displayedChartSeries: DisplayedChartSeries
  expectedStepSeconds?: number
}

type StepSecondsComparison = {
  expected: number
  actual: number
  pass: boolean
}

type NumericPointComparison = {
  index: number
  expectedTimestamp: string | null
  displayedTimestamp: string | null
  expectedValue: number | null
  displayedValue: number | null
  absoluteDelta: number | null
  pass: boolean
}

type NumericChartSeriesComparison = {
  metric: 'traffic' | 'failureRate' | 'uptime'
  expectedPointCount: number
  displayedPointCount: number
  pointComparisons: ReadonlyArray<NumericPointComparison>
  pass: boolean
}

type PercentilePointComparison = {
  expected: number | null
  displayed: number | null
  absoluteDelta: number | null
  pass: boolean
}

type ResponseSpeedPointComparison = {
  index: number
  expectedTimestamp: string | null
  displayedTimestamp: string | null
  timestampPass: boolean
  p50: PercentilePointComparison
  p95: PercentilePointComparison
  p99: PercentilePointComparison
  pass: boolean
}

type ResponseSpeedChartSeriesComparison = {
  metric: 'responseSpeed'
  expectedPointCount: number
  displayedPointCount: number
  optionalPercentiles: {
    p50: PercentileAvailabilityComparison
    p99: PercentileAvailabilityComparison
  }
  pointComparisons: ReadonlyArray<ResponseSpeedPointComparison>
  pass: boolean
}

type PercentileAvailabilityStatus = 'available' | 'absent'

type PercentileAvailabilityComparison = {
  expected: PercentileAvailabilityStatus
  displayed: PercentileAvailabilityStatus
  pass: boolean
}

type ChartSeriesValidation = {
  metric: 'chartSeries'
  stepSeconds: StepSecondsComparison
  traffic: NumericChartSeriesComparison
  failureRate: NumericChartSeriesComparison
  responseSpeed: ResponseSpeedChartSeriesComparison
  uptime: NumericChartSeriesComparison
  pass: boolean
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

function normalizeDisplayedPercentForComparison(value: number | null): number | null {
  if (value === null) {
    return null
  }

  if (value < 0) {
    return null
  }

  if (value < 1) {
    return value * 100
  }

  return Math.min(value, 100)
}

function toTimestampMs(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 1_000_000_000_000 ? value * 1000 : value
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }

    const numeric = Number(value)
    if (Number.isFinite(numeric)) {
      return toTimestampMs(numeric)
    }
  }

  return Number.NEGATIVE_INFINITY
}

function normalizeTimestampForComparison(value: unknown): string | null {
  const timestampMs = toTimestampMs(value)
  if (!Number.isFinite(timestampMs)) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim()
    }
    return null
  }

  return new Date(timestampMs).toISOString()
}

function sortTelemetryPointsByTimestamp(
  points: ReadonlyArray<Record<string, unknown>>
): ReadonlyArray<Record<string, unknown>> {
  return points
    .map((point, index) => ({
      point,
      index,
      timestampMs: toTimestampMs(point.timestamp)
    }))
    .sort((a, b) => {
      const aValid = Number.isFinite(a.timestampMs)
      const bValid = Number.isFinite(b.timestampMs)

      if (aValid && bValid) {
        return a.timestampMs - b.timestampMs || a.index - b.index
      }

      if (aValid) {
        return -1
      }

      if (bValid) {
        return 1
      }

      return a.index - b.index
    })
    .map((entry) => entry.point)
}

function compareNullableNumbers(expected: number | null, displayed: number | null): {
  absoluteDelta: number | null
  pass: boolean
} {
  if (expected === null && displayed === null) {
    return {
      absoluteDelta: 0,
      pass: true
    }
  }

  if (expected !== null && displayed !== null) {
    const absoluteDelta = Math.abs(expected - displayed)
    return {
      absoluteDelta,
      pass: absoluteDelta === 0
    }
  }

  return {
    absoluteDelta: null,
    pass: false
  }
}

function compareNumericChartSeries(input: {
  metric: NumericChartSeriesComparison['metric']
  expectedPoints: ReadonlyArray<{ timestamp: string; value: number | null }>
  displayedPoints: ReadonlyArray<{ timestamp: string; value: number | null }>
}): NumericChartSeriesComparison {
  const comparisonCount = Math.max(
    input.expectedPoints.length,
    input.displayedPoints.length
  )

  const pointComparisons = Array.from({ length: comparisonCount }, (_, index) => {
    const expectedPoint = input.expectedPoints[index] ?? null
    const displayedPoint = input.displayedPoints[index] ?? null

    const expectedTimestamp = expectedPoint?.timestamp ?? null
    const displayedTimestamp = displayedPoint?.timestamp ?? null
    const timestampPass =
      expectedTimestamp !== null &&
      displayedTimestamp !== null &&
      expectedTimestamp === displayedTimestamp

    const expectedValue = expectedPoint?.value ?? null
    const displayedValue = displayedPoint?.value ?? null
    const valueComparison = compareNullableNumbers(expectedValue, displayedValue)

    return {
      index,
      expectedTimestamp,
      displayedTimestamp,
      expectedValue,
      displayedValue,
      absoluteDelta: valueComparison.absoluteDelta,
      pass: timestampPass && valueComparison.pass
    }
  })

  const pass =
    input.expectedPoints.length === input.displayedPoints.length &&
    pointComparisons.every((point) => point.pass)

  return {
    metric: input.metric,
    expectedPointCount: input.expectedPoints.length,
    displayedPointCount: input.displayedPoints.length,
    pointComparisons,
    pass
  }
}

function compareOptionalPercentileValue(
  expected: number | undefined,
  displayed: number | undefined
): PercentilePointComparison {
  const comparison = compareNullableNumbers(
    expected ?? null,
    displayed ?? null
  )

  return {
    expected: expected ?? null,
    displayed: displayed ?? null,
    absoluteDelta: comparison.absoluteDelta,
    pass: comparison.pass
  }
}

function buildPercentileAvailabilityComparison(input: {
  telemetryHasData: boolean
  displayedHasData: boolean
}): PercentileAvailabilityComparison {
  const expected: PercentileAvailabilityStatus = input.telemetryHasData ? 'available' : 'absent'
  const displayed: PercentileAvailabilityStatus = input.displayedHasData ? 'available' : 'absent'

  return {
    expected,
    displayed,
    pass: expected === displayed
  }
}

function hasPercentileValues(
  points: ReadonlyArray<{
    p50?: number
    p99?: number
  }>,
  percentile: 'p50' | 'p99'
): boolean {
  return points.some((point) => typeof point[percentile] === 'number')
}

function compareResponseSpeedSeries(input: {
  expectedPoints: ReadonlyArray<{
    timestamp: string
    p50?: number
    p95?: number
    p99?: number
  }>
  displayedPoints: ReadonlyArray<{
    timestamp: string
    p50?: number
    p95?: number
    p99?: number
  }>
  displayedPercentileAvailability: {
    hasP50Data: boolean
    hasP99Data: boolean
  }
}): ResponseSpeedChartSeriesComparison {
  const comparisonCount = Math.max(
    input.expectedPoints.length,
    input.displayedPoints.length
  )

  const pointComparisons = Array.from({ length: comparisonCount }, (_, index) => {
    const expectedPoint = input.expectedPoints[index] ?? null
    const displayedPoint = input.displayedPoints[index] ?? null

    const expectedTimestamp = expectedPoint?.timestamp ?? null
    const displayedTimestamp = displayedPoint?.timestamp ?? null
    const timestampPass =
      expectedTimestamp !== null &&
      displayedTimestamp !== null &&
      expectedTimestamp === displayedTimestamp

    const p50 = compareOptionalPercentileValue(expectedPoint?.p50, displayedPoint?.p50)
    const p95 = compareOptionalPercentileValue(expectedPoint?.p95, displayedPoint?.p95)
    const p99 = compareOptionalPercentileValue(expectedPoint?.p99, displayedPoint?.p99)

    return {
      index,
      expectedTimestamp,
      displayedTimestamp,
      timestampPass,
      p50,
      p95,
      p99,
      pass: timestampPass && p50.pass && p95.pass && p99.pass
    }
  })

  const pass =
    input.expectedPoints.length === input.displayedPoints.length &&
    pointComparisons.every((point) => point.pass)

  const optionalPercentiles = {
    p50: buildPercentileAvailabilityComparison({
      telemetryHasData: hasPercentileValues(input.expectedPoints, 'p50'),
      displayedHasData: input.displayedPercentileAvailability.hasP50Data
    }),
    p99: buildPercentileAvailabilityComparison({
      telemetryHasData: hasPercentileValues(input.expectedPoints, 'p99'),
      displayedHasData: input.displayedPercentileAvailability.hasP99Data
    })
  }

  return {
    metric: 'responseSpeed',
    expectedPointCount: input.expectedPoints.length,
    displayedPointCount: input.displayedPoints.length,
    optionalPercentiles,
    pointComparisons,
    pass: pass && optionalPercentiles.p50.pass && optionalPercentiles.p99.pass
  }
}

function validateChartSeriesAgainstTelemetry(
  input: ValidateChartSeriesAgainstTelemetryInput
): ChartSeriesValidation {
  const expectedStepSeconds = Number.isFinite(input.expectedStepSeconds ?? 60)
    ? Math.trunc(input.expectedStepSeconds ?? 60)
    : 60
  const actualStepSeconds = Number.isFinite(input.telemetryStepSeconds)
    ? Math.trunc(input.telemetryStepSeconds)
    : Number.NaN

  const sortedTelemetryPoints = sortTelemetryPointsByTimestamp(input.rawTelemetryPoints)

  const expectedTrafficSeries = sortedTelemetryPoints.map((point) => ({
    timestamp: normalizeTimestampForComparison(point.timestamp) ?? '',
    value: toFiniteNumber(point.requestRate)
  }))
  const expectedFailureRateSeries = sortedTelemetryPoints.map((point) => ({
    timestamp: normalizeTimestampForComparison(point.timestamp) ?? '',
    value: normalizeErrorRateForDisplay(toFiniteNumber(point.errorRate))
  }))
  const expectedResponseSpeedSeries = sortedTelemetryPoints.map((point) => {
    const p50 = toFiniteNumber(point.p50)
    const p95 = toFiniteNumber(point.p95)
    const p99 = toFiniteNumber(point.p99)

    return {
      timestamp: normalizeTimestampForComparison(point.timestamp) ?? '',
      p50: p50 ?? undefined,
      p95: p95 ?? undefined,
      p99: p99 ?? undefined
    }
  })
  const expectedUptimeSeries = sortedTelemetryPoints
    .map((point) => ({
      timestamp: normalizeTimestampForComparison(point.timestamp) ?? '',
      value: normalizeAvailabilityForDisplay(toFiniteNumber(point.availability))
    }))
    .filter((point): point is { timestamp: string; value: number } => point.value !== null)

  const displayedTrafficSeries = input.displayedChartSeries.traffic.map((point) => ({
    timestamp: normalizeTimestampForComparison(point.timestamp) ?? '',
    value: point.value
  }))
  const displayedFailureRateSeries = input.displayedChartSeries.failureRate.map((point) => ({
    timestamp: normalizeTimestampForComparison(point.timestamp) ?? '',
    value: normalizeDisplayedPercentForComparison(toFiniteNumber(point.value))
  }))
  const displayedResponseSpeedSeries = input.displayedChartSeries.responseSpeed.map((point) => ({
    timestamp: normalizeTimestampForComparison(point.timestamp) ?? '',
    p50: point.p50,
    p95: point.p95,
    p99: point.p99
  }))
  const displayedUptimeSeries = input.displayedChartSeries.uptime.map((point) => ({
    timestamp: normalizeTimestampForComparison(point.timestamp) ?? '',
    value: normalizeDisplayedPercentForComparison(toFiniteNumber(point.value))
  }))

  const traffic = compareNumericChartSeries({
    metric: 'traffic',
    expectedPoints: expectedTrafficSeries,
    displayedPoints: displayedTrafficSeries
  })
  const failureRate = compareNumericChartSeries({
    metric: 'failureRate',
    expectedPoints: expectedFailureRateSeries,
    displayedPoints: displayedFailureRateSeries
  })
  const responseSpeed = compareResponseSpeedSeries({
    expectedPoints: expectedResponseSpeedSeries,
    displayedPoints: displayedResponseSpeedSeries,
    displayedPercentileAvailability: {
      hasP50Data: input.displayedChartSeries.hasP50Data,
      hasP99Data: input.displayedChartSeries.hasP99Data
    }
  })
  const uptime = compareNumericChartSeries({
    metric: 'uptime',
    expectedPoints: expectedUptimeSeries,
    displayedPoints: displayedUptimeSeries
  })

  const stepSeconds = {
    expected: expectedStepSeconds,
    actual: actualStepSeconds,
    pass: actualStepSeconds === expectedStepSeconds
  }

  return {
    metric: 'chartSeries',
    stepSeconds,
    traffic,
    failureRate,
    responseSpeed,
    uptime,
    pass:
      stepSeconds.pass &&
      traffic.pass &&
      failureRate.pass &&
      responseSpeed.pass &&
      uptime.pass
  }
}

export {
  validateChartSeriesAgainstTelemetry,
  type ChartSeriesValidation,
  type ValidateChartSeriesAgainstTelemetryInput,
  type NumericChartSeriesComparison,
  type ResponseSpeedChartSeriesComparison,
  type StepSecondsComparison
}
