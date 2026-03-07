type MetricsPageTimeRange = '5m' | '15m' | '1h' | '6h' | '24h'

type MetricsPageOpenInput = {
  dashboardUrl: string
  windowStartUtc: string
  windowEndUtc: string
  serviceScope: string
}

type MetricsPageOpenResult = {
  openedAtUtc: string
  metricsPageUrl: string
  appliedServiceScope: string
  appliedTimeRange: MetricsPageTimeRange
  requestedWindowStartUtc: string
  requestedWindowEndUtc: string
}

type BrowserGotoOptions = {
  waitUntil?: 'domcontentloaded' | 'load'
  timeoutMs?: number
}

type BrowserWaitForSelectorOptions = {
  timeoutMs?: number
}

type BrowserSession = {
  goto: (url: string, options?: BrowserGotoOptions) => Promise<void>
  waitForSelector: (
    selector: string,
    options?: BrowserWaitForSelectorOptions
  ) => Promise<void>
  selectOption: (selector: string, value: string) => Promise<void>
  url: () => string
  close: () => Promise<void>
}

type BrowserSessionFactory = (input: { headless: boolean }) => Promise<BrowserSession>

type PlaywrightChromiumLike = {
  launch: (options: { headless: boolean }) => Promise<PlaywrightBrowserLike>
}

type PlaywrightBrowserLike = {
  newPage: () => Promise<PlaywrightPageLike>
  close: () => Promise<void>
}

type PlaywrightPageLike = {
  goto: (
    url: string,
    options?: {
      waitUntil?: 'domcontentloaded' | 'load'
      timeout?: number
    }
  ) => Promise<unknown>
  waitForSelector: (
    selector: string,
    options?: {
      state?: 'attached' | 'visible'
      timeout?: number
    }
  ) => Promise<unknown>
  selectOption: (selector: string, values: string | ReadonlyArray<string>) => Promise<string[]>
  url: () => string
  close: () => Promise<void>
}

const GLOBAL_SCOPE_VALUES = new Set(['', 'all', 'global', '*'])
const METRICS_ROUTE_SEGMENTS = new Set([
  'overview',
  'alerts',
  'decisions',
  'metrics',
  'simulations',
  'history'
])
const METRICS_PAGE_TIME_RANGE_OPTIONS: ReadonlyArray<{
  value: MetricsPageTimeRange
  durationMs: number
}> = [
  { value: '5m', durationMs: 5 * 60 * 1000 },
  { value: '15m', durationMs: 15 * 60 * 1000 },
  { value: '1h', durationMs: 60 * 60 * 1000 },
  { value: '6h', durationMs: 6 * 60 * 60 * 1000 },
  { value: '24h', durationMs: 24 * 60 * 60 * 1000 }
]
const SERVICE_SCOPE_SELECTOR = '#service-select'
const TIME_RANGE_SELECTOR = '#time-range-select'
const NAVIGATION_TIMEOUT_MS = 45_000
const SELECTOR_TIMEOUT_MS = 15_000
const PLAYWRIGHT_MODULE_NAME = 'playwright'

function normalizeServiceScopeForMetricsPage(serviceScope: string): string {
  const trimmed = serviceScope.trim()
  if (GLOBAL_SCOPE_VALUES.has(trimmed.toLowerCase())) {
    return ''
  }

  return trimmed
}

function buildMetricsPageUrl(dashboardUrl: string): string {
  const parsed = new URL(dashboardUrl)
  const pathSegments = parsed.pathname.split('/').filter((segment) => segment.length > 0)
  const lastSegment = pathSegments[pathSegments.length - 1] ?? ''

  if (lastSegment === 'metrics') {
    parsed.search = ''
    parsed.hash = ''
    return parsed.toString()
  }

  if (METRICS_ROUTE_SEGMENTS.has(lastSegment)) {
    pathSegments[pathSegments.length - 1] = 'metrics'
  } else {
    pathSegments.push('metrics')
  }

  parsed.pathname = `/${pathSegments.join('/')}`
  parsed.search = ''
  parsed.hash = ''
  return parsed.toString()
}

