import { type LatestPerServiceTelemetryPoint } from './influx-telemetry-collector'
import { formatRequestRateForDisplay } from './normalization'

type TrafficVolumeCardComparison = {
  metric: 'trafficVolume'
  expected: string
  displayed: string
  absoluteDelta: number | null
  pass: boolean
  expectedRawRequestRate: number | null
  displayedRawRequestRate: number | null
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

function parseDisplayedRequestRate(value: string): number | null {
  const normalized = value.trim()
  if (normalized === 'N/A' || normalized === '<0.0001') {
    return null
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

export { compareTrafficVolumeSummaryCard, type TrafficVolumeCardComparison }
