/**
 * Reusable Playwright-style helpers for deterministic Drill Director validation checks.
 * These helpers use a small "page/locator" surface so they can be consumed in
 * Playwright tests without coupling this module to a specific test runner package.
 */

export interface PlaywrightLikeRoot {
  locator(selector: string): PlaywrightLikeLocator
  getByLabel(text: string | RegExp, options?: { exact?: boolean }): PlaywrightLikeLocator
  getByRole(
    role: string,
    options?: {
      name?: string | RegExp
      exact?: boolean
    }
  ): PlaywrightLikeLocator
  getByTestId(testId: string): PlaywrightLikeLocator
  getByText(text: string | RegExp, options?: { exact?: boolean }): PlaywrightLikeLocator
}

export interface PlaywrightLikeLocator extends PlaywrightLikeRoot {
  first(): PlaywrightLikeLocator
  nth(index: number): PlaywrightLikeLocator
  count(): Promise<number>
  click(options?: { timeout?: number }): Promise<void>
  fill(value: string): Promise<void>
  getAttribute(name: string): Promise<string | null>
  isVisible(options?: { timeout?: number }): Promise<boolean>
  press(key: string): Promise<void>
  textContent(): Promise<string | null>
  waitFor(options?: { state?: 'attached' | 'detached' | 'visible' | 'hidden'; timeout?: number }): Promise<void>
}

export interface PlaywrightLikePage extends PlaywrightLikeRoot {
  waitForTimeout(timeout: number): Promise<void>
}

const DEFAULT_TIMEOUT_MS = 60_000
const DEFAULT_POLL_INTERVAL_MS = 400
const DEFAULT_STABLE_POLLS = 2

const DEFAULT_ROLLBACK_CONFIRMED_STATUSES = ['Recovering', 'Completed', 'Failed', 'Accepted', 'Aborted'] as const

export interface StartScenarioOptions {
  scenarioType: string
  targetComponent?: string
  timeoutMs?: number
  pollIntervalMs?: number
}

export interface RunStatusPollOptions {
  expectedStatuses: readonly string[]
  timeoutMs?: number
  pollIntervalMs?: number
  stablePolls?: number
}

export interface RunStatusObservation {
  status: string
  observedAt: string
  attempts: number
}

export type ScenarioBannerState = 'verified' | 'not-verified' | 'unknown'

export interface ScenarioBannerObservation {
  state: ScenarioBannerState
  source: 'run-panel' | 'predictive-banner' | 'none'
  text: string | null
  observedAt: string
}

export interface ValidationMetricRow {
  layerKey: string
  layerStatus: string
  sourceTimestamp: string | null
  metricName: string
  expectedValue: string
  actualValue: string
  mismatch: boolean
}

export interface ValidationMetricsSnapshot {
  verdict: string | null
  collectedAt: string
  metrics: ValidationMetricRow[]
}

export interface RollbackWaitOptions {
  timeoutMs?: number
  pollIntervalMs?: number
  confirmedStatuses?: readonly string[]
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim()
}

function normalizeStatus(status: string): string {
  return status.trim().toLowerCase()
}

async function isVisible(locator: PlaywrightLikeLocator, timeoutMs = 150): Promise<boolean> {
  try {
    const hasAny = (await locator.count()) > 0
    if (!hasAny) return false
    return await locator.first().isVisible({ timeout: timeoutMs })
  } catch {
    return false
  }
}

async function waitForEnabled(
  page: PlaywrightLikePage,
  button: PlaywrightLikeLocator,
  timeoutMs: number,
  pollIntervalMs: number
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const disabled = await button.getAttribute('disabled')
    const ariaDisabled = await button.getAttribute('aria-disabled')
    const dataDisabled = await button.getAttribute('data-disabled')
    if (!disabled && ariaDisabled !== 'true' && dataDisabled !== 'true') {
      return
    }
    await page.waitForTimeout(pollIntervalMs)
  }
  throw new Error('Timed out waiting for scenario engage button to become enabled.')
}

export async function startScenarioFromCatalog(
  page: PlaywrightLikePage,
  options: StartScenarioOptions
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS
  const scenarioType = options.scenarioType.trim()
  if (!scenarioType) {
    throw new Error('startScenarioFromCatalog requires a non-empty scenarioType.')
  }

  const scenarioCard = page
    .locator(`[data-testid="drill-catalog-card"][data-drill-type="${scenarioType}"]`)
    .first()
  await scenarioCard.waitFor({ state: 'visible', timeout: timeoutMs })
  await scenarioCard.click({ timeout: timeoutMs })

  const safetyGate = page.getByTestId('drill-safety-gate').first()
  await safetyGate.waitFor({ state: 'visible', timeout: timeoutMs })

  const targetComponent = options.targetComponent?.trim()
  if (targetComponent) {
    const targetInput = safetyGate.getByLabel(/Target Component/i).first()
    await targetInput.click({ timeout: timeoutMs })
    await targetInput.fill(targetComponent)
    await targetInput.press('Enter')
  }

  const blastRadiusAcknowledgement = safetyGate.getByText(/I acknowledge the blast radius/i).first()
  await blastRadiusAcknowledgement.click({ timeout: timeoutMs })

  const engageButton = safetyGate.getByTestId('drill-engage-sequence').first()
  await engageButton.waitFor({ state: 'visible', timeout: timeoutMs })
  await waitForEnabled(page, engageButton, timeoutMs, pollIntervalMs)
  await engageButton.click({ timeout: timeoutMs })
  await safetyGate.waitFor({ state: 'hidden', timeout: timeoutMs })

  const startButton = page.getByRole('button', { name: /Initiate Sequence/i }).first()
  await startButton.waitFor({ state: 'visible', timeout: timeoutMs })
  await startButton.click({ timeout: timeoutMs })
  await page.getByTestId('drill-run-status').first().waitFor({ state: 'visible', timeout: timeoutMs })
}

