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
const DEFAULT_SCENARIO_VALIDATION_READY_STATUSES = [
  'Observing',
  'AwaitingRecovery',
  'Recovering',
  'Completed',
  'Failed',
  'Accepted',
  'Aborted',
] as const
const DEFAULT_SCENARIO_VALIDATION_ROLLBACK_STATUSES = ['Completed', 'Failed', 'Accepted', 'Aborted'] as const
const KNOWN_RUN_STATUSES = new Set([
  'planned',
  'running',
  'observing',
  'awaitingrecovery',
  'recovering',
  'completed',
  'failed',
  'accepted',
  'aborted',
])
const TERMINAL_RUN_STATUSES = new Set(['completed', 'failed', 'accepted', 'aborted'])
const ACTIVE_RUN_STATUSES = new Set(['planned', 'running', 'observing', 'awaitingrecovery', 'recovering'])
const RUN_STATUS_ORDER: Record<string, number> = {
  planned: 0,
  running: 1,
  observing: 2,
  awaitingrecovery: 3,
  recovering: 4,
  completed: 5,
  failed: 5,
  accepted: 5,
  aborted: 5,
}
const MISMATCH_LAYER_STATUSES = new Set(['mismatch', 'missing'])

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
  failFastStatuses?: readonly string[]
}

export interface RunStatusObservation {
  status: string
  observedAt: string
  attempts: number
}

export interface CatalogScenario {
  scenarioType: string
  title: string
}

export interface CatalogIterationContext {
  index: number
  total: number
}

export interface CatalogIterationOptions {
  timeoutMs?: number
  onScenario: (
    scenario: CatalogScenario,
    context: CatalogIterationContext
  ) => void | Promise<void>
}

