import { createApiClient } from '@/lib/httpClient'

/**
 * Resolve base URL for Graph Dependency Alert Engine
 * - Uses VITE_GRAPH_ALERT_API_BASE_URL env var
 * - Placeholder port until service is available
 */
function resolveAlertBaseUrl(): string {
  return import.meta.env.VITE_GRAPH_ALERT_API_BASE_URL || 'http://localhost:PORT'
}

/**
 * Axios client for Graph Dependency Alert Engine API
 *
 * Endpoints: TBD by Alert Engine team
 *
 * @see graph-dependency-alert-engine (teammate's service)
 */
export const graphAlertApi = createApiClient(resolveAlertBaseUrl())