export async function pollRunStatus(
  page: PlaywrightLikePage,
  options: RunStatusPollOptions
): Promise<RunStatusObservation> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS
  const stablePolls = Math.max(1, options.stablePolls ?? DEFAULT_STABLE_POLLS)
  const expectedStatuses = new Set(options.expectedStatuses.map((status) => normalizeStatus(status)))
  if (expectedStatuses.size === 0) {
    throw new Error('pollRunStatus requires at least one expected status.')
  }

  const statusBadge = page.getByTestId('drill-run-status').first()
  await statusBadge.waitFor({ state: 'visible', timeout: timeoutMs })

  const deadline = Date.now() + timeoutMs
  let attempts = 0
  let lastStatus = ''
  let stableCount = 0
  while (Date.now() < deadline) {
    attempts += 1
    const status = normalizeText(await statusBadge.textContent())
    if (!status) {
      await page.waitForTimeout(pollIntervalMs)
      continue
    }

    if (status === lastStatus) {
      stableCount += 1
    } else {
      lastStatus = status
      stableCount = 1
    }

    if (expectedStatuses.has(normalizeStatus(status)) && stableCount >= stablePolls) {
      return {
        status,
        observedAt: new Date().toISOString(),
        attempts,
      }
    }

    await page.waitForTimeout(pollIntervalMs)
  }

  throw new Error(
    `Timed out waiting for expected run status (${Array.from(expectedStatuses).join(', ')}). Last status: ${lastStatus || 'n/a'}.`
  )
}

export async function detectScenarioBanner(
  page: PlaywrightLikePage,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<ScenarioBannerObservation> {
  const runPanelBanner = page.getByTestId('drill-banner-verification')
  if (await isVisible(runPanelBanner, timeoutMs)) {
    const text = normalizeText(await runPanelBanner.first().textContent())
    if (/not verified/i.test(text)) {
      return {
        state: 'not-verified',
        source: 'run-panel',
        text,
        observedAt: new Date().toISOString(),
      }
    }
    if (/verified/i.test(text)) {
      return {
        state: 'verified',
        source: 'run-panel',
        text,
        observedAt: new Date().toISOString(),
      }
    }
    return {
      state: 'unknown',
      source: 'run-panel',
      text: text || null,
      observedAt: new Date().toISOString(),
    }
  }

  const predictiveBanner = page.getByText(/Predictive Action Required/i)
  if (await isVisible(predictiveBanner, Math.min(timeoutMs, 1000))) {
    const text = normalizeText(await predictiveBanner.first().textContent())
    return {
      state: 'unknown',
      source: 'predictive-banner',
      text: text || null,
      observedAt: new Date().toISOString(),
    }
  }

  return {
    state: 'unknown',
    source: 'none',
    text: null,
    observedAt: new Date().toISOString(),
  }
}

export async function extractValidationMetrics(
  page: PlaywrightLikePage,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<ValidationMetricsSnapshot> {
  const panel = page.getByTestId('drill-validation-panel').first()
  await panel.waitFor({ state: 'visible', timeout: timeoutMs })

  const verdictText = normalizeText(await panel.getByTestId('drill-validation-verdict').first().textContent())
  const cards = panel.locator('[data-testid="drill-validation-layer-card"]')
  const cardCount = await cards.count()
  const metrics: ValidationMetricRow[] = []

  for (let i = 0; i < cardCount; i += 1) {
    const card = cards.nth(i)
    const layerKey = (await card.getAttribute('data-layer-key')) ?? `layer-${i}`
    const layerStatus = normalizeText(await card.getByTestId('drill-validation-layer-status').first().textContent())
    const sourceTimestamp = normalizeText(
      await card.getByTestId('drill-validation-layer-source-timestamp').first().textContent()
    )

    const rows = card.locator('[data-testid="drill-validation-metric-row"]')
    const rowCount = await rows.count()
    for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
      const row = rows.nth(rowIndex)
      metrics.push({
        layerKey,
        layerStatus,
        sourceTimestamp: sourceTimestamp || null,
        metricName: normalizeText(await row.getByTestId('drill-validation-metric-name').first().textContent()),
        expectedValue: normalizeText(
          await row.getByTestId('drill-validation-metric-expected').first().textContent()
        ),
        actualValue: normalizeText(await row.getByTestId('drill-validation-metric-actual').first().textContent()),
        mismatch: (await row.getAttribute('data-is-mismatch')) === 'true',
      })
    }
  }

  return {
    verdict: verdictText || null,
    collectedAt: new Date().toISOString(),
    metrics,
  }
}

export async function waitForRollbackConfirmation(
  page: PlaywrightLikePage,
  options: RollbackWaitOptions = {}
): Promise<RunStatusObservation> {
  const confirmedStatuses = options.confirmedStatuses ?? DEFAULT_ROLLBACK_CONFIRMED_STATUSES
  return pollRunStatus(page, {
    expectedStatuses: confirmedStatuses,
    timeoutMs: options.timeoutMs,
    pollIntervalMs: options.pollIntervalMs,
    stablePolls: 1,
  })
}
