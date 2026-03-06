import { createApiClient } from '@/lib/httpClient'

const BFF_BASE_URL = import.meta.env.VITE_BFF_URL || ''

/**
 * Axios client for Kubernetes Scheduler Extender API
 *
 * All requests are routed through the BFF gateway.
 * The BFF proxies /api/scheduler/* to the downstream Scheduler Extender API.
 */
export const schedulerApi = createApiClient(`${BFF_BASE_URL}/api/scheduler`)
