import { createApiClient } from '@/lib/httpClient'

/**
 * Resolve base URL for Predictive Analysis Engine
 * - DEV: Uses Vite proxy (/api → localhost:7000)
 * - PROD: Uses VITE_PREDICTIVE_API_BASE_URL env var
 */
function resolvePredictiveBaseUrl(): string {
  if (import.meta.env.DEV) {
    return '/api'
  }
  return import.meta.env.VITE_PREDICTIVE_API_BASE_URL || 'http://localhost:7000'
}

/**
 * Axios client for Predictive Analysis Engine API
 *
 * Endpoints:
 * - GET /health
 * - POST /simulate/failure?trace=true
 * - POST /simulate/scale?trace=true
 *
 * @see predictive-analysis-engine/openapi.yaml
 */
export const predictiveApi = createApiClient(resolvePredictiveBaseUrl())
