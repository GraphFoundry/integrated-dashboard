import type { DecisionRecord } from '@/lib/types'

type UnknownRecord = Record<string, unknown>

type ImpactedServiceLike = {
  serviceId?: string
  name?: string
  namespace?: string
  role?: string
}

function toRecord(value: unknown): UnknownRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  return value as UnknownRecord
}

function getCollectionItems(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value
  }
  const record = toRecord(value)
  if (record && Array.isArray(record.items)) {
    return record.items
  }
  return []
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function normalizeImpactedService(value: unknown): ImpactedServiceLike | null {
  const record = toRecord(value)
  if (!record) {
    return null
  }

  const serviceId = getString(record.serviceId) ?? getString(record.id)
  const name = getString(record.name)
  const namespace = getString(record.namespace)
  const role = getString(record.role)?.toLowerCase()

  return {
    serviceId,
    name: name ?? serviceId?.split(':').at(-1),
    namespace: namespace ?? serviceId?.split(':')[0],
    role,
  }
}

function getNormalizedImpactedServices(result: UnknownRecord): ImpactedServiceLike[] {
  return getCollectionItems(result.impactedServices)
    .map(normalizeImpactedService)
    .filter((service): service is ImpactedServiceLike => service !== null)
}

function uniqueServiceCount(services: ImpactedServiceLike[]): number {
  return new Set(
    services.map((service) => service.serviceId ?? `${service.namespace ?? 'default'}:${service.name ?? 'unknown'}`)
  ).size
}

function mapFallbackImpactedServices(
  result: UnknownRecord,
  roles: ReadonlySet<string>
): UnknownRecord[] {
  return getNormalizedImpactedServices(result)
    .filter((service) => service.role && roles.has(service.role))
    .map((service) => ({
      serviceId: service.serviceId,
      name: service.name,
      namespace: service.namespace,
    }))
}

export function getFailureAffectedServiceCount(result: UnknownRecord): number {
  const callersCount = getCollectionItems(result.affectedCallers).length
  const downstreamCount = getCollectionItems(result.affectedDownstream).length
  const legacyCount = callersCount + downstreamCount
  if (legacyCount > 0) {
    return legacyCount
  }

  const impactedServices = getNormalizedImpactedServices(result)
  if (impactedServices.length === 0) {
    return 0
  }

  const nonTargetServices = impactedServices.filter((service) => service.role !== 'target')
  return uniqueServiceCount(nonTargetServices.length > 0 ? nonTargetServices : impactedServices)
}

export function getFailureAffectedCallers(result: UnknownRecord): UnknownRecord[] {
  const legacy = getCollectionItems(result.affectedCallers)
    .map((item) => toRecord(item) ?? { value: item })
  if (legacy.length > 0) {
    return legacy
  }
  return mapFallbackImpactedServices(result, new Set(['caller', 'source', 'inbound']))
}

export function getFailureAffectedDownstream(result: UnknownRecord): UnknownRecord[] {
  const legacy = getCollectionItems(result.affectedDownstream)
    .map((item) => toRecord(item) ?? { value: item })
  if (legacy.length > 0) {
    return legacy
  }
  return mapFallbackImpactedServices(result, new Set(['downstream', 'outbound']))
}

export function getDecisionScenarioServiceId(record: DecisionRecord): string | undefined {
  return getString(record.scenario.serviceId)
}
