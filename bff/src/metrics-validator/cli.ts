import { lookup } from 'node:dns/promises'
import { createConnection } from 'node:net'
import {
  createReadOnlyHttpClientWrapper,
  type HttpRequestExecutor
} from './http-client-wrapper'
import { collectSgeSnapshot } from './sge-snapshot-collector'

type CliArgs = {
  vmHost: string
  dashboardUrl: string
  windowStart: string
  windowEnd: string
  serviceScope: string
  outputPath: string
}

type ParsedCliArgs = {
  args: CliArgs
  dryRun: boolean
}

type RunContext = {
  pageLoadReferenceTimestampUtc: string
  selectedTimeWindowUtc: {
    start: string
    end: string
  }
  selectedServiceScope: string
}

type PreflightServiceName =
  | 'prometheus'
  | 'sge'
  | 'analysisEngine'
  | 'influxdb'
  | 'bff'

type PreflightServiceHealthTarget = {
  service: PreflightServiceName
  endpoint: string
}

type ServiceHealthCheckResult = {
  service: PreflightServiceName
  endpoint: string
  healthy: boolean
  statusCode: number | null
  detail: string
}

type HttpStatusLike = {
  status: number
  statusText: string
}

type PollWorkerActivityEvidence = {
  endpoint: string
  active: boolean
  evidence: 'health'
  pollIntervalMs: number | null
  pollIntervalSource: PollIntervalSource
  latestSuccessfulPollWriteTimestampUtc: string | null
  latestSuccessfulPollWriteTimestampSource: PollWriteTimestampSource
  detail: string
}

type PollIntervalSource =
  | 'telemetry.pollIntervalMs'
  | 'telemetry.workerPollIntervalMs'
  | 'telemetry.pollIntervalSeconds'
  | 'telemetry.workerPollIntervalSeconds'
  | null

type PollWriteTimestampSource =
  | 'telemetry.latestSuccessfulPollWriteTimestampUtc'
  | 'telemetry.lastSuccessfulPollWriteTimestampUtc'
  | 'telemetry.latestSuccessfulWriteTimestampUtc'
  | 'telemetry.lastSuccessfulWriteTimestampUtc'
  | 'telemetry.latestSuccessfulPollWriteAt'
  | 'telemetry.lastSuccessfulPollWriteAt'
  | 'telemetry.latestSuccessfulWriteAt'
  | 'telemetry.lastSuccessfulWriteAt'
  | 'telemetry.latestSuccessfulPollWriteTimestampMs'
  | 'telemetry.lastSuccessfulPollWriteTimestampMs'
  | 'telemetry.latestSuccessfulWriteTimestampMs'
  | 'telemetry.lastSuccessfulWriteTimestampMs'
  | 'telemetry.latestSuccessfulPollWriteTimestampSeconds'
  | 'telemetry.lastSuccessfulPollWriteTimestampSeconds'
  | 'telemetry.latestSuccessfulWriteTimestampSeconds'
  | 'telemetry.lastSuccessfulWriteTimestampSeconds'
  | null

type ReportMetadata = {
  analysisEnginePollIntervalMs: number | null
  analysisEnginePollIntervalSource: PollIntervalSource
  analysisEngineLatestSuccessfulPollWriteTimestampUtc: string | null
  analysisEngineLatestSuccessfulPollWriteTimestampSource: PollWriteTimestampSource
}

type HttpJsonResponseLike = {
  status: number
  statusText: string
  json: () => Promise<unknown>
}

const REQUIRED_FLAGS: ReadonlyArray<keyof CliArgs> = [
  'vmHost',
  'dashboardUrl',
  'windowStart',
  'windowEnd',
  'serviceScope',
  'outputPath'
]

const FLAG_MAP: Record<string, keyof CliArgs> = {
  '--vm-host': 'vmHost',
  '--dashboard-url': 'dashboardUrl',
  '--window-start': 'windowStart',
  '--window-end': 'windowEnd',
  '--service-scope': 'serviceScope',
  '--output-path': 'outputPath'
}

function isAbsoluteHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function isValidTimestamp(value: string): boolean {
  const time = Date.parse(value)
  return !Number.isNaN(time)
}

function parseCliArgs(argv: string[]): ParsedCliArgs {
  const parsed: Partial<CliArgs> = {}
  let dryRun = false
  let index = 0

  while (index < argv.length) {
    const token = argv[index]

    if (token === '--dry-run') {
      dryRun = true
      index += 1
      continue
    }

    const mapped = FLAG_MAP[token]

    if (!mapped) {
      throw new Error(`Unknown argument: ${token}`)
    }

    const value = argv[index + 1]
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for ${token}`)
    }

    parsed[mapped] = value
    index += 2
  }

  const missingFlags = REQUIRED_FLAGS.filter((flag) => {
    const value = parsed[flag]
    return typeof value !== 'string' || value.trim().length === 0
  })

  if (missingFlags.length > 0) {
    const displayFlags = missingFlags
      .map((flag) =>
        Object.entries(FLAG_MAP).find(([, mapped]) => mapped === flag)?.[0] ?? flag
      )
      .join(', ')
    throw new Error(`Missing required arguments: ${displayFlags}`)
  }

  if (!isAbsoluteHttpUrl(parsed.dashboardUrl ?? '')) {
    throw new Error('Invalid --dashboard-url: expected absolute http(s) URL')
  }

  if (!isValidTimestamp(parsed.windowStart ?? '')) {
    throw new Error('Invalid --window-start: expected parseable date/time string')
  }

  if (!isValidTimestamp(parsed.windowEnd ?? '')) {
    throw new Error('Invalid --window-end: expected parseable date/time string')
  }

  return {
    args: parsed as CliArgs,
    dryRun
  }
}

function printUsage(): void {
  const usage = [
    'Usage: metrics-validator [options]',
    '',
    'Required options:',
    '  --vm-host <host>',
    '  --dashboard-url <url>',
    '  --window-start <iso-or-parseable-time>',
    '  --window-end <iso-or-parseable-time>',
    '  --service-scope <scope>',
    '  --output-path <path>',
    '',
    'Optional flags:',
    '  --dry-run'
  ].join('\n')

  process.stdout.write(`${usage}\n`)
}

function toUtcIsoTimestamp(value: string): string {
  return new Date(value).toISOString()
}

function createRunContext(
  args: Pick<CliArgs, 'windowStart' | 'windowEnd' | 'serviceScope'>,
  referenceDate: Date = new Date()
): RunContext {
  return {
    pageLoadReferenceTimestampUtc: referenceDate.toISOString(),
    selectedTimeWindowUtc: {
      start: toUtcIsoTimestamp(args.windowStart),
      end: toUtcIsoTimestamp(args.windowEnd)
    },
    selectedServiceScope: args.serviceScope
  }
}

function buildHealthEndpointUrl(
  vmHost: string,
  port: number,
  pathname: string
): string {
  return new URL(pathname, `http://${vmHost}:${port}`).toString()
}

function buildDefaultServiceHealthTargets(
  vmHost: string
): ReadonlyArray<PreflightServiceHealthTarget> {
  return [
    {
      service: 'prometheus',
      endpoint: buildHealthEndpointUrl(vmHost, 9090, '/-/healthy')
    },
    {
      service: 'sge',
      endpoint: buildHealthEndpointUrl(vmHost, 3000, '/graph/health')
    },
    {
      service: 'analysisEngine',
      endpoint: buildHealthEndpointUrl(vmHost, 7000, '/health')
    },
    {
      service: 'influxdb',
      endpoint: buildHealthEndpointUrl(vmHost, 8086, '/health')
    },
    {
      service: 'bff',
      endpoint: buildHealthEndpointUrl(vmHost, 3001, '/health')
    }
  ]
}

function createServiceHealthHttpClient(): HttpRequestExecutor<HttpStatusLike> {
  return async (request) => {
    const response = await fetch(request.url, {
      method: request.method,
      signal: request.signal
    })

    return {
      status: response.status,
      statusText: response.statusText
    }
  }
}

async function checkServiceHealthTarget(
  httpClient: HttpRequestExecutor<HttpStatusLike>,
  target: PreflightServiceHealthTarget,
  timeoutMs: number
): Promise<ServiceHealthCheckResult> {
  const abortController = new AbortController()
  const timeout = setTimeout(() => abortController.abort(), timeoutMs)

  try {
    const response = await httpClient({
      url: target.endpoint,
      method: 'GET',
      signal: abortController.signal
    })

    if (response.status >= 400) {
      return {
        service: target.service,
        endpoint: target.endpoint,
        healthy: false,
        statusCode: response.status,
        detail: `HTTP ${response.status} ${response.statusText}`
      }
    }

    return {
      service: target.service,
      endpoint: target.endpoint,
      healthy: true,
      statusCode: response.status,
      detail: `HTTP ${response.status} ${response.statusText}`
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        service: target.service,
        endpoint: target.endpoint,
        healthy: false,
        statusCode: null,
        detail: `Timed out after ${timeoutMs}ms`
      }
    }

    const message =
      error instanceof Error ? error.message : 'Unknown connectivity failure'
    return {
      service: target.service,
      endpoint: target.endpoint,
      healthy: false,
      statusCode: null,
      detail: message
    }
  } finally {
    clearTimeout(timeout)
  }
}