function deriveMetricsTimeRangeValue(
  windowStartUtc: string,
  windowEndUtc: string
): MetricsPageTimeRange {
  const startMs = Date.parse(windowStartUtc)
  const endMs = Date.parse(windowEndUtc)

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    throw new Error(
      `Invalid run window for Metrics page automation: start=${windowStartUtc} end=${windowEndUtc}`
    )
  }

  const requestedDurationMs = endMs - startMs
  const closest = METRICS_PAGE_TIME_RANGE_OPTIONS.reduce((best, candidate) => {
    const candidateDelta = Math.abs(candidate.durationMs - requestedDurationMs)
    const bestDelta = Math.abs(best.durationMs - requestedDurationMs)
    return candidateDelta < bestDelta ? candidate : best
  }, METRICS_PAGE_TIME_RANGE_OPTIONS[0])

  return closest.value
}

async function loadPlaywrightChromium(): Promise<PlaywrightChromiumLike> {
  try {
    const playwrightModule = (await import(PLAYWRIGHT_MODULE_NAME)) as {
      chromium?: PlaywrightChromiumLike
    }

    if (!playwrightModule.chromium) {
      throw new Error('Playwright chromium launcher is unavailable')
    }

    return playwrightModule.chromium
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown Playwright import failure'
    throw new Error(
      `Browser automation requires the "playwright" package in integrated-dashboard/bff. ${message}`
    )
  }
}

async function createPlaywrightBrowserSession(input: {
  headless: boolean
}): Promise<BrowserSession> {
  const chromium = await loadPlaywrightChromium()
  const browser = await chromium.launch({ headless: input.headless })
  const page = await browser.newPage()

  return {
    goto: async (url, options) => {
      await page.goto(url, {
        waitUntil: options?.waitUntil ?? 'domcontentloaded',
        timeout: options?.timeoutMs
      })
    },
    waitForSelector: async (selector, options) => {
      await page.waitForSelector(selector, {
        state: 'attached',
        timeout: options?.timeoutMs
      })
    },
    selectOption: async (selector, value) => {
      const selected = await page.selectOption(selector, value)
      if (selected.length === 0) {
        throw new Error(
          `Option "${value}" was not applied for selector "${selector}" on Metrics page`
        )
      }
    },
    url: () => page.url(),
    close: async () => {
      await page.close()
      await browser.close()
    }
  }
}

async function openMetricsPageWithSelectedWindowAndScope(
  input: MetricsPageOpenInput,
  createSession: BrowserSessionFactory = createPlaywrightBrowserSession
): Promise<MetricsPageOpenResult> {
  const metricsPageUrl = buildMetricsPageUrl(input.dashboardUrl)
  const appliedServiceScope = normalizeServiceScopeForMetricsPage(input.serviceScope)
  const appliedTimeRange = deriveMetricsTimeRangeValue(
    input.windowStartUtc,
    input.windowEndUtc
  )

  const session = await createSession({ headless: true })
  try {
    await session.goto(metricsPageUrl, {
      waitUntil: 'domcontentloaded',
      timeoutMs: NAVIGATION_TIMEOUT_MS
    })
    await session.waitForSelector(SERVICE_SCOPE_SELECTOR, {
      timeoutMs: SELECTOR_TIMEOUT_MS
    })
    await session.waitForSelector(TIME_RANGE_SELECTOR, {
      timeoutMs: SELECTOR_TIMEOUT_MS
    })

    await session.selectOption(SERVICE_SCOPE_SELECTOR, appliedServiceScope)
    await session.selectOption(TIME_RANGE_SELECTOR, appliedTimeRange)

    return {
      openedAtUtc: new Date().toISOString(),
      metricsPageUrl: session.url(),
      appliedServiceScope,
      appliedTimeRange,
      requestedWindowStartUtc: input.windowStartUtc,
      requestedWindowEndUtc: input.windowEndUtc
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown Metrics page automation failure'
    throw new Error(`Failed to open Metrics page with selected scope/window: ${message}`)
  } finally {
    await session.close()
  }
}

export {
  buildMetricsPageUrl,
  deriveMetricsTimeRangeValue,
  openMetricsPageWithSelectedWindowAndScope,
  type MetricsPageOpenInput,
  type MetricsPageOpenResult
}
