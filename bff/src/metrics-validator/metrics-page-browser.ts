import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

type MetricsPageTimeRange = '5m' | '15m' | '1h' | '6h' | '24h'

type MetricsPageOpenInput = {
  dashboardUrl: string
  windowStartUtc: string
  windowEndUtc: string
  serviceScope: string
  auditScreenshotPath: string
}

type MetricsValidatorRiskLevel = 'high' | 'medium' | 'low'

type MetricsPageDisplayedValues = {
  summaryCards: {
    trafficVolume: string
    systemHealth: string
    speed: string
    uptimeReliability: string
  }
  tableRows: Array<{
    serviceId: string
    componentName: string
    namespace: string
    traffic: string
    successRate: string
    slowEndResponseTime: string
    uptime: string
    riskBadge: {
      level: MetricsValidatorRiskLevel
      label: string
      reason: string
    }
  }>
  simulationPanel: {
    runs7d: string
    failureRuns: string
    scaleRuns: string
    avgAffected: string
    avgLatencyDelta: string
    lowConfidenceRuns: string
    runTrend: Array<{
      date: string
      runs: string
      failureRuns: string
      scaleRuns: string
    }>
  } | null
  chartSeries: {
    traffic: Array<{ timestamp: string; value: number | null }>
    failureRate: Array<{ timestamp: string; value: number | null }>
    responseSpeed: Array<{
      timestamp: string
      p50?: number
      p95?: number
      p99?: number
    }>
    uptime: Array<{ timestamp: string; value: number }>
    hasP50Data: boolean
    hasP99Data: boolean
  }
}

type MetricsValidatorCapturePayload = MetricsPageDisplayedValues & {
  loading: boolean
  selectedServiceId: string
  selectedTimeRange: MetricsPageTimeRange
  capturedAtUtc: string
}

type MetricsPageSelectedFilters = {
  service: {
    serviceId: string
    label: string
  }
  timeRange: {
    value: MetricsPageTimeRange
    label: string
  }
}

type UiSelectedFiltersCapturePayload = {
  serviceId: string
  serviceLabel: string
  timeRange: MetricsPageTimeRange
  timeRangeLabel: string
}

type MetricsPageOpenResult = {
  openedAtUtc: string
  pageLoadTimestampUtc: string
  metricsPageUrl: string
  auditScreenshotPath: string
  appliedServiceScope: string
  appliedTimeRange: MetricsPageTimeRange
  requestedWindowStartUtc: string
  requestedWindowEndUtc: string
  selectedFilters: MetricsPageSelectedFilters
  displayedValues: MetricsPageDisplayedValues
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
  readMetricsValidatorCapture: () => Promise<unknown>
  readPageLoadTimestampUtc: () => Promise<unknown>
  readSelectedFiltersCapture: () => Promise<unknown>
  captureScreenshot: (outputPath: string) => Promise<void>
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
  evaluate: <T>(pageFunction: () => T | Promise<T>) => Promise<T>
  screenshot: (options: { path: string; fullPage?: boolean }) => Promise<unknown>
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
const CAPTURE_TIMEOUT_MS = 45_000
const CAPTURE_POLL_INTERVAL_MS = 250
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isNullableFiniteNumber(value: unknown): value is number | null {
  return value === null || isFiniteNumber(value)
}

function isMetricsValidatorRiskLevel(value: unknown): value is MetricsValidatorRiskLevel {
  return value === 'high' || value === 'medium' || value === 'low'
}

function isMetricsPageTimeRange(value: unknown): value is MetricsPageTimeRange {
  return value === '5m' || value === '15m' || value === '1h' || value === '6h' || value === '24h'
}

function parseUtcIsoTimestamp(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }

  return parsed.toISOString()
}

function parseUiSelectedFiltersCapturePayload(
  value: unknown
): UiSelectedFiltersCapturePayload | null {
  if (!isRecord(value)) {
    return null
  }

  if (
    typeof value.serviceId !== 'string' ||
    typeof value.serviceLabel !== 'string' ||
    !isMetricsPageTimeRange(value.timeRange) ||
    typeof value.timeRangeLabel !== 'string'
  ) {
    return null
  }

  if (value.serviceLabel.trim().length === 0 || value.timeRangeLabel.trim().length === 0) {
    return null
  }

  return {
    serviceId: value.serviceId,
    serviceLabel: value.serviceLabel.trim(),
    timeRange: value.timeRange,
    timeRangeLabel: value.timeRangeLabel.trim()
  }
}

