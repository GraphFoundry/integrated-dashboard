import { predictiveApi } from '@/lib/predictiveApiClient'

export interface K8sHealthResult {
    reachable: boolean
    host?: string
    version?: string
    error?: string
    hint?: string
}

export interface DrillStep {
    id?: number
    runId: string
    timestamp: string
    phase: string
    message: string
    status: string
}

export interface DrillRun {
    id: string
    type: string
    target: string
    status: string
    startTime: string
    endTime?: string
    config: any
    preSnapshot?: any
    postSnapshot?: any
    verdict: string
    createdAt: string
    timeline: DrillStep[]
    canRecover?: boolean
    recoveryDeadline?: string
    recoveryMode?: 'manual_with_failsafe' | 'automatic'
    recoverySource?: 'manual' | 'failsafe' | 'abort' | 'accept'
}

export interface DrillPlanRequest {
    type: string
    target: string
    config: any
}

export const planDrill = async (request: DrillPlanRequest): Promise<DrillRun> => {
    const response = await predictiveApi.post(`/drills/plan`, request)
    return response.data
}

export const runDrill = async (runId: string): Promise<{ status: string; runId: string }> => {
    const response = await predictiveApi.post(`/drills/run`, { runId })
    return response.data
}

export const getDrillRun = async (runId: string): Promise<DrillRun> => {
    const response = await predictiveApi.get(`/drills/runs/${runId}`)
    return response.data
}

export const abortDrillRun = async (runId: string): Promise<{ status: string }> => {
    const response = await predictiveApi.post(`/drills/runs/${runId}/abort`)
    return response.data
}

export const recoverDrillRun = async (runId: string): Promise<{ status: string }> => {
    const response = await predictiveApi.post(`/drills/runs/${runId}/recover`)
    return response.data
}

export const acceptDrillRun = async (runId: string): Promise<{ status: string }> => {
    const response = await predictiveApi.post(`/drills/runs/${runId}/accept`)
    return response.data
}

export const listDrillHistory = async (): Promise<DrillRun[]> => {
    const response = await predictiveApi.get(`/drills/history`)
    return response.data
}

export const checkK8sHealth = async (): Promise<K8sHealthResult> => {
    try {
        const response = await predictiveApi.get(`/drills/k8s-health`)
        return response.data
    } catch (err: any) {
        // The endpoint returns 503 with a JSON body when unreachable
        if (err?.response?.data) {
            return err.response.data as K8sHealthResult
        }
        // Network error reaching the analysis engine itself
        return {
            reachable: false,
            error: 'Unable to reach the Analysis Engine',
            hint: 'Ensure the Analysis Engine is running and accessible.',
        }
    }
}
