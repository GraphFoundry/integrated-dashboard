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
