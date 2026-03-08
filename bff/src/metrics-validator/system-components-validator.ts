import { type LatestPerServiceTelemetryPoint } from './influx-telemetry-collector'
import {
  formatLatencyForDisplay,
  formatPercentForDisplay,
  formatRequestRateForDisplay,
  formatSuccessRateFromErrorRateForDisplay,
  normalizeAvailabilityForDisplay,
  normalizeErrorRateForDisplay
} from './normalization'

type DisplayedSystemComponentTableRow = {
  serviceId: string
  traffic?: string
  successRate?: string
  slowEndResponseTime?: string
  uptime?: string
}

type SystemComponentsOrderingComparison = {
  metric: 'serviceOrdering'
  maxServicesValidated: number
  expectedServiceIds: ReadonlyArray<string>
  displayedServiceIds: ReadonlyArray<string>
  expectedCount: number
  displayedCount: number
  pass: boolean
}

type SystemComponentRowMetricName =
  | 'traffic'
  | 'successRate'
  | 'slowEndResponseTime'
  | 'uptime'

type SystemComponentRowMetricComparison = {
  metric: SystemComponentRowMetricName
  expected: string
  displayed: string
  absoluteDelta: number | null
  pass: boolean
}

type SystemComponentRowComparison = {
  serviceId: string
  pass: boolean
  traffic: SystemComponentRowMetricComparison
  successRate: SystemComponentRowMetricComparison
  slowEndResponseTime: SystemComponentRowMetricComparison
  uptime: SystemComponentRowMetricComparison
}

type SystemComponentsRowMetricValuesComparison = {
  metric: 'rowMetricValues'
  maxServicesValidated: number
  expectedRowCount: number
  displayedRowCount: number
  comparedServiceIds: ReadonlyArray<string>
  rowComparisons: ReadonlyArray<SystemComponentRowComparison>
  pass: boolean
}

type ValidateSystemComponentsTableInput = {
  latestPerServicePoints: ReadonlyArray<LatestPerServiceTelemetryPoint>
  displayedTableRows: ReadonlyArray<DisplayedSystemComponentTableRow>
  maxServicesValidated?: number
}

type SystemComponentsTableValidation = {
  serviceOrdering: SystemComponentsOrderingComparison
  rowMetricValues: SystemComponentsRowMetricValuesComparison
}

type SortedLatestPerServiceEntry = {
  serviceId: string
  normalizedErrorRate: number | null
  requestRate: number | null
  p95Milliseconds: number | null
  normalizedUptimePercent: number | null
  index: number
}

type ExpectedSystemComponentRowValues = {
  serviceId: string
  traffic: string
  successRate: string
  slowEndResponseTime: string
  uptime: string
  rawTrafficRequestRate: number | null
  rawSuccessRatePercent: number | null
  rawSlowEndResponseTimeMilliseconds: number | null
  rawUptimePercent: number | null
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

function normalizeMaxServicesValidated(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 10
  }

  const normalized = Math.trunc(value)
  return normalized > 0 ? normalized : 10
}

function deriveSortedLatestPerServiceEntries(input: {
  latestPerServicePoints: ReadonlyArray<LatestPerServiceTelemetryPoint>
  maxServicesValidated: number
}): ReadonlyArray<SortedLatestPerServiceEntry> {
  return input.latestPerServicePoints
    .map((point, index) => ({
      serviceId: point.serviceKey,
      normalizedErrorRate: normalizeErrorRateForDisplay(
        toFiniteNumber(point.datapoint.errorRate)
      ),
      requestRate: toFiniteNumber(point.datapoint.requestRate),
      p95Milliseconds: toFiniteNumber(point.datapoint.p95),
      normalizedUptimePercent: normalizeAvailabilityForDisplay(
        toFiniteNumber(point.datapoint.availability)
      ),
      index
    }))
    .sort((a, b) => {
      const aError = a.normalizedErrorRate
      const bError = b.normalizedErrorRate

      if (aError === null && bError === null) {
        return a.index - b.index
      }

      if (aError === null) {
        return 1
      }

      if (bError === null) {
        return -1
      }

      return bError - aError || a.index - b.index
    })
    .slice(0, input.maxServicesValidated)
}

function deriveExpectedServiceOrdering(input: {
  latestPerServicePoints: ReadonlyArray<LatestPerServiceTelemetryPoint>
  maxServicesValidated: number
}): ReadonlyArray<string> {
  return deriveSortedLatestPerServiceEntries(input)
    .map((entry) => entry.serviceId)
}

function compareSystemComponentsServiceOrdering(
  input: ValidateSystemComponentsTableInput
): SystemComponentsOrderingComparison {
  const maxServicesValidated = normalizeMaxServicesValidated(input.maxServicesValidated)
  const expectedServiceIds = deriveExpectedServiceOrdering({
    latestPerServicePoints: input.latestPerServicePoints,
    maxServicesValidated
  })
  const displayedServiceIds = input.displayedTableRows.map((row) => row.serviceId.trim())

  const pass =
    expectedServiceIds.length === displayedServiceIds.length &&
    expectedServiceIds.every(
      (serviceId, index) => displayedServiceIds[index] === serviceId
    )

  return {
    metric: 'serviceOrdering',
    maxServicesValidated,
    expectedServiceIds,
    displayedServiceIds,
    expectedCount: expectedServiceIds.length,
    displayedCount: displayedServiceIds.length,
    pass
  }
}

