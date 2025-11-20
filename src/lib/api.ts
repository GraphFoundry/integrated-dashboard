import type { FailureResponse, ScaleResponse, FailureScenario, ScaleScenario } from '@/lib/types'
import { predictiveApi } from '@/lib/httpClient'

export async function simulateFailure(
  scenario: Omit<FailureScenario, 'type'>
): Promise<FailureResponse> {
  const { data } = await predictiveApi.post<FailureResponse>('/simulate/failure?trace=true', {
    serviceId: scenario.serviceId,
    maxDepth: scenario.maxDepth,
  })
  return data
}

export async function simulateScale(scenario: Omit<ScaleScenario, 'type'>): Promise<ScaleResponse> {
  const { data } = await predictiveApi.post<ScaleResponse>('/simulate/scale?trace=true', {
    serviceId: scenario.serviceId,
    currentPods: scenario.currentPods,
    newPods: scenario.newPods,
    latencyMetric: scenario.latencyMetric,
    maxDepth: scenario.maxDepth,
  })
  return data
}

export async function healthCheck(): Promise<{ status: string }> {
  const { data } = await predictiveApi.get<{ status: string }>('/health')
  return data
}
