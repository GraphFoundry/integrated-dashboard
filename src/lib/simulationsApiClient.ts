import { createApiClient } from '@/lib/httpClient'
import { env } from '@/lib/env'

const BFF_BASE_URL = env.BFF_URL

export const simulationsApi = createApiClient(`${BFF_BASE_URL}/api/simulations`)
