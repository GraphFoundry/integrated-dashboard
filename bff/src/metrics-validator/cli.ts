type CliArgs = {
  vmHost: string
  dashboardUrl: string
  windowStart: string
  windowEnd: string
  serviceScope: string
  outputPath: string
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

function parseCliArgs(argv: string[]): CliArgs {
  const parsed: Partial<CliArgs> = {}
  let index = 0

  while (index < argv.length) {
    const token = argv[index]
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

  return parsed as CliArgs
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
    '  --output-path <path>'
  ].join('\n')

  process.stdout.write(`${usage}\n`)
}

function run(argv: string[]): number {
  if (argv.includes('--help') || argv.includes('-h')) {
    printUsage()
    return 0
  }

  try {
    const args = parseCliArgs(argv)
    process.stdout.write(`${JSON.stringify({ accepted: true, args }, null, 2)}\n`)
    return 0
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown CLI error'
    process.stderr.write(`${message}\n\n`)
    printUsage()
    return 1
  }
}

if (require.main === module) {
  const exitCode = run(process.argv.slice(2))
  process.exit(exitCode)
}

export { parseCliArgs, run, type CliArgs }
