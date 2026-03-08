import {
  createReadOnlyHttpClientWrapper,
  type HttpRequestExecutor
} from './http-client-wrapper'

type HttpJsonResponseLike = {
  status: number
  statusText: string
  json: () => Promise<unknown>
}

type SgeSnapshotCollection = {
  endpoint: string
  collectedAtUtc: string
  snapshotTimestampUtc: string | null
  queryParameters: Record<string, string>
  rawPayloadExcerpt: SgeSnapshotRawPayloadExcerpt
  serviceMetricsPayload: ReadonlyArray<Record<string, unknown>>
}

type SgeSnapshotRawPayloadExcerpt = {
  topLevelKeys: ReadonlyArray<string>
  serviceCount: number
  servicesSample: ReadonlyArray<Record<string, unknown>>
}

function buildSgeSnapshotEndpoint(vmHost: string): string {
  return new URL('/metrics/snapshot', `http://${vmHost}:3000`).toString()
}

function createJsonHttpClient(): HttpRequestExecutor<HttpJsonResponseLike> {
  return async (request) =>
    fetch(request.url, {
      method: request.method,
      signal: request.signal
    })
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  return value as Record<string, unknown>
}

function buildQueryParametersRecordFromUrl(url: string): Record<string, string> {
  const queryParameters: Record<string, string> = {}
  const parsedUrl = new URL(url)

  for (const [key, value] of parsedUrl.searchParams.entries()) {
    queryParameters[key] = value
  }

  return queryParameters
}

function buildSgeSnapshotRawPayloadExcerpt(
  payload: unknown
): SgeSnapshotRawPayloadExcerpt {
  const payloadRecord = asRecord(payload)
  if (!payloadRecord) {
    return {
      topLevelKeys: [],
      serviceCount: 0,
      servicesSample: []
    }
  }

  const servicesValue = Array.isArray(payloadRecord.services)
    ? payloadRecord.services
    : []
  const servicesSample = servicesValue.slice(0, 3).flatMap((service) => {
    const serviceRecord = asRecord(service)
    return serviceRecord ? [{ ...serviceRecord }] : []
  })

  return {
    topLevelKeys: Object.keys(payloadRecord),
    serviceCount: servicesValue.length,
    servicesSample
  }
}

function coerceTimestampToUtcIso(value: unknown): string | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString()
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) {
      return null
    }

    const millis = value < 1_000_000_000_000 ? value * 1000 : value
    const parsed = new Date(millis)
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString()
    }

    const numeric = Number(value)
    return coerceTimestampToUtcIso(numeric)
  }

  return null
}

function parseServiceMetricsPayload(payload: unknown): {
  snapshotTimestampUtc: string | null
  serviceMetricsPayload: ReadonlyArray<Record<string, unknown>>
} {
  const payloadRecord = asRecord(payload)
  if (!payloadRecord) {
    throw new Error('SGE snapshot payload must be a JSON object')
  }

  const servicesValue = payloadRecord.services
  if (!Array.isArray(servicesValue)) {
    throw new Error('SGE snapshot payload is missing services array')
  }

  const serviceMetricsPayload = servicesValue.map((service, index) => {
    const serviceRecord = asRecord(service)
    if (!serviceRecord) {
      throw new Error(
        `SGE snapshot payload has non-object service entry at index ${index}`
      )
    }

    return { ...serviceRecord }
  })

  return {
    snapshotTimestampUtc: coerceTimestampToUtcIso(payloadRecord.timestamp),
    serviceMetricsPayload
  }
}

async function collectSgeSnapshot(
  vmHost: string,
  executeRequest: HttpRequestExecutor<HttpJsonResponseLike> = createJsonHttpClient(),
  timeoutMs: number = 5000,
  collectedAt: Date = new Date()
): Promise<SgeSnapshotCollection> {
  const endpoint = buildSgeSnapshotEndpoint(vmHost)
  const queryParameters = buildQueryParametersRecordFromUrl(endpoint)
  const readOnlyHttpClient = createReadOnlyHttpClientWrapper<HttpJsonResponseLike>(
    executeRequest,
    [endpoint]
  )

  const abortController = new AbortController()
  const timeout = setTimeout(() => abortController.abort(), timeoutMs)

  try {
    const response = await readOnlyHttpClient({
      url: endpoint,
      method: 'GET',
      signal: abortController.signal
    })

    if (response.status >= 400) {
      throw new Error(
        `SGE snapshot endpoint returned HTTP ${response.status} ${response.statusText}`
      )
    }

    const payload = await response.json()
    const rawPayloadExcerpt = buildSgeSnapshotRawPayloadExcerpt(payload)
    const { snapshotTimestampUtc, serviceMetricsPayload } =
      parseServiceMetricsPayload(payload)

    return {
      endpoint,
      collectedAtUtc: collectedAt.toISOString(),
      snapshotTimestampUtc,
      queryParameters,
      rawPayloadExcerpt,
      serviceMetricsPayload
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(
        `Timed out after ${timeoutMs}ms while collecting SGE snapshot`
      )
    }

    if (error instanceof Error) {
      throw error
    }

    throw new Error('Failed to collect SGE snapshot')
  } finally {
    clearTimeout(timeout)
  }
}

export {
  collectSgeSnapshot,
  buildSgeSnapshotEndpoint,
  type SgeSnapshotCollection
}
