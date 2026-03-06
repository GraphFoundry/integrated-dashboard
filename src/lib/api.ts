import type {
  DiscoveredService,
  FailureResponse,
  ScaleResponse,
  FailureScenario,
  ScaleScenario,
  ServicesResponse,
  TelemetryMetricsRequest,
  TelemetryMetricsResponse,
  DecisionHistoryRequest,
  DecisionHistoryResponse,
  LogDecisionRequest,
  LogDecisionResponse,
  GraphSnapshot,
  ServiceWithPlacement,
  ServiceAdditionScenario,
  ServiceAdditionResponse,
  NodeWithResources,
  DecisionCompareResponse,
  SimulationCapabilitiesResponse,
  SimulationContextResponse,
  SimulationMetricsResponse,
  DemoSnapshotsResponse,
  PredictiveCurrentActionResponse,
} from '@/lib/types'
import { predictiveApi } from '@/lib/predictiveApiClient'

interface RequestOptions {
  signal?: AbortSignal
  requestId?: string
}

interface SimulationRunOptions extends RequestOptions {
  mode?: 'live' | 'demo'
  snapshotId?: string
}

const SERVICE_CACHE_KEY = 'predictive_services_cache_v1'

const SEEDED_SERVICES: DiscoveredService[] = [
  { serviceId: 'default:frontend', name: 'frontend', namespace: 'default', podCount: 3, availability: 0.99 },
  { serviceId: 'default:checkoutservice', name: 'checkoutservice', namespace: 'default', podCount: 2, availability: 0.99 },
  { serviceId: 'default:paymentservice', name: 'paymentservice', namespace: 'default', podCount: 2, availability: 0.98 },
  { serviceId: 'default:recommendationservice', name: 'recommendationservice', namespace: 'default', podCount: 2, availability: 0.99 },
  { serviceId: 'default:cartservice', name: 'cartservice', namespace: 'default', podCount: 2, availability: 0.99 },
]

function normalizeServiceRecord(service: DiscoveredService): DiscoveredService {
  const rawServiceId = service.serviceId?.trim()
  if (rawServiceId && rawServiceId.includes(':')) {
    const [rawNamespace, rawName] = rawServiceId.split(':', 2)
    return {
      serviceId: `${rawNamespace || 'default'}:${rawName}`,
      name: service.name || rawName,
      namespace: service.namespace || rawNamespace || 'default',
      podCount: service.podCount,
      availability: service.availability,
    }
  }

  const namespace = service.namespace?.trim() || 'default'
  const name = service.name?.trim() || rawServiceId || ''
  return {
    serviceId: `${namespace}:${name}`,
    name,
    namespace,
    podCount: service.podCount,
    availability: service.availability,
  }
}

export function getSeededServices(): DiscoveredService[] {
  return SEEDED_SERVICES.map((service) => ({ ...service }))
}

export function getCachedServices(): DiscoveredService[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(SERVICE_CACHE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item): item is DiscoveredService => Boolean(item?.serviceId || (item?.name && item?.namespace)))
      .map((service) => normalizeServiceRecord(service))
  } catch {
    return []
  }
}

export function cacheServices(services: DiscoveredService[]): void {
  if (typeof window === 'undefined') return
  try {
    const normalized = dedupeServices(services)
    if (normalized.length === 0) return
    window.localStorage.setItem(SERVICE_CACHE_KEY, JSON.stringify(normalized))
  } catch {
    // Ignore localStorage quota or private mode errors.
  }
}

const INFRASTRUCTURE_NAMESPACES = [
  'istio-system',
  'kube-system',
  'monitoring',
  'logging',
  'kiali-operator',
  'jaeger-operator',
  'cert-manager',
  'ingress-nginx',
]

const INFRASTRUCTURE_SERVICE_PATTERNS = [
  'kiali',
  'jaeger',
  'prometheus',
  'grafana',
  'istio-',
  'kube-',
  'node-exporter',
  'blackbox-exporter',
  'alertmanager',
]

export function isInfrastructureService(service: { name: string; namespace: string }): boolean {
  if (INFRASTRUCTURE_NAMESPACES.includes(service.namespace)) {
    return true
  }

  const name = service.name.toLowerCase()
  return INFRASTRUCTURE_SERVICE_PATTERNS.some((pattern) => name.includes(pattern))
}

export function dedupeServices(services: DiscoveredService[]): DiscoveredService[] {
  const byId = new Map<string, DiscoveredService>()
  for (const service of services) {
    const normalized = normalizeServiceRecord(service)
    if (!normalized.name || isInfrastructureService(normalized)) continue
    byId.set(normalized.serviceId, normalized)
  }
  return Array.from(byId.values()).sort((a, b) => a.serviceId.localeCompare(b.serviceId))
}

