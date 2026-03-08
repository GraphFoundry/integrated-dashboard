import {
  createReadOnlyHttpClientWrapper,
  type HttpRequestExecutor
} from './http-client-wrapper'

const SEVEN_DAY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000
const DEFAULT_DECISION_HISTORY_PAGE_SIZE = 100

type SimulationSevenDayWindowUtc = {
  anchorTimestampUtc: string
  windowStartUtc: string
  windowEndUtc: string
  timezone: 'UTC'
}

type SimulationDecisionHistoryRecord = {
  timestamp: string
  type: string
  result: unknown
}

type SimulationDecisionHistoryCollection = {
  endpoint: string
  collectedAtUtc: string
  pageSize: number
  totalFetched: number
  records: ReadonlyArray<SimulationDecisionHistoryRecord>
}

type SimulationRunCountsFromSqlite = {
  runs: number
  failureRuns: number
  scaleRuns: number
  lowConfidenceRuns: number
  filters: {
    windowStartUtc: string
    windowEndUtc: string
    timezone: 'UTC'
  }
}

type SimulationAverageAffectedServicesFromSqlite = {
  avgAffectedServices: number
  contributingRuns: number
  filters: {
    windowStartUtc: string
    windowEndUtc: string
    timezone: 'UTC'
  }
  estimationRules: {
    failure: 'affectedCallers + affectedDownstream'
    scaling: 'affectedPaths'
    excludesZeroEstimates: true
  }
}

type HttpJsonResponseLike = {
  status: number
  statusText: string
  json: () => Promise<unknown>
}

type SimulationDecisionHistoryPage = {
  records: ReadonlyArray<SimulationDecisionHistoryRecord>
  totalRecords: number | null
}

function buildSimulationSevenDayWindowUtc(
  pageLoadTimestampUtc: string
): SimulationSevenDayWindowUtc {
  const anchorTimeMs = Date.parse(pageLoadTimestampUtc)
  if (!Number.isFinite(anchorTimeMs)) {
    throw new Error(
      `Invalid page-load timestamp for simulation seven-day window anchoring: ${pageLoadTimestampUtc}`
    )
  }

  const windowEndUtc = new Date(anchorTimeMs).toISOString()
  const windowStartUtc = new Date(anchorTimeMs - SEVEN_DAY_WINDOW_MS).toISOString()

  return {
    anchorTimestampUtc: windowEndUtc,
    windowStartUtc,
    windowEndUtc,
    timezone: 'UTC'
  }
}

function buildSimulationDecisionHistoryEndpoint(vmHost: string): string {
  return new URL('/decisions/history', `http://${vmHost}:7000`).toString()
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

function coerceNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function toNonNegativeInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.trunc(value)
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value)
    if (Number.isFinite(parsed) && parsed >= 0) {
      return Math.trunc(parsed)
    }
  }

  return null
}

function normalizePageSize(pageSize: number | undefined): number {
  if (typeof pageSize !== 'number' || !Number.isFinite(pageSize)) {
    return DEFAULT_DECISION_HISTORY_PAGE_SIZE
  }

  const normalized = Math.trunc(pageSize)
  return normalized > 0 ? normalized : DEFAULT_DECISION_HISTORY_PAGE_SIZE
}

function parseSimulationDecisionHistoryPage(
  payload: unknown
): SimulationDecisionHistoryPage {
  const payloadRecord = asRecord(payload)
  if (!payloadRecord) {
    throw new Error('Simulation decision history payload must be a JSON object')
  }

  const decisionsValue = payloadRecord.decisions
  if (!Array.isArray(decisionsValue)) {
    throw new Error('Simulation decision history payload is missing decisions array')
  }

  const records = decisionsValue.map((decision, index) => {
    const decisionRecord = asRecord(decision)
    if (!decisionRecord) {
      throw new Error(
        `Simulation decision history payload has non-object decision at index ${index}`
      )
    }

    const timestamp = coerceNonEmptyString(decisionRecord.timestamp)
    if (timestamp === null) {
      throw new Error(
        `Simulation decision history payload decision at index ${index} is missing timestamp`
      )
    }

    const type = coerceNonEmptyString(decisionRecord.type)
    if (type === null) {
      throw new Error(
        `Simulation decision history payload decision at index ${index} is missing type`
      )
    }

    return {
      timestamp,
      type,
      result: decisionRecord.result
    }
  })

  const paginationRecord = asRecord(payloadRecord.pagination)
  const totalRecords = paginationRecord
    ? toNonNegativeInteger(paginationRecord.total)
    : null

  return {
    records,
    totalRecords
  }
}

