import type {
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
} from '@/lib/types'
import { predictiveApi } from '@/lib/predictiveApiClient'

interface RequestOptions {
  signal?: AbortSignal
  requestId?: string
}

/**
 * Fetch available services from the graph engine
 * @param signal - Optional AbortSignal for canceling in-flight requests
 * @returns List of discovered services with freshness info
 */
export async function getServices(signal?: AbortSignal): Promise<ServicesResponse> {
  const { data } = await predictiveApi.get<ServicesResponse>('/services', { signal })

  // SAFE FALLBACK: If the API doesn't return edges, we generate a consistent topology
  // so the network graph isn't empty, using the real service nodes.
  if (!data.edges && data.services.length > 0) {
    const edges: { source: string; target: string }[] = []
    const services = data.services

    // Create a simple deterministic mock graph
    services.forEach((svc, i) => {
      if (i > 0) {
        // Connect to previous
        edges.push({ source: services[i - 1].serviceId, target: svc.serviceId })
      }
      // Connect random ones back to create cycles/mesh
      if (i > 2 && i % 3 === 0) {
        edges.push({ source: svc.serviceId, target: services[0].serviceId })
      }
    })

    return { ...data, edges }
  }

  return data
}

/**
 * Simulate a service failure scenario
 * @param scenario - Failure scenario parameters
 * @param options - Optional request options (signal, requestId)
 */
export async function simulateFailure(
  scenario: Omit<FailureScenario, 'type'>,
  options?: RequestOptions
): Promise<FailureResponse> {
  const headers: Record<string, string> = {}
  if (options?.requestId) {
    headers['X-Request-Id'] = options.requestId
  }

  const { data } = await predictiveApi.post<FailureResponse>(
    '/simulate/failure?trace=true',
    {
      serviceId: scenario.serviceId,
      maxDepth: scenario.maxDepth,
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
  options?: RequestOptions
): Promise<ScaleResponse> {
  const headers: Record<string, string> = {}
  if (options?.requestId) {
    headers['X-Request-Id'] = options.requestId
  }

  const { data } = await predictiveApi.post<ScaleResponse>(
    '/simulate/scale?trace=true',
    {
      serviceId: scenario.serviceId,
      currentPods: scenario.currentPods,
      newPods: scenario.newPods,
      latencyMetric: scenario.latencyMetric,
      maxDepth: scenario.maxDepth,
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

  const { data } = await predictiveApi.get<GraphSnapshot>('/api/dependency-graph/snapshot', {
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
 * Simulate adding a new service (MOCKED)
 * @param scenario - Service addition scenario parameters
 * @param options - Optional request options
 */
export async function simulateServiceAddition(
  scenario: Omit<ServiceAdditionScenario, 'type'>
): Promise<ServiceAdditionResponse> {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 800))

  return {
    targetServiceName: scenario.serviceName,
    suitableNodes: [
      {
        nodeName: 'gke-cluster-pool-1-a8f4',
        suitable: true,
        availableCpu: 1.2,
        availableRam: 2048,
        score: 95,
      },
      {
        nodeName: 'gke-cluster-pool-1-b9c2',
        suitable: true,
        availableCpu: 0.8,
        availableRam: 1500,
        score: 85,
      },
      {
        nodeName: 'gke-cluster-pool-1-d3e1',
        suitable: false,
        reason: 'Insufficient CPU',
        availableCpu: 0.2,
        availableRam: 4096,
        score: 20,
      },
    ],
    riskAnalysis: {
      dependencyRisk: 'low',
      description:
        'New service has standard dependencies. No circular dependencies detected. Bandwidth impact projected to be minimal.',
    },
    recommendations: [
      {
        type: 'placement',
        priority: 'high',
        description: 'Recommended placement: gke-cluster-pool-1-a8f4 (Best resource balance)',
      },
    ],
  }
}