interface ResilientServiceOptions {
  includeSeeded?: boolean
}

export function getResilientServices(
  primary: DiscoveredService[] = [],
  options: ResilientServiceOptions = {}
): DiscoveredService[] {
  const includeSeeded = options.includeSeeded ?? true
  return dedupeServices([
    ...primary,
    ...getCachedServices(),
    ...(includeSeeded ? getSeededServices() : []),
  ])
}

function buildSimulationQuery(options?: SimulationRunOptions): string {
  const params = new URLSearchParams({ trace: 'true' })
  if (options?.mode === 'demo') {
    params.set('mode', 'demo')
    if (options.snapshotId) {
      params.set('snapshotId', options.snapshotId)
    }
  }
  return params.toString()
}

/**
 * Fetch available services from the graph engine
 * @param signal - Optional AbortSignal for canceling in-flight requests
 * @returns List of discovered services with freshness info
 */
export async function getServices(signal?: AbortSignal): Promise<ServicesResponse> {
  const { data } = await predictiveApi.get<ServicesResponse>('/services', { signal })
  const normalizedServices = dedupeServices(data.services ?? [])
  cacheServices(normalizedServices)
  return {
    ...data,
    services: normalizedServices,
    count: normalizedServices.length,
  }
}

/**
 * Simulate a service failure scenario
 * @param scenario - Failure scenario parameters
 * @param options - Optional request options (signal, requestId)
 */
export async function simulateFailure(
  scenario: Omit<FailureScenario, 'type'>,
  options?: SimulationRunOptions
): Promise<FailureResponse> {
  const headers: Record<string, string> = {}
  if (options?.requestId) {
    headers['X-Request-Id'] = options.requestId
  }

  const query = buildSimulationQuery(options)

  const { data } = await predictiveApi.post<FailureResponse>(
    `/simulate/failure?${query}`,
    {
      serviceId: scenario.serviceId,
      depth: scenario.maxDepth,
      maxDepth: scenario.maxDepth,
      timeWindow: scenario.timeWindow,
    },
    { signal: options?.signal, headers }
  )
  return data
}

/**
 * Simulate a scaling scenario
 * @param scenario - Scale scenario parameters
 * @param options - Optional request options (signal, requestId)
 */
export async function simulateScale(
  scenario: Omit<ScaleScenario, 'type'>,
  options?: SimulationRunOptions
): Promise<ScaleResponse> {
  const headers: Record<string, string> = {}
  if (options?.requestId) {
    headers['X-Request-Id'] = options.requestId
  }

  const query = buildSimulationQuery(options)

  const { data } = await predictiveApi.post<ScaleResponse>(
    `/simulate/scale?${query}`,
    {
      serviceId: scenario.serviceId,
      currentPods: scenario.currentPods,
      newPods: scenario.newPods,
      latencyMetric: scenario.latencyMetric,
      maxDepth: scenario.maxDepth,
      topPaths: scenario.topPaths,
      timeWindow: scenario.timeWindow,
    },
    { signal: options?.signal, headers }
  )
  return data
}

/**
 * Check predictive engine health
 * @param signal - Optional AbortSignal for canceling in-flight requests
 */
export async function healthCheck(signal?: AbortSignal): Promise<{ status: string }> {
  const { data } = await predictiveApi.get<{ status: string }>('/health', { signal })
  return data
}

/**
 * Fetch current predictive anomaly recommendation for operator actioning.
 * Routed via BFF path: /api/predictive/predictive/actions/current
 */
export async function getCurrentPredictiveAction(
  signal?: AbortSignal
): Promise<PredictiveCurrentActionResponse> {
  const { data } = await predictiveApi.get<PredictiveCurrentActionResponse>(
    '/predictive/actions/current',
    { signal }
  )
  return data
}

/**
 * Get telemetry metrics for a service
 * @param params - Query parameters (service, from, to, step)
 */
export async function getTelemetryMetrics(
  params: TelemetryMetricsRequest
): Promise<TelemetryMetricsResponse> {
  const { data } = await predictiveApi.get<TelemetryMetricsResponse>('/telemetry/service', {
    params,
  })
  return data
}

/**
 * Get decision history logs
 * @param params - Query parameters (limit, offset, type)
 */