async function requestDecisionHistoryPage(
  readOnlyHttpClient: HttpRequestExecutor<HttpJsonResponseLike>,
  pageUrl: string,
  timeoutMs: number
): Promise<SimulationDecisionHistoryPage> {
  const abortController = new AbortController()
  const timeout = setTimeout(() => abortController.abort(), timeoutMs)

  try {
    const response = await readOnlyHttpClient({
      url: pageUrl,
      method: 'GET',
      signal: abortController.signal
    })

    if (response.status >= 400) {
      throw new Error(
        `Simulation decision history endpoint returned HTTP ${response.status} ${response.statusText}`
      )
    }

    const payload = await response.json()
    return parseSimulationDecisionHistoryPage(payload)
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(
        `Timed out after ${timeoutMs}ms while collecting simulation decision history`
      )
    }

    if (error instanceof Error) {
      throw error
    }

    throw new Error('Failed to collect simulation decision history')
  } finally {
    clearTimeout(timeout)
  }
}

async function collectSimulationDecisionHistoryFromSqlite(
  vmHost: string,
  executeRequest: HttpRequestExecutor<HttpJsonResponseLike> = createJsonHttpClient(),
  timeoutMs: number = 5000,
  pageSize: number = DEFAULT_DECISION_HISTORY_PAGE_SIZE,
  collectedAt: Date = new Date()
): Promise<SimulationDecisionHistoryCollection> {
  const endpoint = buildSimulationDecisionHistoryEndpoint(vmHost)
  const normalizedPageSize = normalizePageSize(pageSize)
  const readOnlyHttpClient = createReadOnlyHttpClientWrapper<HttpJsonResponseLike>(
    executeRequest,
    [endpoint]
  )

  let offset = 0
  let expectedTotal: number | null = null
  const records: SimulationDecisionHistoryRecord[] = []

  while (true) {
    const pageUrl = new URL(endpoint)
    pageUrl.searchParams.set('limit', String(normalizedPageSize))
    pageUrl.searchParams.set('offset', String(offset))

    const page = await requestDecisionHistoryPage(
      readOnlyHttpClient,
      pageUrl.toString(),
      timeoutMs
    )
    records.push(...page.records)

    if (expectedTotal === null && page.totalRecords !== null) {
      expectedTotal = page.totalRecords
    }

    if (expectedTotal !== null) {
      if (records.length >= expectedTotal) {
        break
      }
    } else if (page.records.length < normalizedPageSize) {
      break
    }

    if (page.records.length === 0) {
      break
    }

    offset += normalizedPageSize
  }

  return {
    endpoint,
    collectedAtUtc: collectedAt.toISOString(),
    pageSize: normalizedPageSize,
    totalFetched: records.length,
    records
  }
}

