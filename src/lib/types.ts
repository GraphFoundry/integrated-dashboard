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

// ─────────────────────────────────────────────────────────────────────────────
// Service Discovery Types
// ─────────────────────────────────────────────────────────────────────────────

export type DiscoveredService = {
  /** Canonical service ID in format 'namespace:name' */
  serviceId: string
  /** Service name */
  name: string
  /** Kubernetes namespace */
  namespace: string
}

export type ServicesResponse = {
  /** List of services from the current graph snapshot */
  services: DiscoveredService[]
  /** Total number of services discovered */
  count: number
  /** Whether the graph data is stale (older than expected window) */
  stale: boolean
  /** Seconds since last graph update (null if unavailable) */
  lastUpdatedSecondsAgo: number | null
  /** Expected freshness window in minutes */
  windowMinutes: number
  /** Error message if service discovery failed */
  error?: string
  /** Dependency edges for the graph */
  edges?: { source: string; target: string }[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Telemetry Types (InfluxDB 3 queries)
// ─────────────────────────────────────────────────────────────────────────────

export type TelemetryMetricsRequest = {
  service: string
  from: string
  to: string
  step?: number
}

export type TelemetryDatapoint = {
  timestamp: string
  service: string
  namespace: string
  requestRate: number
  errorRate: number
  p50: number
  p95: number
  p99: number
  availability: number
}

export type TelemetryMetricsResponse = {
  service: string
  from: string
  to: string
  step: number
  datapoints: TelemetryDatapoint[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Decision Log Types (SQLite decision history)
// ─────────────────────────────────────────────────────────────────────────────

export type DecisionHistoryRequest = {
  limit?: number
  offset?: number
  type?: string
}

export type DecisionRecord = {
  id: number
  timestamp: string
  type: string
  scenario: Record<string, unknown>
  result: Record<string, unknown>
  correlationId: string | null
  createdAt: string
}

export type DecisionHistoryResponse = {
  decisions: DecisionRecord[]
  pagination: {
    limit: number
    offset: number
    total: number
  }
}

export type LogDecisionRequest = {
  timestamp: string
  type: string
  scenario: Record<string, unknown>
  result: Record<string, unknown>
  correlationId?: string
}

export type LogDecisionResponse = {
  id: number
  timestamp: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Dependency Graph Snapshot Types (Incident Explorer)
// ─────────────────────────────────────────────────────────────────────────────

export type GraphRiskLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN'

export type GraphNode = {
  id: string            // stable key (namespace:name)
  name: string
  namespace: string
  riskLevel: GraphRiskLevel
  riskReason?: string

  // aggregated telemetry (optional if unavailable)
  reqRate?: number          // requests/sec
  errorRatePct?: number     // %
  latencyP95Ms?: number     // ms
  availabilityPct?: number  // %
  updatedAt?: string
}

export type GraphEdge = {
  id: string
  source: string // node id
  target: string // node id

  // optional edge telemetry if available
  reqRate?: number
  errorRatePct?: number
  latencyP95Ms?: number
}

export type GraphSnapshot = {
  nodes: GraphNode[]
  edges: GraphEdge[]
  metadata?: {
    stale?: boolean
    lastUpdatedSecondsAgo?: number | null
    windowMinutes?: number
    nodeCount?: number
    edgeCount?: number
    generatedAt?: string
  }
}
