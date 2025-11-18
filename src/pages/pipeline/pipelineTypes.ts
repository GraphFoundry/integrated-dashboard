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

export interface PipelineStageDefinition {
  id: StageId
  name: string
  description: string
  scaleOnly: boolean
}

export interface StageState {
  id: StageId
  enabled: boolean
  status: StageStatus
}

// Standard pipeline stages in execution order
export const PIPELINE_STAGES: readonly PipelineStageDefinition[] = [
  {
    id: 'scenario-parse',
    name: 'Scenario Parse',
    description: 'Validate and parse input parameters',
    scaleOnly: false,
  },
  {
    id: 'staleness-check',
    name: 'Staleness Check',
    description: 'Check graph data freshness',
    scaleOnly: false,
  },
  {
    id: 'fetch-neighborhood',
    name: 'Fetch Neighborhood',
    description: 'Retrieve service topology from Graph Engine',
    scaleOnly: false,
  },
  {
    id: 'build-snapshot',
    name: 'Build Snapshot',
    description: 'Construct graph snapshot for analysis',
    scaleOnly: false,
  },
  {
    id: 'apply-scaling-model',
    name: 'Apply Scaling Model',
    description: 'Calculate scaling impact (scale scenarios only)',
    scaleOnly: true,
  },
  {
    id: 'path-analysis',
    name: 'Path Analysis',
    description: 'Analyze critical paths and dependencies',
    scaleOnly: false,
  },
  {
    id: 'compute-impact',
    name: 'Compute Impact',
    description: 'Calculate affected services and impact metrics',
    scaleOnly: false,
  },
  {
    id: 'recommendations',
    name: 'Recommendations',
    description: 'Generate actionable recommendations',
    scaleOnly: false,
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
 * Normalize stage name to StageId
 * Handles name variations from backend trace
 */
export function normalizeStageKey(name: string): StageId | null {
  const normalized = name.toLowerCase().split(/\s+/).join('-')
  const found = PIPELINE_STAGES.find(
    (s) => s.id === normalized || s.name.toLowerCase().split(/\s+/).join('-') === normalized
  )
  return found?.id ?? null
}
