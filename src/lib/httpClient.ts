import axios, { AxiosError, type AxiosInstance } from 'axios'

const API_TIMEOUT_MS = 20000

/**
 * Custom error class for API errors with status code and payload
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public payload?: unknown
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/**
 * Generate a unique request ID for tracing
 */
function generateRequestId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  )
}

/**
 * Create an Axios client with standard configuration:
 * - 20s timeout
 * - X-Request-Id header on every request
 * - Error normalization (except for canceled requests)
 *
 * @param baseURL - Base URL for the API
 * @returns Configured Axios instance
 */
export function createApiClient(baseURL: string): AxiosInstance {
  const instance = axios.create({
    baseURL,
    timeout: API_TIMEOUT_MS,
    headers: {
      'Content-Type': 'application/json',
    },
  })

  // Request interceptor: attach X-Request-Id for tracing
  instance.interceptors.request.use((config) => {
    const rid = generateRequestId()
    config.headers = config.headers ?? {}
    ;(config.headers as Record<string, string>)['X-Request-Id'] = rid
    return config
  })

  // Response interceptor: normalize errors, but let cancellations pass through
  instance.interceptors.response.use(
    (response) => response,
    (error: AxiosError) => {
      // Don't wrap canceled requests - let them propagate as-is for proper abort handling
      if (error.name === 'CanceledError' || error.code === 'ERR_CANCELED') {
        return Promise.reject(error)
      }

      const status = error.response?.status ?? 0
      const message =
        (error.response?.data as { message?: string } | undefined)?.message || error.message
      const payload = error.response?.data
      return Promise.reject(new ApiError(status, message, payload))
    }
  )

  return instance
}
