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
  rawTelemetryPoints: ReadonlyArray<Record<string, unknown>>
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
  rawTelemetryPoints: ReadonlyArray<Record<string, unknown>>
): number | null {
  if (rawTelemetryPoints.length === 0) {
    return null
  }

  const totalsByTimestamp = new Map<string, number>()
  rawTelemetryPoints.forEach((point, index) => {
    const requestRate = toFiniteNumber(point.requestRate)
    if (requestRate === null) {
      return
    }

    const timestampValue = point.timestamp
    const timestampKey =
      (typeof timestampValue === 'string' && timestampValue.trim().length > 0)
        ? timestampValue
        : `unknown-${index}`

    totalsByTimestamp.set(
      timestampKey,
      (totalsByTimestamp.get(timestampKey) ?? 0) + requestRate
    )
  })

  return average(Array.from(totalsByTimestamp.values()))
}

function computeExpectedSpeedP95Milliseconds(
  rawTelemetryPoints: ReadonlyArray<Record<string, unknown>>
): number | null {
  if (rawTelemetryPoints.length === 0) {
    return null
  }

  const p95Values = rawTelemetryPoints
    .map((point) => toFiniteNumber(point.p95))
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
  rawTelemetryPoints: ReadonlyArray<Record<string, unknown>>
): number | null {
  if (rawTelemetryPoints.length === 0) {
    return null
  }

  const weightedErrorPairs = rawTelemetryPoints
    .map((point) => {
      const rate = toFiniteNumber(point.requestRate)
      const errorRate = normalizeErrorRateForDisplay(
        toFiniteNumber(point.errorRate)
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
    rawTelemetryPoints
      .map((point) =>
        normalizeErrorRateForDisplay(toFiniteNumber(point.errorRate))
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
  rawTelemetryPoints: ReadonlyArray<Record<string, unknown>>
): number | null {
  if (rawTelemetryPoints.length === 0) {
    return null
  }

  const availabilityValues = rawTelemetryPoints
    .map((point) =>
      normalizeAvailabilityForDisplay(toFiniteNumber(point.availability))
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
  rawTelemetryPoints: ReadonlyArray<Record<string, unknown>>
  displayedTrafficVolume: string
}): TrafficVolumeCardComparison {
  const expectedRawRequestRate = computeExpectedTrafficVolumeRequestRate(
    input.rawTelemetryPoints
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
  rawTelemetryPoints: ReadonlyArray<Record<string, unknown>>
  displayedSystemHealth: string
}): SystemHealthCardComparison {
  const expectedRawHealthScore = computeExpectedSystemHealthScore(
    input.rawTelemetryPoints
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
  rawTelemetryPoints: ReadonlyArray<Record<string, unknown>>
  displayedSpeed: string
}): SpeedCardComparison {
  const expectedRawP95Milliseconds = computeExpectedSpeedP95Milliseconds(
    input.rawTelemetryPoints
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
  rawTelemetryPoints: ReadonlyArray<Record<string, unknown>>
  displayedUptimeReliability: string
}): UptimeReliabilityCardComparison {
  const expectedRawUptimeReliabilityPercent = computeExpectedUptimeReliabilityScore(
    input.rawTelemetryPoints
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
      rawTelemetryPoints: input.rawTelemetryPoints,
      displayedTrafficVolume: input.displayedSummaryCards.trafficVolume
    }),
    systemHealth: compareSystemHealthSummaryCard({
      rawTelemetryPoints: input.rawTelemetryPoints,
      displayedSystemHealth: input.displayedSummaryCards.systemHealth
    }),
    speed: compareSpeedSummaryCard({
      rawTelemetryPoints: input.rawTelemetryPoints,
      displayedSpeed: input.displayedSummaryCards.speed
    }),
    uptimeReliability: compareUptimeReliabilitySummaryCard({
      rawTelemetryPoints: input.rawTelemetryPoints,
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
