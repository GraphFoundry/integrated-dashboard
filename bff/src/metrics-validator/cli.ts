import { lookup } from 'node:dns/promises'
import { createConnection } from 'node:net'
import { createReadOnlyHttpClientWrapper } from './http-client-wrapper'

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
}> {
  const [vmHost, dashboardUrl] = await Promise.all([
    checkSshReachability(args.vmHost),
    checkDashboardReachability(args.dashboardUrl)
  ])

  return {
    vmHost,
    dashboardUrl
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
      process.stdout.write(
        `${JSON.stringify(
          {
            accepted: true,
            mode: 'dry-run',
            comparisonsExecuted: false,
            args,
            runContext,
            connectivity
          },
          null,
          2
        )}\n`
      )
      return 0
    }

    process.stdout.write(
      `${JSON.stringify(
        { accepted: true, mode: 'full', args, runContext },
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
  run,
  type CliArgs,
  type ParsedCliArgs,
  type RunContext
}
