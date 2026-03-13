import type { Request, RequestHandler, Response } from 'express'
import axios from 'axios'
import type {
  SimulationErrorResponseDto,
  SimulationRunRequestDto,
  SimulationRunResponseDto,
} from './simulation-contract'

type SimulationRunHttpClient = {
  post<T>(
    url: string,
    data: unknown,
    config: SimulationRunHttpClientConfig
  ): Promise<{ status: number; data: T }>
}

export interface SimulationRunRouteConfig {
  simulationApiBaseUrl: string
  simulationRunPath: string
  httpClient?: SimulationRunHttpClient
}

export const SIMULATION_RUN_TIMEOUT_MS = 10_000

type SimulationRunHttpClientConfig = {
  timeout: number
  validateStatus: (status: number) => boolean
  headers?: Record<string, string>
}

export function buildSimulationRunUrl(baseUrl: string, runPath: string): string {
  const normalizedBase = baseUrl.replace(/\/+$/, '')
  const normalizedPath = runPath.startsWith('/') ? runPath : `/${runPath}`
  return `${normalizedBase}${normalizedPath}`
}

export function sendPassthroughResponse(res: Response, statusCode: number, payload: unknown): Response {
  if (payload === undefined || payload === null) {
    return res.status(statusCode).end()
  }

  if (typeof payload === 'string' || Buffer.isBuffer(payload)) {
    return res.status(statusCode).send(payload)
  }

  return res.status(statusCode).json(payload)
}

type SimulationProxyHandlerOptions = {
  enforceSnapshotContext: boolean
  logPrefix: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function withReplaySnapshotContext(payload: unknown, request: SimulationRunRequestDto): unknown {
  if (!isRecord(payload)) {
    return payload
  }

  const withSnapshotContext: Record<string, unknown> = {
    ...payload,
    snapshotTimestamp: request.snapshotTimestamp,
  }

  if (request.snapshotHash !== undefined) {
    withSnapshotContext.snapshotHash = request.snapshotHash
  } else {
    delete withSnapshotContext.snapshotHash
  }

  return withSnapshotContext
}

function createSimulationProxyHandler(
  config: SimulationRunRouteConfig,
  options: SimulationProxyHandlerOptions
): RequestHandler {
  const httpClient: SimulationRunHttpClient =
    config.httpClient ??
    ({
      async post<T>(url: string, data: unknown, requestConfig: SimulationRunHttpClientConfig) {
        const response = await axios.post<T>(url, data, requestConfig)
        return { status: response.status, data: response.data }
      },
    } satisfies SimulationRunHttpClient)
  const simulationRunUrl = buildSimulationRunUrl(config.simulationApiBaseUrl, config.simulationRunPath)

  return async (req: Request, res: Response) => {
    const requestId = req.header('X-Request-Id')
    const payload = req.body as SimulationRunRequestDto

    try {
      const upstream = await httpClient.post<SimulationRunResponseDto | SimulationErrorResponseDto>(
        simulationRunUrl,
        payload,
        {
          timeout: SIMULATION_RUN_TIMEOUT_MS,
          validateStatus: () => true,
          headers: requestId ? { 'X-Request-Id': requestId } : undefined,
        }
      )

      const responsePayload = options.enforceSnapshotContext
        ? withReplaySnapshotContext(upstream.data, payload)
        : upstream.data

      return sendPassthroughResponse(res, upstream.status, responsePayload)
    } catch (error) {
      console.error(`[${options.logPrefix}] upstream unavailable`)
      if (axios.isAxiosError(error)) {
        console.error(`[${options.logPrefix}] details:`, error.message)
      }
      return res.status(502).json({ error: 'Simulation API unavailable' })
    }
  }
}

export function createSimulationRunHandler(config: SimulationRunRouteConfig): RequestHandler {
  return createSimulationProxyHandler(config, {
    enforceSnapshotContext: false,
    logPrefix: 'BFF:simulations-run',
  })
}

export function createSimulationReplayHandler(config: SimulationRunRouteConfig): RequestHandler {
  return createSimulationProxyHandler(config, {
    enforceSnapshotContext: true,
    logPrefix: 'BFF:simulations-replay',
  })
}