async function runPipelinePreflightHealthChecks(
  vmHost: string,
  executeRequest: HttpRequestExecutor<HttpStatusLike> = createServiceHealthHttpClient(),
  timeoutMs: number = 5000
): Promise<ServiceHealthCheckResult[]> {
  const targets = buildDefaultServiceHealthTargets(vmHost)
  const readOnlyHttpClient = createReadOnlyHttpClientWrapper<HttpStatusLike>(
    executeRequest,
    targets.map((target) => target.endpoint)
  )

  return Promise.all(
    targets.map((target) =>
      checkServiceHealthTarget(readOnlyHttpClient, target, timeoutMs)
    )
  )
}

function createJsonHttpClient(): HttpRequestExecutor<HttpJsonResponseLike> {
  return async (request) =>
    fetch(request.url, {
      method: request.method,
      signal: request.signal
    })
}

function extractTelemetryPayload(payload: unknown): Record<string, unknown> | null {
  if (payload === null || typeof payload !== 'object') {
    return null
  }

  const telemetryValue = (payload as { telemetry?: unknown }).telemetry
  if (telemetryValue === null || typeof telemetryValue !== 'object') {
    return null
  }

  return telemetryValue as Record<string, unknown>
}

function extractTelemetryWorkerEnabled(payload: unknown): boolean | null {
  const telemetryValue = extractTelemetryPayload(payload)
  if (!telemetryValue) {
    return null
  }

  const workerEnabledValue = (
    telemetryValue as Record<'workerEnabled', unknown>
  ).workerEnabled

  return typeof workerEnabledValue === 'boolean' ? workerEnabledValue : null
}

function coercePositiveNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? value : null
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null
  }

  return null
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
    const direct = new Date(value)
    if (!Number.isNaN(direct.getTime())) {
      return direct.toISOString()
    }

    const numeric = Number(value)
    return coerceTimestampToUtcIso(numeric)
  }

  return null
}

