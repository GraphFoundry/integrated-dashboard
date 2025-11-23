import type { FailureResponse, ScaleResponse, FailureScenario, ScaleScenario, ServicesResponse } from '@/lib/types'
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