function normalizeTimestampToMs(value: string, context: string): number {
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid timestamp for ${context}: ${value}`)
  }

  return parsed
}

function hasLowConfidence(result: unknown): boolean {
  const resultRecord = asRecord(result)
  if (!resultRecord) {
    return false
  }

  const confidence = coerceNonEmptyString(resultRecord.confidence)
  if (confidence === null) {
    return false
  }

  return confidence.toLowerCase() === 'low'
}

function countArrayItems(result: unknown, key: string): number {
  const resultRecord = asRecord(result)
  if (!resultRecord) {
    return 0
  }

  const rawValue = resultRecord[key]
  if (Array.isArray(rawValue)) {
    return rawValue.length
  }

  const rawRecord = asRecord(rawValue)
  if (rawRecord && Array.isArray(rawRecord.items)) {
    return rawRecord.items.length
  }

  return 0
}

function estimateAffectedServices(record: SimulationDecisionHistoryRecord): number {
  const normalizedType = record.type.trim().toLowerCase()
  if (normalizedType === 'failure') {
    return (
      countArrayItems(record.result, 'affectedCallers') +
      countArrayItems(record.result, 'affectedDownstream')
    )
  }

  if (normalizedType === 'scaling' || normalizedType === 'scale') {
    return countArrayItems(record.result, 'affectedPaths')
  }

  return 0
}

function roundFloat(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.trunc(value * factor + 0.5) / factor
}

function computeSimulationRunCountsFromSqlite(
  records: ReadonlyArray<SimulationDecisionHistoryRecord>,
  window: SimulationSevenDayWindowUtc
): SimulationRunCountsFromSqlite {
  const windowStartMs = normalizeTimestampToMs(
    window.windowStartUtc,
    'simulation window start'
  )
  const windowEndMs = normalizeTimestampToMs(
    window.windowEndUtc,
    'simulation window end'
  )
  if (windowStartMs > windowEndMs) {
    throw new Error('Simulation window start must be before or equal to window end')
  }

  let runs = 0
  let failureRuns = 0
  let scaleRuns = 0
  let lowConfidenceRuns = 0

  for (const record of records) {
    const timestampMs = Date.parse(record.timestamp)
    if (!Number.isFinite(timestampMs)) {
      continue
    }

    if (timestampMs < windowStartMs || timestampMs > windowEndMs) {
      continue
    }

    runs += 1
    const normalizedType = record.type.trim().toLowerCase()
    if (normalizedType === 'failure') {
      failureRuns += 1
    }
    if (normalizedType === 'scaling' || normalizedType === 'scale') {
      scaleRuns += 1
    }
    if (hasLowConfidence(record.result)) {
      lowConfidenceRuns += 1
    }
  }

  return {
    runs,
    failureRuns,
    scaleRuns,
    lowConfidenceRuns,
    filters: {
      windowStartUtc: new Date(windowStartMs).toISOString(),
      windowEndUtc: new Date(windowEndMs).toISOString(),
      timezone: 'UTC'
    }
  }
}

function computeSimulationAverageAffectedServicesFromSqlite(
  records: ReadonlyArray<SimulationDecisionHistoryRecord>,
  window: SimulationSevenDayWindowUtc
): SimulationAverageAffectedServicesFromSqlite {
  const windowStartMs = normalizeTimestampToMs(
    window.windowStartUtc,
    'simulation window start'
  )
  const windowEndMs = normalizeTimestampToMs(
    window.windowEndUtc,
    'simulation window end'
  )
  if (windowStartMs > windowEndMs) {
    throw new Error('Simulation window start must be before or equal to window end')
  }

  let totalAffected = 0
  let contributingRuns = 0

  for (const record of records) {
    const timestampMs = Date.parse(record.timestamp)
    if (!Number.isFinite(timestampMs)) {
      continue
    }

    if (timestampMs < windowStartMs || timestampMs > windowEndMs) {
      continue
    }

    const affected = estimateAffectedServices(record)
    if (affected <= 0) {
      continue
    }

    totalAffected += affected
    contributingRuns += 1
  }

  const avgAffectedServices =
    contributingRuns > 0 ? roundFloat(totalAffected / contributingRuns, 2) : 0

  return {
    avgAffectedServices,
    contributingRuns,
    filters: {
      windowStartUtc: new Date(windowStartMs).toISOString(),
      windowEndUtc: new Date(windowEndMs).toISOString(),
      timezone: 'UTC'
    },
    estimationRules: {
      failure: 'affectedCallers + affectedDownstream',
      scaling: 'affectedPaths',
      excludesZeroEstimates: true
    }
  }
}

export {
  buildSimulationSevenDayWindowUtc,
  buildSimulationDecisionHistoryEndpoint,
  collectSimulationDecisionHistoryFromSqlite,
  computeSimulationRunCountsFromSqlite,
  computeSimulationAverageAffectedServicesFromSqlite,
  type SimulationSevenDayWindowUtc,
  type SimulationDecisionHistoryRecord,
  type SimulationDecisionHistoryCollection,
  type SimulationRunCountsFromSqlite,
  type SimulationAverageAffectedServicesFromSqlite
}
