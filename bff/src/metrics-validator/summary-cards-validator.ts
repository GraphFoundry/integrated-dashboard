import { type LatestPerServiceTelemetryPoint } from './influx-telemetry-collector'
import {
  formatLatencyForDisplay,
  formatPercentForDisplay,
  formatRequestRateForDisplay,
  normalizeAvailabilityForDisplay,
  normalizeErrorRateForDisplay
} from './normalization'

type SummaryCardComparisonEnvelope = {
  expected: string
  displayed: string
  absoluteDelta: number | null
  pass: boolean
}

type TrafficVolumeCardComparison = SummaryCardComparisonEnvelope & {
  metric: 'trafficVolume'
  expectedRawRequestRate: number | null
  displayedRawRequestRate: number | null
}

type SystemHealthCardComparison = SummaryCardComparisonEnvelope & {
  metric: 'systemHealth'
  expectedRawHealthScore: number | null
  displayedRawHealthScore: number | null
}

type SpeedCardComparison = SummaryCardComparisonEnvelope & {
  metric: 'speed'
  expectedRawP95Milliseconds: number | null
  displayedRawP95Milliseconds: number | null
}

type UptimeReliabilityCardComparison = SummaryCardComparisonEnvelope & {
  metric: 'uptimeReliability'
  expectedRawUptimeReliabilityPercent: number | null
  displayedRawUptimeReliabilityPercent: number | null
}

type DisplayedSummaryCardValues = {
  trafficVolume: string
  systemHealth: string
  speed: string
  uptimeReliability: string
}

type ValidateVitalSignsSummaryCardsInput = {
  latestPerServicePoints: ReadonlyArray<LatestPerServiceTelemetryPoint>
  displayedSummaryCards: DisplayedSummaryCardValues
}