function extractTelemetryPollInterval(payload: unknown): {
  pollIntervalMs: number | null
  pollIntervalSource: PollIntervalSource
} {
  const telemetryValue = extractTelemetryPayload(payload)
  if (!telemetryValue) {
    return {
      pollIntervalMs: null,
      pollIntervalSource: null
    }
  }

  const millisecondCandidates: Array<{
    source: Exclude<PollIntervalSource, null>
    value: unknown
  }> = [
    {
      source: 'telemetry.pollIntervalMs',
      value: telemetryValue.pollIntervalMs
    },
    {
      source: 'telemetry.workerPollIntervalMs',
      value: telemetryValue.workerPollIntervalMs
    }
  ]

  for (const candidate of millisecondCandidates) {
    const numericValue = coercePositiveNumber(candidate.value)
    if (numericValue !== null) {
      return {
        pollIntervalMs: numericValue,
        pollIntervalSource: candidate.source
      }
    }
  }

  const secondsCandidates: Array<{
    source: Exclude<PollIntervalSource, null>
    value: unknown
  }> = [
    {
      source: 'telemetry.pollIntervalSeconds',
      value: telemetryValue.pollIntervalSeconds
    },
    {
      source: 'telemetry.workerPollIntervalSeconds',
      value: telemetryValue.workerPollIntervalSeconds
    }
  ]

  for (const candidate of secondsCandidates) {
    const secondsValue = coercePositiveNumber(candidate.value)
    if (secondsValue !== null) {
      return {
        pollIntervalMs: secondsValue * 1000,
        pollIntervalSource: candidate.source
      }
    }
  }

  return {
    pollIntervalMs: null,
    pollIntervalSource: null
  }
}

function extractTelemetryLatestSuccessfulPollWriteTimestamp(payload: unknown): {
  latestSuccessfulPollWriteTimestampUtc: string | null
  latestSuccessfulPollWriteTimestampSource: PollWriteTimestampSource
} {
  const telemetryValue = extractTelemetryPayload(payload)
  if (!telemetryValue) {
    return {
      latestSuccessfulPollWriteTimestampUtc: null,
      latestSuccessfulPollWriteTimestampSource: null
    }
  }

  const timestampCandidates: Array<{
    source: Exclude<PollWriteTimestampSource, null>
    value: unknown
  }> = [
    {
      source: 'telemetry.latestSuccessfulPollWriteTimestampUtc',
      value: telemetryValue.latestSuccessfulPollWriteTimestampUtc
    },
    {
      source: 'telemetry.lastSuccessfulPollWriteTimestampUtc',
      value: telemetryValue.lastSuccessfulPollWriteTimestampUtc
    },
    {
      source: 'telemetry.latestSuccessfulWriteTimestampUtc',
      value: telemetryValue.latestSuccessfulWriteTimestampUtc
    },
    {
      source: 'telemetry.lastSuccessfulWriteTimestampUtc',
      value: telemetryValue.lastSuccessfulWriteTimestampUtc
    },
    {
      source: 'telemetry.latestSuccessfulPollWriteAt',
      value: telemetryValue.latestSuccessfulPollWriteAt
    },
    {
      source: 'telemetry.lastSuccessfulPollWriteAt',
      value: telemetryValue.lastSuccessfulPollWriteAt
    },
    {
      source: 'telemetry.latestSuccessfulWriteAt',
      value: telemetryValue.latestSuccessfulWriteAt
    },
    {
      source: 'telemetry.lastSuccessfulWriteAt',
      value: telemetryValue.lastSuccessfulWriteAt
    },
    {
      source: 'telemetry.latestSuccessfulPollWriteTimestampMs',
      value: telemetryValue.latestSuccessfulPollWriteTimestampMs
    },
    {
      source: 'telemetry.lastSuccessfulPollWriteTimestampMs',
      value: telemetryValue.lastSuccessfulPollWriteTimestampMs
    },
    {
      source: 'telemetry.latestSuccessfulWriteTimestampMs',
      value: telemetryValue.latestSuccessfulWriteTimestampMs
    },
    {
      source: 'telemetry.lastSuccessfulWriteTimestampMs',
      value: telemetryValue.lastSuccessfulWriteTimestampMs
    },
    {
      source: 'telemetry.latestSuccessfulPollWriteTimestampSeconds',
      value: telemetryValue.latestSuccessfulPollWriteTimestampSeconds
    },
    {
      source: 'telemetry.lastSuccessfulPollWriteTimestampSeconds',
      value: telemetryValue.lastSuccessfulPollWriteTimestampSeconds
    },
    {
      source: 'telemetry.latestSuccessfulWriteTimestampSeconds',
      value: telemetryValue.latestSuccessfulWriteTimestampSeconds
    },
    {
      source: 'telemetry.lastSuccessfulWriteTimestampSeconds',
      value: telemetryValue.lastSuccessfulWriteTimestampSeconds
    }
  ]

  for (const candidate of timestampCandidates) {
    const timestampUtc = coerceTimestampToUtcIso(candidate.value)
    if (timestampUtc !== null) {
      return {
        latestSuccessfulPollWriteTimestampUtc: timestampUtc,
        latestSuccessfulPollWriteTimestampSource: candidate.source
      }
    }
  }

  return {
    latestSuccessfulPollWriteTimestampUtc: null,
    latestSuccessfulPollWriteTimestampSource: null
  }
}

