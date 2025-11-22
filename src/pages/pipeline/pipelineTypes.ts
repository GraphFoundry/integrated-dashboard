/**
 * Central type definitions for Pipeline Playground
 * Single source of truth for stage identifiers, states, and definitions
 */

export type StageId =
  | 'scenario-parse'
  | 'staleness-check'
  | 'fetch-neighborhood'
  | 'build-snapshot'
  | 'apply-scaling-model'
  | 'path-analysis'
  | 'compute-impact'
  | 'recommendations'

export type StageStatus = 'pending' | 'running' | 'done' | 'skipped'

export type ScenarioType = 'failure' | 'scale'

export interface PipelineStageDefinition {
  id: StageId
  name: string
  description: string
  supportedScenarios: readonly ScenarioType[]
}

export interface StageState {
  id: StageId
  userEnabled: boolean // User preference (persists across scenario switches)
  enabled: boolean // Derived: userEnabled && supported for scenario
  status: StageStatus
}

// Alias mapping for backend stage name variations
// Maps normalized names (lowercase, hyphenated) to canonical StageIds
export const STAGE_ALIASES: Record<string, StageId> = {
  // Fetch neighborhood variations
  'fetch-upstream-neighborhood': 'fetch-neighborhood',
  'fetch-upstream-neighborhoods': 'fetch-neighborhood',
  'fetch-topology': 'fetch-neighborhood',
  'topology-fetch': 'fetch-neighborhood',
  'fetch-graph-data': 'fetch-neighborhood',
  'graph-fetch': 'fetch-neighborhood',

  // Scenario parse / validate variations
  'validate-request': 'scenario-parse',
  'request-validation': 'scenario-parse',
  'parse-request': 'scenario-parse',
  'input-validation': 'scenario-parse',

  // Build snapshot variations
  'identify-target-service': 'build-snapshot',
  'build-graph-snapshot': 'build-snapshot',
  'snapshot-build': 'build-snapshot',

  // Compute impact variations
  'compute-affected-callers': 'compute-impact',
  'impact-analysis': 'compute-impact',
  'compute-latency-impact': 'compute-impact',
  'latency-impact': 'compute-impact',

  // Path analysis variations
  'find-critical-paths': 'path-analysis',
  'critical-paths': 'path-analysis',
  'identify-affected-paths': 'path-analysis',
  'affected-paths': 'path-analysis',

  // Recommendations variations
  'generate-recommendations': 'recommendations',
  'generate-recommendation': 'recommendations',
  'recommendation-generation': 'recommendations',

  // Apply scaling model variations
  'apply-scaling': 'apply-scaling-model',
  'scaling-model': 'apply-scaling-model',
  'compute-scaling': 'apply-scaling-model',

  // Staleness check variations
  'freshness-check': 'staleness-check',
  'data-freshness': 'staleness-check',
  'check-staleness': 'staleness-check',
}

// Standard pipeline stages in execution order
export const PIPELINE_STAGES: readonly PipelineStageDefinition[] = [
  {
    id: 'scenario-parse',
    name: 'Scenario Parse',
    description: 'Validate and parse input parameters',
    supportedScenarios: ['failure', 'scale'],
  },
  {
    id: 'staleness-check',
    name: 'Staleness Check',
    description: 'Check graph data freshness',
    supportedScenarios: ['failure', 'scale'],
  },
  {
    id: 'fetch-neighborhood',
    name: 'Fetch Neighborhood',
    description: 'Retrieve service topology from Graph Engine',
    supportedScenarios: ['failure', 'scale'],
  },
  {
    id: 'build-snapshot',
    name: 'Build Snapshot',
    description: 'Construct graph snapshot for analysis',
    supportedScenarios: ['failure', 'scale'],
  },
  {
    id: 'apply-scaling-model',
    name: 'Apply Scaling Model',
    description: 'Calculate scaling impact (scale scenarios only)',
    supportedScenarios: ['scale'],
  },
  {
    id: 'path-analysis',
    name: 'Path Analysis',
    description: 'Analyze critical paths and dependencies',
    supportedScenarios: ['failure', 'scale'],
  },
  {
    id: 'compute-impact',
    name: 'Compute Impact',
    description: 'Calculate affected services and impact metrics',
    supportedScenarios: ['failure', 'scale'],
  },
  {
    id: 'recommendations',
    name: 'Recommendations',
    description: 'Generate actionable recommendations',
    supportedScenarios: ['failure', 'scale'],
  },
]