type VitalSignsSummaryCardsValidation = {
  trafficVolume: TrafficVolumeCardComparison
  systemHealth: SystemHealthCardComparison
  speed: SpeedCardComparison
  uptimeReliability: UptimeReliabilityCardComparison
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

function computeExpectedTrafficVolumeRequestRate(
  latestPerServicePoints: ReadonlyArray<LatestPerServiceTelemetryPoint>
): number | null {
  if (latestPerServicePoints.length === 0) {
    return null
  }

  return latestPerServicePoints.reduce((sum, point) => {
    const requestRate = toFiniteNumber(point.datapoint.requestRate)
    if (requestRate === null || requestRate <= 0) {
      return sum
    }
    return sum + requestRate
  }, 0)
}

function computeExpectedSpeedP95Milliseconds(
  latestPerServicePoints: ReadonlyArray<LatestPerServiceTelemetryPoint>
): number | null {
  if (latestPerServicePoints.length === 0) {
    return null
  }

  const p95Values = latestPerServicePoints
    .map((point) => toFiniteNumber(point.datapoint.p95))
    .filter((value): value is number => value !== null)

  if (p95Values.length === 0) {
    return null
  }

  return Math.max(...p95Values)
}

function average(values: ReadonlyArray<number>): number | null {
  if (values.length === 0) {
    return null
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function computeExpectedSystemHealthScore(
  latestPerServicePoints: ReadonlyArray<LatestPerServiceTelemetryPoint>
): number | null {
  if (latestPerServicePoints.length === 0) {
    return null
  }

  const weightedErrorPairs = latestPerServicePoints
    .map((point) => {
      const rate = toFiniteNumber(point.datapoint.requestRate)
      const errorRate = normalizeErrorRateForDisplay(
        toFiniteNumber(point.datapoint.errorRate)
      )
      if (rate === null || errorRate === null || rate <= 0) {
        return null
      }

      return { rate, errorRate }
    })
    .filter((pair): pair is { rate: number; errorRate: number } => pair !== null)

  const weightedRateTotal = weightedErrorPairs.reduce((sum, pair) => sum + pair.rate, 0)
  const weightedErrorSum = weightedErrorPairs.reduce(
    (sum, pair) => sum + pair.rate * pair.errorRate,
    0
  )

  const fallbackErrorRateAverage = average(
    latestPerServicePoints
      .map((point) =>
        normalizeErrorRateForDisplay(toFiniteNumber(point.datapoint.errorRate))
      )
      .filter((errorRate): errorRate is number => errorRate !== null)
  )

  const effectiveErrorRate =
    weightedRateTotal > 0
      ? weightedErrorSum / weightedRateTotal
      : fallbackErrorRateAverage

  if (effectiveErrorRate === null) {
    return null
  }

  return 100 - effectiveErrorRate
}

function computeExpectedUptimeReliabilityScore(
  latestPerServicePoints: ReadonlyArray<LatestPerServiceTelemetryPoint>
): number | null {
  if (latestPerServicePoints.length === 0) {
    return null
  }

  const availabilityValues = latestPerServicePoints
    .map((point) =>
      normalizeAvailabilityForDisplay(toFiniteNumber(point.datapoint.availability))
    )
    .filter((availability): availability is number => availability !== null)

  return average(availabilityValues)
}

function parseDisplayedRequestRate(value: string): number | null {
  const normalized = value.trim()
  if (normalized === 'N/A' || normalized === '<0.0001') {
    return null
  }

  return toFiniteNumber(normalized)
}

function parseDisplayedPercent(value: string): number | null {
  const normalized = value.trim()
  if (normalized === 'N/A') {
    return null
  }

  const withoutPercentSuffix = normalized.endsWith('%')
    ? normalized.slice(0, -1).trim()
    : normalized
  return toFiniteNumber(withoutPercentSuffix)
}

function parseDisplayedLatencyMilliseconds(value: string): number | null {
  const normalized = value.trim()
  if (normalized === 'N/A') {
    return null
  }

  const withUnitMatch = normalized.match(/^(-?\d+(?:\.\d+)?)\s*(μs|ms|s)$/)
  if (withUnitMatch) {
    const magnitude = toFiniteNumber(withUnitMatch[1])
    if (magnitude === null) {
      return null
    }

    const unit = withUnitMatch[2]
    if (unit === 'μs') {
      return magnitude / 1000
    }

    if (unit === 'ms') {
      return magnitude
    }

    return magnitude * 1000
  }

  return toFiniteNumber(normalized)
}

function compareTrafficVolumeSummaryCard(input: {
  latestPerServicePoints: ReadonlyArray<LatestPerServiceTelemetryPoint>
  displayedTrafficVolume: string
}): TrafficVolumeCardComparison {
  const expectedRawRequestRate = computeExpectedTrafficVolumeRequestRate(
    input.latestPerServicePoints
  )
  const expected = formatRequestRateForDisplay(expectedRawRequestRate)
  const displayed = input.displayedTrafficVolume.trim()
  const pass = expected === displayed

  const displayedRawRequestRate = parseDisplayedRequestRate(displayed)
  const absoluteDelta =
    expectedRawRequestRate !== null && displayedRawRequestRate !== null
      ? Math.abs(expectedRawRequestRate - displayedRawRequestRate)
      : pass
        ? 0
        : null

  return {
    metric: 'trafficVolume',
    expected,
    displayed,
    absoluteDelta,
    pass,
    expectedRawRequestRate,
    displayedRawRequestRate
  }
}

function compareSystemHealthSummaryCard(input: {
  latestPerServicePoints: ReadonlyArray<LatestPerServiceTelemetryPoint>
  displayedSystemHealth: string
}): SystemHealthCardComparison {
  const expectedRawHealthScore = computeExpectedSystemHealthScore(
    input.latestPerServicePoints
  )
  const expected = formatPercentForDisplay(expectedRawHealthScore)
  const displayed = input.displayedSystemHealth.trim()
  const pass = expected === displayed

  const displayedRawHealthScore = parseDisplayedPercent(displayed)
  const absoluteDelta =
    expectedRawHealthScore !== null && displayedRawHealthScore !== null
      ? Math.abs(expectedRawHealthScore - displayedRawHealthScore)
      : pass
        ? 0
        : null

  return {
    metric: 'systemHealth',
    expected,
    displayed,
    absoluteDelta,
    pass,
    expectedRawHealthScore,
    displayedRawHealthScore
  }
}

function compareSpeedSummaryCard(input: {
  latestPerServicePoints: ReadonlyArray<LatestPerServiceTelemetryPoint>
  displayedSpeed: string
}): SpeedCardComparison {
  const expectedRawP95Milliseconds = computeExpectedSpeedP95Milliseconds(
    input.latestPerServicePoints
  )
  const expected = formatLatencyForDisplay(expectedRawP95Milliseconds)
  const displayed = input.displayedSpeed.trim()
  const pass = expected === displayed

  const displayedRawP95Milliseconds = parseDisplayedLatencyMilliseconds(displayed)
  const absoluteDelta =
    expectedRawP95Milliseconds !== null && displayedRawP95Milliseconds !== null
      ? Math.abs(expectedRawP95Milliseconds - displayedRawP95Milliseconds)
      : pass
        ? 0
        : null

  return {
    metric: 'speed',
    expected,
    displayed,
    absoluteDelta,
    pass,
    expectedRawP95Milliseconds,
    displayedRawP95Milliseconds
  }
}

function compareUptimeReliabilitySummaryCard(input: {
  latestPerServicePoints: ReadonlyArray<LatestPerServiceTelemetryPoint>
  displayedUptimeReliability: string
}): UptimeReliabilityCardComparison {
  const expectedRawUptimeReliabilityPercent = computeExpectedUptimeReliabilityScore(
    input.latestPerServicePoints
  )
  const expected = formatPercentForDisplay(expectedRawUptimeReliabilityPercent)
  const displayed = input.displayedUptimeReliability.trim()
  const pass = expected === displayed

  const displayedRawUptimeReliabilityPercent = parseDisplayedPercent(displayed)
  const absoluteDelta =
    expectedRawUptimeReliabilityPercent !== null &&
    displayedRawUptimeReliabilityPercent !== null
      ? Math.abs(
          expectedRawUptimeReliabilityPercent -
            displayedRawUptimeReliabilityPercent
        )
      : pass
        ? 0
        : null

  return {
    metric: 'uptimeReliability',
    expected,
    displayed,
    absoluteDelta,
    pass,
    expectedRawUptimeReliabilityPercent,
    displayedRawUptimeReliabilityPercent
  }
}

function validateVitalSignsSummaryCards(
  input: ValidateVitalSignsSummaryCardsInput
): VitalSignsSummaryCardsValidation {
  return {
    trafficVolume: compareTrafficVolumeSummaryCard({
      latestPerServicePoints: input.latestPerServicePoints,
      displayedTrafficVolume: input.displayedSummaryCards.trafficVolume
    }),
    systemHealth: compareSystemHealthSummaryCard({
      latestPerServicePoints: input.latestPerServicePoints,
      displayedSystemHealth: input.displayedSummaryCards.systemHealth
    }),
    speed: compareSpeedSummaryCard({
      latestPerServicePoints: input.latestPerServicePoints,
      displayedSpeed: input.displayedSummaryCards.speed
    }),
    uptimeReliability: compareUptimeReliabilitySummaryCard({
      latestPerServicePoints: input.latestPerServicePoints,
      displayedUptimeReliability: input.displayedSummaryCards.uptimeReliability
    })
  }
}

export {
  compareTrafficVolumeSummaryCard,
  compareSystemHealthSummaryCard,
  compareSpeedSummaryCard,
  compareUptimeReliabilitySummaryCard,
  validateVitalSignsSummaryCards,
  type SummaryCardComparisonEnvelope,
  type DisplayedSummaryCardValues,
  type ValidateVitalSignsSummaryCardsInput,
  type VitalSignsSummaryCardsValidation,
  type TrafficVolumeCardComparison,
  type SystemHealthCardComparison,
  type SpeedCardComparison,
  type UptimeReliabilityCardComparison
}
