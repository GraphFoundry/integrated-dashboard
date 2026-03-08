import { type LatestPerServiceTelemetryPoint } from './influx-telemetry-collector'
import { normalizeErrorRateForDisplay } from './normalization'

type DisplayedSystemComponentTableRow = {
  serviceId: string
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

type ValidateSystemComponentsTableInput = {
  latestPerServicePoints: ReadonlyArray<LatestPerServiceTelemetryPoint>
  displayedTableRows: ReadonlyArray<DisplayedSystemComponentTableRow>
  maxServicesValidated?: number
}

type SystemComponentsTableValidation = {
  serviceOrdering: SystemComponentsOrderingComparison
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

function deriveExpectedServiceOrdering(input: {
  latestPerServicePoints: ReadonlyArray<LatestPerServiceTelemetryPoint>
  maxServicesValidated: number
}): ReadonlyArray<string> {
  return input.latestPerServicePoints
    .map((point, index) => ({
      serviceId: point.serviceKey,
      normalizedErrorRate: normalizeErrorRateForDisplay(
        toFiniteNumber(point.datapoint.errorRate)
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

function validateSystemComponentsTable(
  input: ValidateSystemComponentsTableInput
): SystemComponentsTableValidation {
  return {
    serviceOrdering: compareSystemComponentsServiceOrdering(input)
  }
}

export {
  compareSystemComponentsServiceOrdering,
  validateSystemComponentsTable,
  type DisplayedSystemComponentTableRow,
  type ValidateSystemComponentsTableInput,
  type SystemComponentsOrderingComparison,
  type SystemComponentsTableValidation
}