/**
 * Helper Functions for Stage Management
 */

/**
 * Get the index of a stage by its ID
 */
export function stageIndex(id: StageId): number {
  return PIPELINE_STAGES.findIndex((s) => s.id === id)
}

/**
 * Find the next enabled stage index in the specified direction
 * @param currentIndex - Current stage index
 * @param stageStates - Record of stage states
 * @param direction - 1 for forward, -1 for backward
 * @returns Index of next enabled stage, or null if none found
 */
export function nextEnabledStageIndex(
  currentIndex: number,
  stageStates: Record<StageId, StageState>,
  direction: 1 | -1 = 1
): number | null {
  let index = currentIndex + direction

  while (index >= 0 && index < PIPELINE_STAGES.length) {
    const stage = PIPELINE_STAGES[index]
    if (stage && stageStates[stage.id]?.enabled) {
      return index
    }
    index += direction
  }

  return null
}

/**
 * Resolve the stop index based on requested stop stage ID
 * If the requested stage is disabled, resolves to the nearest previous enabled stage
 * @param requestedStopId - Requested stop stage ID (null = no stop)
 * @param stageStates - Record of stage states
 * @returns Resolved stop index, or null if no stop
 */
export function resolveStopIndex(
  requestedStopId: StageId | null,
  stageStates: Record<StageId, StageState>
): number | null {
  if (!requestedStopId) return null

  const requestedIndex = stageIndex(requestedStopId)
  if (requestedIndex === -1) return null

  // If requested stage is enabled, use it
  if (stageStates[requestedStopId]?.enabled) {
    return requestedIndex
  }

  // Find nearest previous enabled stage
  let index = requestedIndex - 1
  while (index >= 0) {
    const stage = PIPELINE_STAGES[index]
    if (stage && stageStates[stage.id]?.enabled) {
      return index
    }
    index--
  }

  // No enabled stage before requested - return first enabled stage
  return nextEnabledStageIndex(-1, stageStates, 1)
}

/**
 * Check if a stage is completed
 * Completed means: enabled AND stageIndex <= currentStageIndex AND (stopAtIndex == null OR stageIndex <= stopAtIndex)
 * @param stageId - Stage ID to check
 * @param currentStageIndex - Current playback index (null = not started)
 * @param stageStates - Record of stage states
 * @param stopAtIndex - Stop index (null = no stop)
 * @returns true if stage is completed
 */
export function isStageCompleted(
  stageId: StageId,
  currentStageIndex: number | null,
  stageStates: Record<StageId, StageState>,
  stopAtIndex: number | null
): boolean {
  const idx = stageIndex(stageId)
  if (idx === -1) return false

  const state = stageStates[stageId]
  if (!state?.enabled) return false

  if (currentStageIndex === null) return false
  if (idx > currentStageIndex) return false

  if (stopAtIndex !== null && idx > stopAtIndex) return false

  return true
}

/**
 * Get the stage definition by ID
 */
export function getStageDef(id: StageId): PipelineStageDefinition | undefined {
  return PIPELINE_STAGES.find((s) => s.id === id)
}

/**
 * Check if a stage is supported for a given scenario type
 */
export function isStageSupported(stageId: StageId, scenarioType: ScenarioType): boolean {
  const stage = getStageDef(stageId)
  if (!stage) return false
  return stage.supportedScenarios.includes(scenarioType)
}

