import type { FailureResponse, ScaleResponse, FailureScenario, ScaleScenario } from '@/lib/types'
import { predictiveApi } from '@/lib/predictiveApiClient'

/**
 * Simulate a service failure scenario
 * @param scenario - Failure scenario parameters
 * @param signal - Optional AbortSignal for canceling in-flight requests
 */
export async function simulateFailure(
  scenario: Omit<FailureScenario, 'type'>,
  signal?: AbortSignal
): Promise<FailureResponse> {
  const { data } = await predictiveApi.post<FailureResponse>(
    '/simulate/failure?trace=true',
    {
      serviceId: scenario.serviceId,
      maxDepth: scenario.maxDepth,
    },
    { signal }
  )
  return data
}

/**
 * Simulate a scaling scenario
 * @param scenario - Scale scenario parameters
 * @param signal - Optional AbortSignal for canceling in-flight requests
 */
export async function simulateScale(
  scenario: Omit<ScaleScenario, 'type'>,
  signal?: AbortSignal
): Promise<ScaleResponse> {
  const { data } = await predictiveApi.post<ScaleResponse>(
    '/simulate/scale?trace=true',
    {
      serviceId: scenario.serviceId,
      currentPods: scenario.currentPods,
      newPods: scenario.newPods,
      latencyMetric: scenario.latencyMetric,
      maxDepth: scenario.maxDepth,
    },
    { signal }
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
