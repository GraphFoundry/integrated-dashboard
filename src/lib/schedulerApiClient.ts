import { createApiClient } from '@/lib/httpClient'

const SCHEDULER_API_BASE_URL = import.meta.env.VITE_SCHEDULER_API_BASE_URL || 'http://localhost:9020'

/**
 * Axios client for Kubernetes Scheduler Extender API
 *
 * Endpoints:
 * - GET /decisions
 * - POST /restart
 */
export const schedulerApi = createApiClient(SCHEDULER_API_BASE_URL)