function parseMetricsValidatorCapturePayload(
  value: unknown
): MetricsValidatorCapturePayload | null {
  if (!isRecord(value)) {
    return null
  }

  if (
    typeof value.loading !== 'boolean' ||
    typeof value.selectedServiceId !== 'string' ||
    !isMetricsPageTimeRange(value.selectedTimeRange) ||
    typeof value.capturedAtUtc !== 'string'
  ) {
    return null
  }

  if (!isRecord(value.summaryCards)) {
    return null
  }

  if (
    typeof value.summaryCards.trafficVolume !== 'string' ||
    typeof value.summaryCards.systemHealth !== 'string' ||
    typeof value.summaryCards.speed !== 'string' ||
    typeof value.summaryCards.uptimeReliability !== 'string'
  ) {
    return null
  }

  if (!Array.isArray(value.tableRows)) {
    return null
  }

  for (const row of value.tableRows) {
    if (!isRecord(row) || !isRecord(row.riskBadge)) {
      return null
    }

    if (
      typeof row.serviceId !== 'string' ||
      typeof row.componentName !== 'string' ||
      typeof row.namespace !== 'string' ||
      typeof row.traffic !== 'string' ||
      typeof row.successRate !== 'string' ||
      typeof row.slowEndResponseTime !== 'string' ||
      typeof row.uptime !== 'string' ||
      !isMetricsValidatorRiskLevel(row.riskBadge.level) ||
      typeof row.riskBadge.label !== 'string' ||
      typeof row.riskBadge.reason !== 'string'
    ) {
      return null
    }
  }

  if (value.simulationPanel !== null) {
    if (!isRecord(value.simulationPanel) || !Array.isArray(value.simulationPanel.runTrend)) {
      return null
    }

    if (
      typeof value.simulationPanel.runs7d !== 'string' ||
      typeof value.simulationPanel.failureRuns !== 'string' ||
      typeof value.simulationPanel.scaleRuns !== 'string' ||
      typeof value.simulationPanel.avgAffected !== 'string' ||
      typeof value.simulationPanel.avgLatencyDelta !== 'string' ||
      typeof value.simulationPanel.lowConfidenceRuns !== 'string'
    ) {
      return null
    }

    for (const trendPoint of value.simulationPanel.runTrend) {
      if (
        !isRecord(trendPoint) ||
        typeof trendPoint.date !== 'string' ||
        typeof trendPoint.runs !== 'string' ||
        typeof trendPoint.failureRuns !== 'string' ||
        typeof trendPoint.scaleRuns !== 'string'
      ) {
        return null
      }
    }
  }

  if (!isRecord(value.chartSeries)) {
    return null
  }

  if (
    !Array.isArray(value.chartSeries.traffic) ||
    !Array.isArray(value.chartSeries.failureRate) ||
    !Array.isArray(value.chartSeries.responseSpeed) ||
    !Array.isArray(value.chartSeries.uptime) ||
    typeof value.chartSeries.hasP50Data !== 'boolean' ||
    typeof value.chartSeries.hasP99Data !== 'boolean'
  ) {
    return null
  }

  for (const point of value.chartSeries.traffic) {
    if (
      !isRecord(point) ||
      typeof point.timestamp !== 'string' ||
      !isNullableFiniteNumber(point.value)
    ) {
      return null
    }
  }

  for (const point of value.chartSeries.failureRate) {
    if (
      !isRecord(point) ||
      typeof point.timestamp !== 'string' ||
      !isNullableFiniteNumber(point.value)
    ) {
      return null
    }
  }

  for (const point of value.chartSeries.responseSpeed) {
    if (
      !isRecord(point) ||
      typeof point.timestamp !== 'string' ||
      (point.p50 !== undefined && !isFiniteNumber(point.p50)) ||
      (point.p95 !== undefined && !isFiniteNumber(point.p95)) ||
      (point.p99 !== undefined && !isFiniteNumber(point.p99))
    ) {
      return null
    }
  }

  for (const point of value.chartSeries.uptime) {
    if (!isRecord(point) || typeof point.timestamp !== 'string' || !isFiniteNumber(point.value)) {
      return null
    }
  }

  return value as MetricsValidatorCapturePayload
}