async function runAnalysisEnginePollWorkerActivityCheck(
  vmHost: string,
  executeRequest: HttpRequestExecutor<HttpJsonResponseLike> = createJsonHttpClient(),
  timeoutMs: number = 5000
): Promise<PollWorkerActivityEvidence> {
  const endpoint = buildHealthEndpointUrl(vmHost, 7000, '/health')
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
      return {
        endpoint,
        active: false,
        evidence: 'health',
        pollIntervalMs: null,
        pollIntervalSource: null,
        latestSuccessfulPollWriteTimestampUtc: null,
        latestSuccessfulPollWriteTimestampSource: null,
        detail: `Analysis Engine health endpoint returned HTTP ${response.status} ${response.statusText}`
      }
    }

    const payload = await response.json()
    const workerEnabled = extractTelemetryWorkerEnabled(payload)
    const { pollIntervalMs, pollIntervalSource } = extractTelemetryPollInterval(
      payload
    )
    const {
      latestSuccessfulPollWriteTimestampUtc,
      latestSuccessfulPollWriteTimestampSource
    } = extractTelemetryLatestSuccessfulPollWriteTimestamp(payload)

    if (workerEnabled === true) {
      const pollIntervalDetail =
        pollIntervalMs === null
          ? 'poll interval metadata unavailable in health response'
          : `poll interval=${pollIntervalMs}ms via ${pollIntervalSource}`
      const freshnessDetail =
        latestSuccessfulPollWriteTimestampUtc === null
          ? 'latest successful poll write timestamp unavailable in health response'
          : `latest successful poll write=${latestSuccessfulPollWriteTimestampUtc} via ${latestSuccessfulPollWriteTimestampSource}`

      return {
        endpoint,
        active: true,
        evidence: 'health',
        pollIntervalMs,
        pollIntervalSource,
        latestSuccessfulPollWriteTimestampUtc,
        latestSuccessfulPollWriteTimestampSource,
        detail:
          `Analysis Engine health evidence confirmed telemetry.workerEnabled=true; ${pollIntervalDetail}; ${freshnessDetail}`
      }
    }

    if (workerEnabled === false) {
      return {
        endpoint,
        active: false,
        evidence: 'health',
        pollIntervalMs,
        pollIntervalSource,
        latestSuccessfulPollWriteTimestampUtc,
        latestSuccessfulPollWriteTimestampSource,
        detail:
          'Analysis Engine health evidence reported telemetry.workerEnabled=false'
      }
    }

    return {
      endpoint,
      active: false,
      evidence: 'health',
      pollIntervalMs,
      pollIntervalSource,
      latestSuccessfulPollWriteTimestampUtc,
      latestSuccessfulPollWriteTimestampSource,
      detail:
        'Analysis Engine health evidence missing telemetry.workerEnabled field'
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        endpoint,
        active: false,
        evidence: 'health',
        pollIntervalMs: null,
        pollIntervalSource: null,
        latestSuccessfulPollWriteTimestampUtc: null,
        latestSuccessfulPollWriteTimestampSource: null,
        detail: `Timed out after ${timeoutMs}ms while checking poll worker activity`
      }
    }

    const message =
      error instanceof Error ? error.message : 'Unknown connectivity failure'
    return {
      endpoint,
      active: false,
      evidence: 'health',
      pollIntervalMs: null,
      pollIntervalSource: null,
      latestSuccessfulPollWriteTimestampUtc: null,
      latestSuccessfulPollWriteTimestampSource: null,
      detail: `Failed to verify poll worker activity from health evidence: ${message}`
    }
  } finally {
    clearTimeout(timeout)
  }
}