/**
 * Derive stage state from user preference and scenario support
 * Deterministically computes enabled state: userEnabled && supported
 */
export function deriveStageState(prev: StageState, scenarioType: ScenarioType): StageState {
  const supported = isStageSupported(prev.id, scenarioType)
  const enabled = supported && prev.userEnabled
  const status: StageStatus = enabled ? 'pending' : 'skipped'
  return { ...prev, enabled, status }
}

/**
 * Normalize stage name to StageId
 * Handles name variations from backend trace via STAGE_ALIASES
 */
export function normalizeStageKey(name: string): StageId | null {
  // Step 1: Normalize raw string (trim, lowercase, join)
  const normalized = name.trim().toLowerCase().split(/\s+/).join('-')

  // Step 2: Check alias mapping first
  if (normalized in STAGE_ALIASES) {
    return STAGE_ALIASES[normalized]
  }

  // Step 3: Check if normalized matches a known StageId directly
  const found = PIPELINE_STAGES.find((s) => s.id === normalized)
  if (found) return found.id

  // Step 4: Check if it matches any stage's name when normalized
  const foundByName = PIPELINE_STAGES.find(
    (s) => s.name.toLowerCase().split(/\s+/).join('-') === normalized
  )
  return foundByName?.id ?? null
}

/**
 * Get list of runnable stage IDs (enabled and supported for scenario)
 */
export function getRunnableStageIds(
  stageStates: Record<StageId, StageState>,
  scenarioType: ScenarioType
): StageId[] {
  return PIPELINE_STAGES.filter((stage) => {
    const state = stageStates[stage.id]
    return state?.enabled && isStageSupported(stage.id, scenarioType)
  }).map((s) => s.id)
}

/**
 * Resolve stop stage ID to nearest valid runnable stage
 * Returns the requested stage if valid, or the nearest previous enabled+supported stage
 */
export function resolveStopStageId(
  requestedStopStageId: StageId | null,
  stageStates: Record<StageId, StageState>,
  scenarioType: ScenarioType
): { resolved: StageId | null; wasAutoResolved: boolean; reason?: string } {
  if (!requestedStopStageId) {
    return { resolved: null, wasAutoResolved: false }
  }

  const isSupported = isStageSupported(requestedStopStageId, scenarioType)
  const isEnabled = stageStates[requestedStopStageId]?.enabled ?? false

  // If requested stage is valid, use it
  if (isSupported && isEnabled) {
    return { resolved: requestedStopStageId, wasAutoResolved: false }
  }

  // Find nearest previous enabled+supported stage
  const requestedIndex = stageIndex(requestedStopStageId)
  if (requestedIndex === -1) {
    return { resolved: null, wasAutoResolved: true, reason: 'Invalid stage ID' }
  }

  for (let i = requestedIndex - 1; i >= 0; i--) {
    const candidateStage = PIPELINE_STAGES[i]
    if (
      candidateStage &&
      isStageSupported(candidateStage.id, scenarioType) &&
      stageStates[candidateStage.id]?.enabled
    ) {
      const reason = isSupported
        ? 'Requested stage is disabled'
        : 'Requested stage not supported for this scenario'
      return { resolved: candidateStage.id, wasAutoResolved: true, reason }
    }
  }

  // No valid previous stage found
  return {
    resolved: null,
    wasAutoResolved: true,
    reason: 'No enabled stages before requested stop point',
  }
}

/**
 * Get the index of the first runnable stage (enabled + supported)
 * Returns null if no runnable stages exist
 */
export function getFirstRunnableIndex(
  stageStates: Record<StageId, StageState>,
  scenarioType: ScenarioType
): number | null {
  for (let i = 0; i < PIPELINE_STAGES.length; i++) {
    const stage = PIPELINE_STAGES[i]
    if (stage && isStageSupported(stage.id, scenarioType) && stageStates[stage.id]?.enabled) {
      return i
    }
  }
  return null
}
