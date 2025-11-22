// ─────────────────────────────────────────────────────────────────────────────
// Pipeline Trace Types
// ─────────────────────────────────────────────────────────────────────────────

export type PipelineTraceStage = {
  name: string
  ms: number
  summary?: Record<string, unknown>
  warnings?: string[]
}

export type PipelineTrace = {
  options: {
    trace: boolean
    includeSnapshot?: boolean
    includeRawPaths?: boolean
    includeEdgeDetails?: boolean
  }
  stages: PipelineTraceStage[]
  generatedAt: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared Types (used by both Failure and Scale responses)
// ─────────────────────────────────────────────────────────────────────────────

export type DataFreshness = {
  source?: string
  stale?: boolean
  lastUpdatedSecondsAgo?: number
  windowMinutes?: number
}

export type Neighborhood = {
  description?: string
  serviceCount: number
  edgeCount: number
  depthUsed: number
  generatedAt: string
}

export type ServiceRef = {
  serviceId?: string
  name?: string
  namespace?: string
}

export type Recommendation = {
  type?: string
  priority?: string
  description?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Failure Simulation Types
// ─────────────────────────────────────────────────────────────────────────────

export type FailureAffectedCaller = {
  serviceId?: string
  name?: string
  namespace?: string
  lostTrafficRps?: number
  edgeErrorRate?: number
}

export type FailureAffectedDownstream = {
  serviceId?: string
  name?: string
  namespace?: string
  lostTrafficRps?: number
  edgeErrorRate?: number
}

export type CriticalPath = {
  path?: string[]
  pathRps?: number
  id?: string
  length?: number
}

export type FailureResponse = {
  pipelineTrace?: PipelineTrace
  correlationId?: string
  target?: ServiceRef
  neighborhood?: Neighborhood
  dataFreshness?: DataFreshness
  confidence?: 'high' | 'medium' | 'low'
  explanation?: string
  affectedCallers?: FailureAffectedCaller[]
  affectedDownstream?: FailureAffectedDownstream[]
  unreachableServices?: ServiceRef[]
  criticalPathsToTarget?: CriticalPath[]
  totalLostTrafficRps?: number
  recommendations?: Recommendation[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Scale Simulation Types
// ─────────────────────────────────────────────────────────────────────────────

export type LatencyEstimate = {
  description?: string
  baselineMs?: number | null
  projectedMs?: number | null
  deltaMs?: number | null
  unit?: string
}

export type ScaleAffectedCaller = {
  serviceId?: string
  name?: string
  hopDistance?: number
  beforeMs?: number
  afterMs?: number
  deltaMs?: number
  endToEndDeltaMs?: number
  viaPath?: string[]
}

export type ScaleAffectedPath = {
  path?: string[]
  pathRps?: number
  beforeMs?: number
  afterMs?: number
  deltaMs?: number
  incompleteData?: boolean
}

export type ScaleResponse = {
  pipelineTrace?: PipelineTrace
  correlationId?: string
  target?: ServiceRef
  scalingDirection?: 'up' | 'down' | 'same'
  latencyEstimate?: LatencyEstimate
  affectedCallers?: ScaleAffectedCaller[] | { description?: string; items?: ScaleAffectedCaller[] }
  affectedPaths?: ScaleAffectedPath[]
  explanation?: string
  warnings?: string[]
  recommendations?: Recommendation[]
}

export type ScenarioType = 'failure' | 'scale'

export type FailureScenario = {
  type: 'failure'
  serviceId: string
  maxDepth: number
}

export type ScaleScenario = {
  type: 'scale'
  serviceId: string
  currentPods: number
  newPods: number
  latencyMetric: 'p50' | 'p95' | 'p99'
  maxDepth: number
}

export type Scenario = FailureScenario | ScaleScenario

// ─────────────────────────────────────────────────────────────────────────────
// Proof Metadata — tracks run context for operator auditability
// ─────────────────────────────────────────────────────────────────────────────

export type LastRunMeta = {
  /** The X-Request-Id sent with the simulation request */
  requestId: string
  /** ISO timestamp when run was initiated */
  startedAt: string
  /** ISO timestamp when run completed (set on success) */
  completedAt?: string
  /** Source mode: 'live' for real API, 'mock' for mock data */
  source: 'live' | 'mock'
  /** Scenario inputs used for this run */
  scenario: Scenario
}