function buildReportMetadata(
  pollWorkerActivity: PollWorkerActivityEvidence
): ReportMetadata {
  return {
    analysisEnginePollIntervalMs: pollWorkerActivity.pollIntervalMs,
    analysisEnginePollIntervalSource: pollWorkerActivity.pollIntervalSource,
    analysisEngineLatestSuccessfulPollWriteTimestampUtc:
      pollWorkerActivity.latestSuccessfulPollWriteTimestampUtc,
    analysisEngineLatestSuccessfulPollWriteTimestampSource:
      pollWorkerActivity.latestSuccessfulPollWriteTimestampSource
  }
}

function assertAnalysisEnginePollWorkerActive(
  evidence: PollWorkerActivityEvidence
): void {
  if (evidence.active) {
    return
  }

  throw new Error(
    `Analysis Engine poll worker activity check failed: ${evidence.detail}`
  )
}

function assertAllPreflightServiceChecksHealthy(
  checks: ReadonlyArray<ServiceHealthCheckResult>
): void {
  const unhealthyChecks = checks.filter((check) => !check.healthy)
  if (unhealthyChecks.length === 0) {
    return
  }

  const failures = unhealthyChecks
    .map(
      (check) =>
        `${check.service} (${check.endpoint}) -> ${check.detail}${
          check.statusCode === null ? '' : ` [${check.statusCode}]`
        }`
    )
    .join('; ')

  throw new Error(
    `Preflight health checks failed for ${unhealthyChecks.length} service(s): ${failures}`
  )
}

async function checkSshReachability(
  host: string,
  port: number = 22,
  timeoutMs: number = 5000
): Promise<string> {
  const resolved = await lookup(host)

  await new Promise<void>((resolve, reject) => {
    const socket = createConnection({ host, port })
    let settled = false

    const finalize = (error?: Error): void => {
      if (settled) {
        return
      }
      settled = true
      socket.destroy()
      if (error) {
        reject(error)
        return
      }
      resolve()
    }

    socket.setTimeout(timeoutMs, () => {
      finalize(
        new Error(
          `Timed out connecting to ${host}:${port} after ${timeoutMs}ms`
        )
      )
    })
    socket.once('connect', () => finalize())
    socket.once('error', (error) => {
      finalize(new Error(`Failed to connect to ${host}:${port}: ${error.message}`))
    })
  })

  return `${host} resolved to ${resolved.address} and accepted TCP ${port}`
}

async function checkDashboardReachability(
  dashboardUrl: string,
  timeoutMs: number = 5000
): Promise<string> {
  const readOnlyHttpClient = createReadOnlyHttpClientWrapper<Response>(
    async (request) =>
      fetch(request.url, {
        method: request.method,
        signal: request.signal
      }),
    [dashboardUrl]
  )

  const abortController = new AbortController()
  const timeout = setTimeout(() => abortController.abort(), timeoutMs)

  try {
    const response = await readOnlyHttpClient({
      url: dashboardUrl,
      method: 'GET',
      signal: abortController.signal
    })
    if (response.status >= 500) {
      throw new Error(
        `Dashboard URL responded with HTTP ${response.status} ${response.statusText}`
      )
    }

    return `Dashboard URL reachable with HTTP ${response.status} ${response.statusText}`
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(
        `Timed out requesting dashboard URL after ${timeoutMs}ms: ${dashboardUrl}`
      )
    }
    const message = error instanceof Error ? error.message : 'Unknown connectivity failure'
    throw new Error(`Unable to reach dashboard URL: ${message}`)
  } finally {
    clearTimeout(timeout)
  }
}

