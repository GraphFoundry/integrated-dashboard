import { createApiClient } from '@/lib/httpClient'

function resolveAlertsBaseUrl(): string {
  if (import.meta.env.DEV) {
    // In development we expect the Vite proxy to forward /api to the alerts backend
    return '/api'
  }
  return import.meta.env.VITE_ALERTS_API_BASE_URL || 'http://localhost:8002'
}

export const alertsApi = createApiClient(resolveAlertsBaseUrl())

export async function listAlerts(params?: Record<string, unknown>) {
  const { data } = await alertsApi.get('/alerts', { params })
  return data
}

export async function getAlert(eventId: string) {
  const { data } = await alertsApi.get(`/alerts/${encodeURIComponent(eventId)}`)
  return data
}

export async function acknowledgeAlert(eventId: string) {
  // Best-effort acknowledge endpoint — dashboard-bff should implement this
  const { data } = await alertsApi.post(`/alerts/${encodeURIComponent(eventId)}/acknowledge`)
  return data
}

export async function getWsStats() {
  const { data } = await alertsApi.get('/api/ws/stats')
  return data
}