function deriveExpectedSystemComponentRowValues(input: {
  latestPerServicePoints: ReadonlyArray<LatestPerServiceTelemetryPoint>
  maxServicesValidated: number
}): ReadonlyArray<ExpectedSystemComponentRowValues> {
  return deriveSortedLatestPerServiceEntries(input).map((entry) => {
    const successRatePercent =
      entry.normalizedErrorRate === null ? null : 100 - entry.normalizedErrorRate

    return {
      serviceId: entry.serviceId,
      traffic: formatRequestRateForDisplay(entry.requestRate),
      successRate: formatSuccessRateFromErrorRateForDisplay(entry.normalizedErrorRate),
      slowEndResponseTime: formatLatencyForDisplay(entry.p95Milliseconds),
      uptime: formatPercentForDisplay(entry.normalizedUptimePercent),
      rawTrafficRequestRate: entry.requestRate,
      rawSuccessRatePercent: successRatePercent,
      rawSlowEndResponseTimeMilliseconds: entry.p95Milliseconds,
      rawUptimePercent: entry.normalizedUptimePercent
    }
  })
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

function compareSystemComponentRowMetricValue(input: {
  metric: SystemComponentRowMetricName
  expected: string
  displayedValue: string | undefined
  expectedRaw: number | null
  parseDisplayed: (value: string) => number | null
}): SystemComponentRowMetricComparison {
  const displayed = typeof input.displayedValue === 'string' ? input.displayedValue.trim() : ''
  const pass = input.expected === displayed

  const displayedRaw = displayed.length > 0 ? input.parseDisplayed(displayed) : null
  const absoluteDelta =
    input.expectedRaw !== null && displayedRaw !== null
      ? Math.abs(input.expectedRaw - displayedRaw)
      : pass
        ? 0
        : null

  return {
    metric: input.metric,
    expected: input.expected,
    displayed,
    absoluteDelta,
    pass
  }
}

function compareSystemComponentsRowMetricValues(
  input: ValidateSystemComponentsTableInput
): SystemComponentsRowMetricValuesComparison {
  const maxServicesValidated = normalizeMaxServicesValidated(input.maxServicesValidated)
  const expectedRows = deriveExpectedSystemComponentRowValues({
    latestPerServicePoints: input.latestPerServicePoints,
    maxServicesValidated
  })
  const displayedRowsByServiceId = new Map<string, DisplayedSystemComponentTableRow>()

  for (const row of input.displayedTableRows) {
    const serviceId = row.serviceId.trim()
    if (!displayedRowsByServiceId.has(serviceId)) {
      displayedRowsByServiceId.set(serviceId, row)
    }
  }

  const rowComparisons = expectedRows.map((expectedRow) => {
    const displayedRow = displayedRowsByServiceId.get(expectedRow.serviceId)
    const traffic = compareSystemComponentRowMetricValue({
      metric: 'traffic',
      expected: expectedRow.traffic,
      displayedValue: displayedRow?.traffic,
      expectedRaw: expectedRow.rawTrafficRequestRate,
      parseDisplayed: parseDisplayedRequestRate
    })
    const successRate = compareSystemComponentRowMetricValue({
      metric: 'successRate',
      expected: expectedRow.successRate,
      displayedValue: displayedRow?.successRate,
      expectedRaw: expectedRow.rawSuccessRatePercent,
      parseDisplayed: parseDisplayedPercent
    })
    const slowEndResponseTime = compareSystemComponentRowMetricValue({
      metric: 'slowEndResponseTime',
      expected: expectedRow.slowEndResponseTime,
      displayedValue: displayedRow?.slowEndResponseTime,
      expectedRaw: expectedRow.rawSlowEndResponseTimeMilliseconds,
      parseDisplayed: parseDisplayedLatencyMilliseconds
    })
    const uptime = compareSystemComponentRowMetricValue({
      metric: 'uptime',
      expected: expectedRow.uptime,
      displayedValue: displayedRow?.uptime,
      expectedRaw: expectedRow.rawUptimePercent,
      parseDisplayed: parseDisplayedPercent
    })

    return {
      serviceId: expectedRow.serviceId,
      pass: traffic.pass && successRate.pass && slowEndResponseTime.pass && uptime.pass,
      traffic,
      successRate,
      slowEndResponseTime,
      uptime
    }
  })

  const hasMatchingRowCount = expectedRows.length === input.displayedTableRows.length
  const pass = hasMatchingRowCount && rowComparisons.every((comparison) => comparison.pass)

  return {
    metric: 'rowMetricValues',
    maxServicesValidated,
    expectedRowCount: expectedRows.length,
    displayedRowCount: input.displayedTableRows.length,
    comparedServiceIds: expectedRows.map((row) => row.serviceId),
    rowComparisons,
    pass
  }
}

function validateSystemComponentsTable(
  input: ValidateSystemComponentsTableInput
): SystemComponentsTableValidation {
  return {
    serviceOrdering: compareSystemComponentsServiceOrdering(input),
    rowMetricValues: compareSystemComponentsRowMetricValues(input)
  }
}

export {
  compareSystemComponentsServiceOrdering,
  compareSystemComponentsRowMetricValues,
  validateSystemComponentsTable,
  type DisplayedSystemComponentTableRow,
  type ValidateSystemComponentsTableInput,
  type SystemComponentsOrderingComparison,
  type SystemComponentRowMetricComparison,
  type SystemComponentRowComparison,
  type SystemComponentsRowMetricValuesComparison,
  type SystemComponentsTableValidation
}
