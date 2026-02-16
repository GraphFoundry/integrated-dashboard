import { createApiClient } from '@/lib/httpClient'

const PREDICTIVE_API_BASE_URL = import.meta.env.VITE_PREDICTIVE_API_BASE_URL || 'http://localhost:7000'

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
export const predictiveApi = createApiClient(PREDICTIVE_API_BASE_URL)