export interface CatalogIterationResult {
  scenarios: CatalogScenario[]
  iteratedAt: string
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

export interface ValidationLayerStatus {
  layerKey: string
  layerStatus: string
}

export interface ValidationMetricsSnapshot {
  verdict: string | null
  collectedAt: string
  layers: ValidationLayerStatus[]
  metrics: ValidationMetricRow[]
}

export interface RollbackWaitOptions {
  timeoutMs?: number
  pollIntervalMs?: number
  confirmedStatuses?: readonly string[]
}

export interface BackendComparisonMismatch {
  metricName: string
  expectedValue: string
  actualValue: string
}

export interface BackendLayerComparison {
  status: string
  mismatches?: BackendComparisonMismatch[]
}

export interface BackendComparisonSnapshot {
  comparison: {
    vm: BackendLayerComparison
    api: BackendLayerComparison
    uiMetrics: BackendLayerComparison
    graph: BackendLayerComparison
    scenarioVerdict?: string
  }
}

export interface ScenarioComparisonValidationOptions {
  scenarioType: string
  targetComponent?: string
  timeoutMs?: number
  pollIntervalMs?: number
  preValidationStatuses?: readonly string[]
  rollbackConfirmationStatuses?: readonly string[]
  readBackendSnapshot: (runId: string) => Promise<BackendComparisonSnapshot>
}

export interface ScenarioComparisonValidationResult {
  scenarioType: string
  runId: string
  validationSnapshot: ValidationMetricsSnapshot
  rollbackObservation: RunStatusObservation
  validatedAt: string
}

export interface SequentialCatalogComparisonValidationOptions {
  timeoutMs?: number
  pollIntervalMs?: number
  preValidationStatuses?: readonly string[]
  rollbackConfirmationStatuses?: readonly string[]
  readBackendSnapshot: (runId: string) => Promise<BackendComparisonSnapshot>
  targetComponentForScenario?: (
    scenario: CatalogScenario,
    context: CatalogIterationContext
  ) => string | undefined | Promise<string | undefined>
  onScenarioValidated?: (
    result: SequentialCatalogComparisonValidationResultEntry,
    context: CatalogIterationContext
  ) => void | Promise<void>
}

export interface SequentialCatalogComparisonValidationResultEntry extends ScenarioComparisonValidationResult {
  scenario: CatalogScenario
  index: number
  total: number
}

export interface SequentialCatalogComparisonValidationResult extends CatalogIterationResult {
  results: SequentialCatalogComparisonValidationResultEntry[]
}

type BackendLayerKey = 'vm' | 'api' | 'uiMetrics' | 'graph'

function normalizeText(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim()
}

function normalizeStatus(status: string): string {
  return status.trim().toLowerCase()
}

function buildDefaultFailFastStatuses(expectedStatuses: Set<string>): Set<string> {
  const failFastStatuses = new Set<string>()
  for (const terminalStatus of TERMINAL_RUN_STATUSES) {
    if (!expectedStatuses.has(terminalStatus)) {
      failFastStatuses.add(terminalStatus)
    }
  }
  return failFastStatuses
}

function assertRunStatusIsKnown(status: string): void {
  if (!KNOWN_RUN_STATUSES.has(status)) {
    throw new Error(`Inconsistent run state detected: unrecognized status "${status}".`)
  }
}

function assertRunStatusTransitionIsConsistent(previousStatus: string, currentStatus: string): void {
  if (!previousStatus || previousStatus === currentStatus) {
    return
  }

  if (TERMINAL_RUN_STATUSES.has(previousStatus)) {
    throw new Error(
      `Inconsistent run state detected: status changed from terminal "${previousStatus}" to "${currentStatus}".`
    )
  }

  const previousOrder = RUN_STATUS_ORDER[previousStatus]
  const currentOrder = RUN_STATUS_ORDER[currentStatus]
  if (currentOrder < previousOrder) {
    throw new Error(`Inconsistent run state detected: status regressed from "${previousStatus}" to "${currentStatus}".`)
  }
}

function describeValidationMismatch(snapshot: ValidationMetricsSnapshot): string | null {
  const verdict = normalizeStatus(snapshot.verdict ?? '')
  if (verdict === 'failed') {
    return 'validation verdict is failed'
  }

  const mismatchLayer = snapshot.layers.find((layer) => MISMATCH_LAYER_STATUSES.has(normalizeStatus(layer.layerStatus)))
  if (mismatchLayer) {
    return `layer "${mismatchLayer.layerKey}" reported status "${mismatchLayer.layerStatus}"`
  }

  const mismatchMetric = snapshot.metrics.find((metric) => metric.mismatch)
  if (mismatchMetric) {
    const expectedValue = mismatchMetric.expectedValue || '--'
    const actualValue = mismatchMetric.actualValue || '--'
    return `metric "${mismatchMetric.metricName}" mismatched (expected "${expectedValue}", actual "${actualValue}")`
  }

  return null
}

function normalizeComparableValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '--'
  }
  const normalized = normalizeText(String(value))
  return normalized || '--'
}

function getBackendLayerKey(layerKey: string): BackendLayerKey | null {
  switch (layerKey) {
    case 'vm':
      return 'vm'
    case 'api':
      return 'api'
    case 'ui':
      return 'uiMetrics'
    case 'graph':
      return 'graph'
    default:
      return null
  }
}