async function waitForMetricsValidatorCapture(
  session: BrowserSession,
  expectedServiceScope: string,
  expectedTimeRange: MetricsPageTimeRange
): Promise<MetricsValidatorCapturePayload> {
  const deadline = Date.now() + CAPTURE_TIMEOUT_MS
  let lastObservedState = 'capture payload unavailable'

  while (Date.now() <= deadline) {
    const capturePayload = parseMetricsValidatorCapturePayload(
      await session.readMetricsValidatorCapture()
    )

    if (!capturePayload) {
      lastObservedState = 'capture payload missing or malformed'
      await sleep(CAPTURE_POLL_INTERVAL_MS)
      continue
    }

    if (capturePayload.selectedServiceId !== expectedServiceScope) {
      lastObservedState = `capture has selectedServiceId=${capturePayload.selectedServiceId}`
      await sleep(CAPTURE_POLL_INTERVAL_MS)
      continue
    }

    if (capturePayload.selectedTimeRange !== expectedTimeRange) {
      lastObservedState = `capture has selectedTimeRange=${capturePayload.selectedTimeRange}`
      await sleep(CAPTURE_POLL_INTERVAL_MS)
      continue
    }

    if (capturePayload.loading) {
      lastObservedState = 'capture still loading=true'
      await sleep(CAPTURE_POLL_INTERVAL_MS)
      continue
    }

    return capturePayload
  }

  throw new Error(
    `Timed out after ${CAPTURE_TIMEOUT_MS}ms waiting for Metrics page displayed values capture. Last observed state: ${lastObservedState}`
  )
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
    readMetricsValidatorCapture: async () => {
      return page.evaluate(() => {
        const contextWindow = window as unknown as {
          __METRICS_VALIDATOR_CAPTURE__?: unknown
        }
        return contextWindow.__METRICS_VALIDATOR_CAPTURE__ ?? null
      })
    },
    readPageLoadTimestampUtc: async () => {
      return page.evaluate(() => {
        if (
          typeof window.performance?.timeOrigin !== 'number' ||
          !Number.isFinite(window.performance.timeOrigin)
        ) {
          return null
        }

        return new Date(window.performance.timeOrigin).toISOString()
      })
    },
    readSelectedFiltersCapture: async () => {
      return page.evaluate(() => {
        const serviceSelect = document.querySelector('#service-select')
        const timeRangeSelect = document.querySelector('#time-range-select')

        if (!(serviceSelect instanceof HTMLSelectElement)) {
          return null
        }

        if (!(timeRangeSelect instanceof HTMLSelectElement)) {
          return null
        }

        const selectedServiceOption = serviceSelect.selectedOptions.item(0)
        const selectedTimeRangeOption = timeRangeSelect.selectedOptions.item(0)

        if (
          selectedServiceOption === null ||
          selectedTimeRangeOption === null
        ) {
          return null
        }

        return {
          serviceId: serviceSelect.value,
          serviceLabel: selectedServiceOption.textContent ?? '',
          timeRange: timeRangeSelect.value,
          timeRangeLabel: selectedTimeRangeOption.textContent ?? ''
        }
      })
    },
    captureScreenshot: async (outputPath) => {
      await mkdir(dirname(outputPath), { recursive: true })
      await page.screenshot({
        path: outputPath,
        fullPage: true
      })
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
  const auditScreenshotPath = input.auditScreenshotPath.trim()

  if (auditScreenshotPath.length === 0) {
    throw new Error('Metrics page screenshot path must be a non-empty string')
  }

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

    const pageLoadTimestampUtc = parseUtcIsoTimestamp(
      await session.readPageLoadTimestampUtc()
    )
    if (pageLoadTimestampUtc === null) {
      throw new Error(
        'Metrics page displayed-values capture is missing a valid page-load timestamp'
      )
    }

    await session.selectOption(SERVICE_SCOPE_SELECTOR, appliedServiceScope)
    await session.selectOption(TIME_RANGE_SELECTOR, appliedTimeRange)
    const capturePayload = await waitForMetricsValidatorCapture(
      session,
      appliedServiceScope,
      appliedTimeRange
    )
    const uiSelectedFiltersCapture = parseUiSelectedFiltersCapturePayload(
      await session.readSelectedFiltersCapture()
    )
    if (!uiSelectedFiltersCapture) {
      throw new Error(
        'Metrics page displayed-values capture is missing selected filter labels from the UI'
      )
    }
    if (
      uiSelectedFiltersCapture.serviceId !== capturePayload.selectedServiceId ||
      uiSelectedFiltersCapture.timeRange !== capturePayload.selectedTimeRange
    ) {
      throw new Error(
        'Metrics page capture mismatch: selected filters from UI differ from captured validator payload'
      )
    }
    await session.captureScreenshot(auditScreenshotPath)

    return {
      openedAtUtc: new Date().toISOString(),
      pageLoadTimestampUtc,
      metricsPageUrl: session.url(),
      auditScreenshotPath,
      appliedServiceScope,
      appliedTimeRange,
      requestedWindowStartUtc: input.windowStartUtc,
      requestedWindowEndUtc: input.windowEndUtc,
      selectedFilters: {
        service: {
          serviceId: uiSelectedFiltersCapture.serviceId,
          label: uiSelectedFiltersCapture.serviceLabel
        },
        timeRange: {
          value: uiSelectedFiltersCapture.timeRange,
          label: uiSelectedFiltersCapture.timeRangeLabel
        }
      },
      displayedValues: {
        summaryCards: capturePayload.summaryCards,
        tableRows: capturePayload.tableRows,
        simulationPanel: capturePayload.simulationPanel,
        chartSeries: capturePayload.chartSeries
      }
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
  type MetricsPageDisplayedValues,
  type MetricsPageOpenResult
}
