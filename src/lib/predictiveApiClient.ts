import { createApiClient } from '@/lib/httpClient'

const BFF_BASE_URL = import.meta.env.VITE_BFF_URL || ''

/**
 * Axios client for Predictive Analysis Engine API
 *
 * All requests are routed through the BFF gateway.
 * The BFF proxies /api/predictive/* to the downstream Predictive Analysis Engine.
 *
 * @see predictive-analysis-engine/openapi.yaml
 */
export const predictiveApi = createApiClient(`${BFF_BASE_URL}/api/predictive`)