function assertUiValidationMatchesBackendComparison(
  uiSnapshot: ValidationMetricsSnapshot,
  backendSnapshot: BackendComparisonSnapshot
): void {
  if (!backendSnapshot.comparison) {
    throw new Error('Backend snapshot did not include a comparison payload.')
  }

  const uiVerdict = normalizeStatus(uiSnapshot.verdict ?? '')
  const backendVerdict = normalizeStatus(backendSnapshot.comparison.scenarioVerdict ?? '')
  if (backendVerdict && uiVerdict !== backendVerdict) {
    throw new Error(
      `Validation verdict mismatch: UI shows "${uiSnapshot.verdict ?? '--'}" but backend comparison reports "${backendSnapshot.comparison.scenarioVerdict}".`
    )
  }

  const uiLayerByKey = new Map<string, ValidationLayerStatus>()
  for (const layer of uiSnapshot.layers) {
    uiLayerByKey.set(layer.layerKey, layer)
  }

  for (const uiLayer of uiSnapshot.layers) {
    const backendLayerKey = getBackendLayerKey(uiLayer.layerKey)
    if (!backendLayerKey) {
      continue
    }
    const backendLayer = backendSnapshot.comparison[backendLayerKey]
    const backendStatus = normalizeStatus(backendLayer?.status ?? '')
    const uiStatus = normalizeStatus(uiLayer.layerStatus)
    if (backendStatus && uiStatus !== backendStatus) {
      throw new Error(
        `Layer status mismatch for "${uiLayer.layerKey}": UI shows "${uiLayer.layerStatus}" but backend comparison reports "${backendLayer.status}".`
      )
    }
  }

  const requiredUiLayers: readonly string[] = ['vm', 'api', 'ui', 'graph']
  for (const layerKey of requiredUiLayers) {
    if (!uiLayerByKey.has(layerKey)) {
      throw new Error(`Validation UI is missing required layer "${layerKey}".`)
    }
    const backendLayerKey = getBackendLayerKey(layerKey)
    if (!backendLayerKey || !backendSnapshot.comparison[backendLayerKey]) {
      throw new Error(`Backend comparison is missing required layer "${layerKey}".`)
    }

    const uiMetricsForLayer = uiSnapshot.metrics.filter((metric) => metric.layerKey === layerKey)
    const uiMetricsByName = new Map<string, ValidationMetricRow>()
    for (const uiMetric of uiMetricsForLayer) {
      uiMetricsByName.set(normalizeText(uiMetric.metricName), uiMetric)
    }

    const backendMismatches = backendSnapshot.comparison[backendLayerKey].mismatches ?? []
    const backendMismatchNames = new Set<string>()

    for (const backendMismatch of backendMismatches) {
      const metricName = normalizeText(backendMismatch.metricName)
      if (!metricName) {
        continue
      }
      backendMismatchNames.add(metricName)
      const uiMetric = uiMetricsByName.get(metricName)
      if (!uiMetric) {
        throw new Error(`UI is missing backend mismatch metric "${layerKey}.${backendMismatch.metricName}".`)
      }
      if (!uiMetric.mismatch) {
        throw new Error(`UI metric "${layerKey}.${backendMismatch.metricName}" is not marked as mismatch.`)
      }

      const expectedUi = normalizeComparableValue(uiMetric.expectedValue)
      const actualUi = normalizeComparableValue(uiMetric.actualValue)
      const expectedBackend = normalizeComparableValue(backendMismatch.expectedValue)
      const actualBackend = normalizeComparableValue(backendMismatch.actualValue)
      if (expectedUi !== expectedBackend || actualUi !== actualBackend) {
        throw new Error(
          `Mismatch detail divergence for "${layerKey}.${backendMismatch.metricName}": UI (${expectedUi} -> ${actualUi}) vs backend (${expectedBackend} -> ${actualBackend}).`
        )
      }
    }

    for (const uiMetric of uiMetricsForLayer) {
      const metricName = normalizeText(uiMetric.metricName)
      if (uiMetric.mismatch && !backendMismatchNames.has(metricName)) {
        throw new Error(`UI flagged "${layerKey}.${uiMetric.metricName}" as mismatch but backend comparison did not.`)
      }
    }
  }
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

async function enforceSingleActiveScenario(page: PlaywrightLikePage, timeoutMs: number): Promise<void> {
  const runStatusBadge = page.getByTestId('drill-run-status').first()
  if (!(await isVisible(runStatusBadge))) {
    return
  }

  const currentStatus = normalizeText(await runStatusBadge.textContent())
  if (!currentStatus) {
    throw new Error('Current run status could not be determined; refusing to start a new scenario.')
  }

  const normalizedStatus = normalizeStatus(currentStatus)
  if (ACTIVE_RUN_STATUSES.has(normalizedStatus)) {
    throw new Error(
      `Cannot start a new scenario while run status "${currentStatus}" is active. Helpers enforce one active scenario at a time.`
    )
  }

  if (!TERMINAL_RUN_STATUSES.has(normalizedStatus)) {
    throw new Error(
      `Cannot start a new scenario because existing run status "${currentStatus}" is not recognized as terminal.`
    )
  }

  const exitRoomButton = page.getByTestId('drill-exit-room').first()
  if (!(await isVisible(exitRoomButton))) {
    throw new Error(
      `Run status "${currentStatus}" is terminal, but no "Exit Room" control is available to clear run context.`
    )
  }

  await exitRoomButton.click({ timeout: timeoutMs })
  await runStatusBadge.waitFor({ state: 'hidden', timeout: timeoutMs })
}

async function readActiveRunId(page: PlaywrightLikePage, timeoutMs: number): Promise<string> {
  const runPanel = page.getByTestId('drill-run-panel').first()
  await runPanel.waitFor({ state: 'visible', timeout: timeoutMs })
  const runId = normalizeText(await runPanel.getAttribute('data-run-id'))
  if (!runId) {
    throw new Error('Active run id is unavailable in the drill run panel.')
  }
  return runId
}

export async function getScenarioCatalog(page: PlaywrightLikePage, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<CatalogScenario[]> {
  const cards = page.locator('[data-testid="drill-catalog-card"]')
  await cards.first().waitFor({ state: 'visible', timeout: timeoutMs })

  const cardCount = await cards.count()
  if (cardCount === 0) {
    throw new Error('Scenario catalog is empty; no scenarios are available to iterate.')
  }

  const scenarios: CatalogScenario[] = []
  const seenScenarioTypes = new Set<string>()
  for (let i = 0; i < cardCount; i += 1) {
    const card = cards.nth(i)
    const scenarioType = normalizeText(await card.getAttribute('data-drill-type'))
    if (!scenarioType || seenScenarioTypes.has(scenarioType)) {
      continue
    }

    const title = normalizeText(await card.getByRole('heading').first().textContent()) || scenarioType
    scenarios.push({
      scenarioType,
      title,
    })
    seenScenarioTypes.add(scenarioType)
  }

  if (scenarios.length === 0) {
    throw new Error('Scenario catalog cards were found, but none exposed a valid scenario type.')
  }

  return scenarios
}

export async function iterateScenarioCatalog(
  page: PlaywrightLikePage,
  options: CatalogIterationOptions
): Promise<CatalogIterationResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const scenarios = await getScenarioCatalog(page, timeoutMs)

  for (let i = 0; i < scenarios.length; i += 1) {
    await options.onScenario(scenarios[i], {
      index: i + 1,
      total: scenarios.length,
    })
  }

  return {
    scenarios,
    iteratedAt: new Date().toISOString(),
  }
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

  await enforceSingleActiveScenario(page, timeoutMs)

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
  const failFastStatuses = buildDefaultFailFastStatuses(expectedStatuses)
  for (const status of options.failFastStatuses ?? []) {
    const normalized = normalizeStatus(status)
    if (normalized) {
      failFastStatuses.add(normalized)
    }
  }

  const statusBadge = page.getByTestId('drill-run-status').first()
  await statusBadge.waitFor({ state: 'visible', timeout: timeoutMs })

  const deadline = Date.now() + timeoutMs
  let attempts = 0
  let lastStatus = ''
  let lastNormalizedStatus = ''
  let stableCount = 0
  while (Date.now() < deadline) {
    attempts += 1
    const status = normalizeText(await statusBadge.textContent())
    if (!status) {
      await page.waitForTimeout(pollIntervalMs)
      continue
    }
    const normalizedStatus = normalizeStatus(status)
    assertRunStatusIsKnown(normalizedStatus)
    assertRunStatusTransitionIsConsistent(lastNormalizedStatus, normalizedStatus)

    if (status === lastStatus) {
      stableCount += 1
    } else {
      lastStatus = status
      lastNormalizedStatus = normalizedStatus
      stableCount = 1
    }

    if (failFastStatuses.has(normalizedStatus)) {
      throw new Error(
        `Run reached fail-fast status "${status}" while waiting for (${Array.from(expectedStatuses).join(', ')}).`
      )
    }

    if (expectedStatuses.has(normalizedStatus) && stableCount >= stablePolls) {
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
  const layers: ValidationLayerStatus[] = []
  const metrics: ValidationMetricRow[] = []

  for (let i = 0; i < cardCount; i += 1) {
    const card = cards.nth(i)
    const layerKey = (await card.getAttribute('data-layer-key')) ?? `layer-${i}`
    const layerStatus = normalizeText(await card.getByTestId('drill-validation-layer-status').first().textContent())
    layers.push({ layerKey, layerStatus })
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
    layers,
    metrics,
  }
}

export async function assertValidationSnapshotPasses(
  page: PlaywrightLikePage,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<ValidationMetricsSnapshot> {
  const snapshot = await extractValidationMetrics(page, timeoutMs)
  const mismatchMessage = describeValidationMismatch(snapshot)
  if (mismatchMessage) {
    throw new Error(`Validation mismatch detected: ${mismatchMessage}.`)
  }
  return snapshot
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

export async function validateScenarioAgainstBackendComparison(
  page: PlaywrightLikePage,
  options: ScenarioComparisonValidationOptions
): Promise<ScenarioComparisonValidationResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS
  const scenarioType = options.scenarioType.trim()
  if (!scenarioType) {
    throw new Error('validateScenarioAgainstBackendComparison requires a non-empty scenarioType.')
  }

  await startScenarioFromCatalog(page, {
    scenarioType,
    targetComponent: options.targetComponent,
    timeoutMs,
    pollIntervalMs,
  })

  await pollRunStatus(page, {
    expectedStatuses: options.preValidationStatuses ?? DEFAULT_SCENARIO_VALIDATION_READY_STATUSES,
    timeoutMs,
    pollIntervalMs,
    stablePolls: 1,
  })

  const runId = await readActiveRunId(page, timeoutMs)
  const validationSnapshot = await extractValidationMetrics(page, timeoutMs)
  const backendSnapshot = await options.readBackendSnapshot(runId)
  assertUiValidationMatchesBackendComparison(validationSnapshot, backendSnapshot)

  const rollbackObservation = await waitForRollbackConfirmation(page, {
    timeoutMs,
    pollIntervalMs,
    confirmedStatuses: options.rollbackConfirmationStatuses ?? DEFAULT_SCENARIO_VALIDATION_ROLLBACK_STATUSES,
  })

  return {
    scenarioType,
    runId,
    validationSnapshot,
    rollbackObservation,
    validatedAt: new Date().toISOString(),
  }
}

export async function validateCatalogScenariosAgainstComparisonAndRollback(
  page: PlaywrightLikePage,
  options: SequentialCatalogComparisonValidationOptions
): Promise<SequentialCatalogComparisonValidationResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const results: SequentialCatalogComparisonValidationResultEntry[] = []

  const iteration = await iterateScenarioCatalog(page, {
    timeoutMs,
    onScenario: async (scenario, context) => {
      const targetComponent = options.targetComponentForScenario
        ? await options.targetComponentForScenario(scenario, context)
        : undefined

      const scenarioValidation = await validateScenarioAgainstBackendComparison(page, {
        scenarioType: scenario.scenarioType,
        targetComponent,
        timeoutMs,
        pollIntervalMs: options.pollIntervalMs,
        preValidationStatuses: options.preValidationStatuses,
        rollbackConfirmationStatuses: options.rollbackConfirmationStatuses,
        readBackendSnapshot: options.readBackendSnapshot,
      })

      const resultEntry: SequentialCatalogComparisonValidationResultEntry = {
        ...scenarioValidation,
        scenario,
        index: context.index,
        total: context.total,
      }
      results.push(resultEntry)

      if (options.onScenarioValidated) {
        await options.onScenarioValidated(resultEntry, context)
      }
    },
  })

  return {
    ...iteration,
    results,
  }
}