async function runDryRunConnectivityChecks(
  args: Pick<CliArgs, 'vmHost' | 'dashboardUrl'>
): Promise<{
  vmHost: string
  dashboardUrl: string
  serviceHealthChecks: ServiceHealthCheckResult[]
  pollWorkerActivity: PollWorkerActivityEvidence
}> {
  const [vmHost, dashboardUrl, serviceHealthChecks, pollWorkerActivity] =
    await Promise.all([
      checkSshReachability(args.vmHost),
      checkDashboardReachability(args.dashboardUrl),
      runPipelinePreflightHealthChecks(args.vmHost),
      runAnalysisEnginePollWorkerActivityCheck(args.vmHost)
    ])
  assertAllPreflightServiceChecksHealthy(serviceHealthChecks)
  assertAnalysisEnginePollWorkerActive(pollWorkerActivity)

  return {
    vmHost,
    dashboardUrl,
    serviceHealthChecks,
    pollWorkerActivity
  }
}

async function run(argv: string[]): Promise<number> {
  if (argv.includes('--help') || argv.includes('-h')) {
    printUsage()
    return 0
  }

  try {
    const { args, dryRun } = parseCliArgs(argv)
    const runContext = createRunContext(args)

    if (dryRun) {
      const connectivity = await runDryRunConnectivityChecks(args)
      const reportMetadata = buildReportMetadata(connectivity.pollWorkerActivity)
      process.stdout.write(
        `${JSON.stringify(
          {
            accepted: true,
            mode: 'dry-run',
            comparisonsExecuted: false,
            args,
            runContext,
            reportMetadata,
            connectivity
          },
          null,
          2
        )}\n`
      )
      return 0
    }

    const [preflight, pollWorkerActivity] = await Promise.all([
      runPipelinePreflightHealthChecks(args.vmHost),
      runAnalysisEnginePollWorkerActivityCheck(args.vmHost)
    ])
    assertAllPreflightServiceChecksHealthy(preflight)
    assertAnalysisEnginePollWorkerActive(pollWorkerActivity)
    const reportMetadata = buildReportMetadata(pollWorkerActivity)
    const sgeSnapshot = await collectSgeSnapshot(args.vmHost)

    process.stdout.write(
      `${JSON.stringify(
        {
          accepted: true,
          mode: 'full',
          args,
          runContext,
          reportMetadata,
          collectors: {
            sgeSnapshot
          },
          preflight: {
            serviceHealthChecks: preflight,
            pollWorkerActivity
          }
        },
        null,
        2
      )}\n`
    )
    return 0
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown CLI error'
    process.stderr.write(`${message}\n\n`)
    printUsage()
    return 1
  }
}

if (require.main === module) {
  run(process.argv.slice(2))
    .then((exitCode) => process.exit(exitCode))
    .catch((error) => {
      const message =
        error instanceof Error ? error.message : 'Unknown CLI error'
      process.stderr.write(`${message}\n\n`)
      process.exit(1)
    })
}

export {
  parseCliArgs,
  createRunContext,
  buildDefaultServiceHealthTargets,
  runPipelinePreflightHealthChecks,
  runAnalysisEnginePollWorkerActivityCheck,
  buildReportMetadata,
  assertAllPreflightServiceChecksHealthy,
  assertAnalysisEnginePollWorkerActive,
  run,
  type CliArgs,
  type ParsedCliArgs,
  type RunContext,
  type ReportMetadata,
  type ServiceHealthCheckResult,
  type PollWorkerActivityEvidence
}
