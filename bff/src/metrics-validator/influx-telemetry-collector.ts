import {
  createReadOnlyHttpClientWrapper,
  type HttpRequestExecutor
} from './http-client-wrapper'

type HttpJsonResponseLike = {
  status: number
  statusText: string
  json: () => Promise<unknown>
}

type InfluxTelemetryCollectorInput = {
  vmHost: string
  windowStartUtc: string
  windowEndUtc: string
  serviceScope: string
  stepSeconds?: number
}

type InfluxTelemetryCollection = {
  endpoint: string
  collectedAtUtc: string
  windowStartUtc: string
  windowEndUtc: string
  serviceScope: string
  stepSeconds: number
  queryParameters: Record<string, string>
  rawPayloadExcerpt: InfluxTelemetryRawPayloadExcerpt
  rawPoints: ReadonlyArray<Record<string, unknown>>
  latestPerServicePoints: ReadonlyArray<LatestPerServiceTelemetryPoint>
}

type InfluxTelemetryRawPayloadExcerpt = {
  topLevelKeys: ReadonlyArray<string>
  datapointCount: number
  datapointsSample: ReadonlyArray<Record<string, unknown>>
}

type LatestPerServiceSelectionReason =
  | 'latestPositiveTraffic'
  | 'latestOverallFallback'

type LatestPerServiceTelemetryPoint = {
  serviceKey: string
  selectionReason: LatestPerServiceSelectionReason
  datapoint: Record<string, unknown>
}

function buildInfluxTelemetryEndpoint(vmHost: string): string {
  return new URL('/telemetry/service', `http://${vmHost}:7000`).toString()
}

function createJsonHttpClient(): HttpRequestExecutor<HttpJsonResponseLike> {
  return async (request) =>
    fetch(request.url, {
      method: request.method,
      signal: request.signal
    })
}

function normalizeStepSeconds(stepSeconds: number | undefined): number {
  if (typeof stepSeconds !== 'number' || !Number.isFinite(stepSeconds)) {
    return 60
  }

  const normalized = Math.trunc(stepSeconds)
  return normalized > 0 ? normalized : 60
}

function normalizeServiceScopeForQuery(serviceScope: string): string | null {
  const trimmedScope = serviceScope.trim()
  if (trimmedScope.length === 0) {
    return null
  }

  const lowered = trimmedScope.toLowerCase()
  if (lowered === 'all' || lowered === 'global' || lowered === '*') {
    return null
  }

  const scopeParts = trimmedScope.split(':')
  if (scopeParts.length > 1) {
    const service = scopeParts.slice(1).join(':').trim()
    return service.length > 0 ? service : null
  }

  return trimmedScope
}

function buildInfluxTelemetryQuery(input: {
  windowStartUtc: string
  windowEndUtc: string
  serviceScope: string
  stepSeconds: number
}): URLSearchParams {
  const params = new URLSearchParams({
    from: input.windowStartUtc,
    to: input.windowEndUtc,
    step: String(input.stepSeconds)
  })

  const service = normalizeServiceScopeForQuery(input.serviceScope)
  if (service !== null) {
    params.set('service', service)
  }

  return params
}

function buildQueryParametersRecord(
  query: URLSearchParams
): Record<string, string> {
  const queryParameters: Record<string, string> = {}

  for (const [key, value] of query.entries()) {
    queryParameters[key] = value
  }

  return queryParameters
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  return value as Record<string, unknown>
}

function buildInfluxTelemetryRawPayloadExcerpt(
  payload: unknown
): InfluxTelemetryRawPayloadExcerpt {
  const payloadRecord = asRecord(payload)
  if (!payloadRecord) {
    return {
      topLevelKeys: [],
      datapointCount: 0,
      datapointsSample: []
    }
  }

  const datapointsValue = Array.isArray(payloadRecord.datapoints)
    ? payloadRecord.datapoints
    : []
  const datapointsSample = datapointsValue
    .slice(0, 3)
    .flatMap((datapoint) => {
      const datapointRecord = asRecord(datapoint)
      return datapointRecord ? [{ ...datapointRecord }] : []
    })

  return {
    topLevelKeys: Object.keys(payloadRecord),
    datapointCount: datapointsValue.length,
    datapointsSample
  }
}

