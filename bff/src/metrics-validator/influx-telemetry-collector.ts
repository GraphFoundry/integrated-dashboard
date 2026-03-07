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
  rawPoints: ReadonlyArray<Record<string, unknown>>
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

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  return value as Record<string, unknown>
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
    const rawPoints = parseRawTelemetryPoints(payload)

    return {
      endpoint,
      collectedAtUtc: collectedAt.toISOString(),
      windowStartUtc: input.windowStartUtc,
      windowEndUtc: input.windowEndUtc,
      serviceScope: input.serviceScope,
      stepSeconds,
      rawPoints
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
  type InfluxTelemetryCollection,
  type InfluxTelemetryCollectorInput
}
