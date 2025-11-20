import axios, { AxiosError, type AxiosInstance } from 'axios'

const API_TIMEOUT_MS = 20000

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

function resolvePredictiveBaseUrl(): string {
  if (import.meta.env.DEV) {
    return '/api'
  }
  return import.meta.env.VITE_PREDICTIVE_API_BASE_URL || 'http://localhost:7000'
}

function resolveAlertBaseUrl(): string {
  return import.meta.env.VITE_GRAPH_ALERT_API_BASE_URL || 'http://localhost:PORT'
}

function createClient(baseURL: string): AxiosInstance {
  const instance = axios.create({
    baseURL,
    timeout: API_TIMEOUT_MS,
    headers: {
      'Content-Type': 'application/json',
    },
  })

  instance.interceptors.response.use(
    (response) => response,
    (error: AxiosError) => {
      const status = error.response?.status ?? 0
      const message =
        (error.response?.data as { message?: string } | undefined)?.message || error.message
      const payload = error.response?.data
      return Promise.reject(new ApiError(status, message, payload))
    }
  )

  return instance
}

export const predictiveApi = createClient(resolvePredictiveBaseUrl())
export const graphAlertApi = createClient(resolveAlertBaseUrl())