function parseRawTelemetryPoints(
  payload: unknown
): ReadonlyArray<Record<string, unknown>> {
  const payloadRecord = asRecord(payload)
  if (!payloadRecord) {
    throw new Error('Influx telemetry payload must be a JSON object')
  }

  const datapointsValue = payloadRecord.datapoints
  if (!Array.isArray(datapointsValue)) {
    throw new Error('Influx telemetry payload is missing datapoints array')
  }

  return datapointsValue.map((datapoint, index) => {
    const datapointRecord = asRecord(datapoint)
    if (!datapointRecord) {
      throw new Error(
        `Influx telemetry payload has non-object datapoint at index ${index}`
      )
    }

    return { ...datapointRecord }
  })
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

function coerceNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

function buildServiceKey(point: Record<string, unknown>): string | null {
  const rawServiceId = coerceNonEmptyString(point.serviceId)

  let service = coerceNonEmptyString(point.service)
  let namespace = coerceNonEmptyString(point.namespace)

  if (rawServiceId !== null) {
    const [scopeNamespace, ...scopeServiceParts] = rawServiceId.split(':')
    const scopedService = scopeServiceParts.join(':').trim()
    if (service === null && scopedService.length > 0) {
      service = scopedService
    }
    if (namespace === null && scopeNamespace.trim().length > 0) {
      namespace = scopeNamespace.trim()
    }
    if (service === null && scopeServiceParts.length === 0) {
      service = rawServiceId
    }
  }

  if (service === null) {
    return null
  }

  return `${namespace ?? ''}:${service}`
}

function sortPointsByTimestamp(
  points: ReadonlyArray<Record<string, unknown>>
): ReadonlyArray<Record<string, unknown>> {
  return points
    .map((point, index) => ({
      point,
      index,
      timestampMs: toTimestampMs(point.timestamp)
    }))
    .sort((a, b) => {
      const aIsValid = Number.isFinite(a.timestampMs)
      const bIsValid = Number.isFinite(b.timestampMs)

      if (aIsValid && bIsValid) {
        return a.timestampMs - b.timestampMs || a.index - b.index
      }

      if (aIsValid) {
        return -1
      }

      if (bIsValid) {
        return 1
      }

      return a.index - b.index
    })
    .map(({ point }) => point)
}

function extractLatestPerServicePoints(
  rawPoints: ReadonlyArray<Record<string, unknown>>
): ReadonlyArray<LatestPerServiceTelemetryPoint> {
  if (rawPoints.length === 0) {
    return []
  }

  const sortedPoints = sortPointsByTimestamp(rawPoints)
  const latestOverall = new Map<string, Record<string, unknown>>()
  const latestWithTraffic = new Map<string, Record<string, unknown>>()

  for (const point of sortedPoints) {
    const serviceKey = buildServiceKey(point)
    if (serviceKey === null) {
      continue
    }

    const timestampMs = toTimestampMs(point.timestamp)
    const previousOverall = latestOverall.get(serviceKey)
    if (
      !previousOverall ||
      timestampMs >= toTimestampMs(previousOverall.timestamp)
    ) {
      latestOverall.set(serviceKey, point)
    }

    const requestRate = toFiniteNumber(point.requestRate)
    if (requestRate !== null && requestRate > 0) {
      const previousWithTraffic = latestWithTraffic.get(serviceKey)
      if (
        !previousWithTraffic ||
        timestampMs >= toTimestampMs(previousWithTraffic.timestamp)
      ) {
        latestWithTraffic.set(serviceKey, point)
      }
    }
  }

  return Array.from(latestOverall.keys()).map((serviceKey) => {
    const overall = latestOverall.get(serviceKey)!
    const withTraffic = latestWithTraffic.get(serviceKey)

    if (!withTraffic) {
      return {
        serviceKey,
        selectionReason: 'latestOverallFallback' as const,
        datapoint: { ...overall }
      }
    }

    const latestAvailability = toFiniteNumber(overall.availability)
    const withTrafficAvailability = toFiniteNumber(withTraffic.availability)
    const selectedDatapoint =
      latestAvailability !== null && latestAvailability !== withTrafficAvailability
        ? { ...withTraffic, availability: latestAvailability }
        : { ...withTraffic }

    return {
      serviceKey,
      selectionReason: 'latestPositiveTraffic' as const,
      datapoint: selectedDatapoint
    }
  })
}

async function collectInfluxTelemetry(
  input: InfluxTelemetryCollectorInput,
  executeRequest: HttpRequestExecutor<HttpJsonResponseLike> = createJsonHttpClient(),
  timeoutMs: number = 5000,
  collectedAt: Date = new Date()
): Promise<InfluxTelemetryCollection> {
  const endpoint = buildInfluxTelemetryEndpoint(input.vmHost)
  const stepSeconds = normalizeStepSeconds(input.stepSeconds)
  const query = buildInfluxTelemetryQuery({
    windowStartUtc: input.windowStartUtc,
    windowEndUtc: input.windowEndUtc,
    serviceScope: input.serviceScope,
    stepSeconds
  })
  const queryParameters = buildQueryParametersRecord(query)
  const requestUrl = `${endpoint}?${query.toString()}`

  const readOnlyHttpClient = createReadOnlyHttpClientWrapper<HttpJsonResponseLike>(
    executeRequest,
    [endpoint]
  )

  const abortController = new AbortController()
  const timeout = setTimeout(() => abortController.abort(), timeoutMs)

  try {
    const response = await readOnlyHttpClient({
      url: requestUrl,
      method: 'GET',
      signal: abortController.signal
    })

    if (response.status >= 400) {
      throw new Error(
        `Influx telemetry endpoint returned HTTP ${response.status} ${response.statusText}`
      )
    }

    const payload = await response.json()
    const rawPayloadExcerpt = buildInfluxTelemetryRawPayloadExcerpt(payload)
    const rawPoints = parseRawTelemetryPoints(payload)
    const latestPerServicePoints = extractLatestPerServicePoints(rawPoints)

    return {
      endpoint,
      collectedAtUtc: collectedAt.toISOString(),
      windowStartUtc: input.windowStartUtc,
      windowEndUtc: input.windowEndUtc,
      serviceScope: input.serviceScope,
      stepSeconds,
      queryParameters,
      rawPayloadExcerpt,
      rawPoints,
      latestPerServicePoints
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(
        `Timed out after ${timeoutMs}ms while collecting Influx telemetry`
      )
    }

    if (error instanceof Error) {
      throw error
    }

    throw new Error('Failed to collect Influx telemetry')
  } finally {
    clearTimeout(timeout)
  }
}

export {
  collectInfluxTelemetry,
  buildInfluxTelemetryEndpoint,
  extractLatestPerServicePoints,
  type InfluxTelemetryCollection,
  type InfluxTelemetryCollectorInput,
  type LatestPerServiceTelemetryPoint,
  type LatestPerServiceSelectionReason
}