export async function getDecisionHistory(
  params: DecisionHistoryRequest
): Promise<DecisionHistoryResponse> {
  const { data } = await predictiveApi.get<DecisionHistoryResponse>('/decisions/history', {
    params,
  })
  return data
}

export async function getDecisionById(id: number): Promise<DecisionHistoryResponse['decisions'][number]> {
  const { data } = await predictiveApi.get<DecisionHistoryResponse['decisions'][number]>(`/decisions/${id}`)
  return data
}

export async function compareDecisions(leftId: number, rightId: number): Promise<DecisionCompareResponse> {
  const { data } = await predictiveApi.post<DecisionCompareResponse>('/decisions/compare', {
    leftId,
    rightId,
  })
  return data
}

export async function exportDecision(id: number, format: 'json' | 'csv' = 'json'): Promise<Blob> {
  const { data } = await predictiveApi.get(`/decisions/${id}/export`, {
    params: { format },
    responseType: 'blob',
  })
  return data as Blob
}

export async function getSimulationOutcomesMetrics(
  window = '7d'
): Promise<SimulationMetricsResponse> {
  const { data } = await predictiveApi.get<SimulationMetricsResponse>('/simulations/metrics', {
    params: { window },
  })
  return data
}

export async function getSimulationCapabilities(): Promise<SimulationCapabilitiesResponse> {
  const { data } = await predictiveApi.get<SimulationCapabilitiesResponse>('/simulations/capabilities')
  return data
}

export async function getSimulationContext(params: {
  serviceId: string
  k?: number
  direction?: 'both' | 'in' | 'out'
  mode?: 'live' | 'demo'
  snapshotId?: string
}): Promise<SimulationContextResponse> {
  const { data } = await predictiveApi.get<SimulationContextResponse>('/simulate/context', {
    params,
  })
  return data
}

export async function getDemoSnapshots(): Promise<DemoSnapshotsResponse> {
  const { data } = await predictiveApi.get<DemoSnapshotsResponse>('/demo/snapshots')
  return data
}

/**
 * Log a decision from Pipeline Playground
 * @param decision - Decision log payload
 */
export async function logDecision(decision: LogDecisionRequest): Promise<LogDecisionResponse> {
  const { data } = await predictiveApi.post<LogDecisionResponse>('/decisions/log', decision)
  return data
}

/**
 * Get enriched dependency graph snapshot with telemetry
 * @param signal - Optional AbortSignal for canceling in-flight requests
 * @param namespace - Optional namespace filter
 * @returns Graph snapshot with nodes, edges, and telemetry data
 */
export async function getDependencyGraphSnapshot(
  signal?: AbortSignal,
  namespace?: string
): Promise<GraphSnapshot> {
  const params: Record<string, string> = {}
  if (namespace) {
    params.namespace = namespace
  }

  const { data } = await predictiveApi.get<GraphSnapshot>('/dependency-graph/snapshot', {
    signal,
    params,
  })
  return data
}

/**
 * Fetch services with placement data (node-level infrastructure metrics)
 * @param signal - Optional AbortSignal for canceling in-flight requests
 * @returns List of services with pod placement and container metrics
 */
export async function getServicesWithPlacement(
  signal?: AbortSignal
): Promise<{ services: ServiceWithPlacement[] }> {
  const { data } = await predictiveApi.get<{ services: ServiceWithPlacement[] }>('/services', {
    signal,
  })
  return data
}

/**
 * Simulate adding a new service
 * @param scenario - Service addition scenario parameters
 * @param options - Optional request options
 */
export async function simulateServiceAddition(
  scenario: Omit<ServiceAdditionScenario, 'type'>,
  options?: RequestOptions
): Promise<ServiceAdditionResponse> {
  const headers: Record<string, string> = {}
  if (options?.requestId) {
    headers['X-Request-Id'] = options.requestId
  }

  const { data } = await predictiveApi.post<ServiceAdditionResponse>(
    '/simulate/add',
    {
      serviceName: scenario.serviceName,
      cpuRequest: scenario.minCpuCores,
      ramRequest: scenario.minRamMB,
      replicas: scenario.replicas,
      dependencies: scenario.dependencies,
      timeWindow: scenario.timeWindow,
    },
    { signal: options?.signal, headers }
  )
  return data
}

/**
 * Fetch all infrastructure nodes with resource usage
 * @param signal - Optional AbortSignal for canceling in-flight requests
 */
export async function getNodes(signal?: AbortSignal): Promise<{ nodes: NodeWithResources[] }> {
  const { data } = await predictiveApi.get<{ nodes: NodeWithResources[] }>('/infrastructure/nodes', {
    signal,
  })
  return data
}
