import { predictiveApi } from '@/lib/predictiveApiClient'

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

export const listDrillHistory = async (): Promise<DrillRun[]> => {
    const response = await predictiveApi.get(`/drills/history`)
    return response.data
}
