import type { ServiceAdditionDependency } from '@/lib/types'

const SERVICE_ID_HINT = 'Format: namespace:name (e.g., default:productcatalog)'
const MISSING_DEPENDENCY_HINT = 'Select a dependency service.'
const UNKNOWN_SERVICE_HINT =
  'Service not found in graph. Select from the dropdown or check the service name.'
const DUPLICATE_SERVICE_HINT = 'Each dependency can appear only once in the chain.'

export function isValidLiveServiceId(serviceId: string): boolean {
  const trimmed = serviceId.trim()
  if (!trimmed) return false

  const parts = trimmed.split(':')
  if (parts.length !== 2) return false

  const [namespace, name] = parts
  return namespace.length > 0 && name.length > 0
}

export function normalizeLiveServiceInput(rawValue: string): string {
  const trimmed = rawValue.trim()
  if (!trimmed) return ''
  if (trimmed.includes(':')) return trimmed

  const labelledMatch = trimmed.match(/^([a-z0-9-]+)\s*\(([^)]+)\)(?:\s*-\s*.*)?$/i)
  if (labelledMatch) {
    const [, serviceName, namespace] = labelledMatch
    if (serviceName && namespace) return `${namespace}:${serviceName}`
  }

  return trimmed
}

export function getLiveServiceIdHint(
  candidateServiceId: string,
  availableServiceIds: ReadonlySet<string> | readonly string[]
): string | null {
  const normalized = normalizeLiveServiceInput(candidateServiceId)
  if (!normalized) return null
  if (!isValidLiveServiceId(normalized)) return SERVICE_ID_HINT

  const available = asServiceIdSet(availableServiceIds)
  if (available.size > 0 && !available.has(normalized)) {
    return UNKNOWN_SERVICE_HINT
  }

  return null
}

export function getDependencyChainErrors(
  rawValues: readonly string[],
  availableServiceIds: ReadonlySet<string> | readonly string[]
): string[] {
  const normalizedValues = rawValues.map(normalizeLiveServiceInput)
  const available = asServiceIdSet(availableServiceIds)
  const counts = new Map<string, number>()

  for (const value of normalizedValues) {
    if (!value) continue
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }

  return normalizedValues.map((value) => {
    if (!value) return MISSING_DEPENDENCY_HINT
    if (!isValidLiveServiceId(value)) return SERVICE_ID_HINT
    if (available.size > 0 && !available.has(value)) return UNKNOWN_SERVICE_HINT
    if ((counts.get(value) ?? 0) > 1) return DUPLICATE_SERVICE_HINT
    return ''
  })
}

export function buildDependencyChainPayload(
  rawValues: readonly string[]
): ServiceAdditionDependency[] {
  return rawValues
    .map(normalizeLiveServiceInput)
    .filter((value) => value.length > 0)
    .map((serviceId) => ({ serviceId, relation: 'calls' }))
}

export function buildDependencyChainPreview(
  serviceName: string,
  rawValues: readonly string[]
): string[] {
  const preview = []
  const trimmedServiceName = serviceName.trim()
  if (trimmedServiceName) {
    preview.push(trimmedServiceName)
  }

  for (const value of rawValues) {
    const normalized = normalizeLiveServiceInput(value)
    if (normalized) {
      preview.push(normalized)
    }
  }

  return preview
}

function asServiceIdSet(
  availableServiceIds: ReadonlySet<string> | readonly string[]
): ReadonlySet<string> {
  if (availableServiceIds instanceof Set) {
    return availableServiceIds
  }
  return new Set(availableServiceIds)
}
