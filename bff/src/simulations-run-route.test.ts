import assert from 'node:assert/strict'
import test from 'node:test'
import type { Request, Response } from 'express'
import type {
  SimulationErrorResponseDto,
  SimulationRunRequestDto,
  SimulationRunResponseDto,
} from './simulation-contract'
import {
  SIMULATION_RUN_TIMEOUT_MS,
  buildSimulationRunUrl,
  createSimulationReplayHandler,
  createSimulationRunHandler,
} from './simulations-run-route'

function makeRunRequestPayload(): SimulationRunRequestDto {
  return {
    version: 'v1',
    scenarioType: 'scaling',
    snapshotTimestamp: '2026-03-08T09:00:00Z',
    snapshotHash: 'abc123',
    scalingParams: {
      targetServiceId: 'default:checkout',
      currentPods: 2,
      newPods: 4,
      latencyMetric: 'p95',
    },
  }
}

function makeRunResponsePayload(): SimulationRunResponseDto {
  return {
    version: 'v1',
    scenarioType: 'scaling',
    snapshotTimestamp: '2026-03-08T09:00:00Z',
    snapshotHash: 'abc123',
    resultStatus: 'OK',
    evidenceSources: ['live_service_graph', 'live_k8s_runtime', 'historical_influxdb'],
    evidenceMode: 'FULL',
    confidenceLevel: 'HIGH',
    assumptions: [
      {
        key: 'latency_formula',
        type: 'FORMULA',
        value: 'before * (currentPods/newPods)',
        description: 'Inverse proportional latency estimate.',
        source: 'engine_default',
        traceRef: 'assumptions[0]',
      },
    ],
    impactedServices: [
      {
        serviceId: 'default:checkout',
        name: 'checkout',
        namespace: 'default',
        role: 'target',
      },
    ],
    impactedPaths: [{ path: ['default:frontend', 'default:checkout'] }],
    beforeAfterValues: [
      {
        fieldRef: 'scaling.target.latency_p95_ms',
        traceRef: 'beforeAfterValues[0]',
        description: 'Projected latency',
        unit: 'ms',
        beforeValue: 120,
        afterValue: 60,
        deltaValue: -60,
      },
    ],
    recommendation: {
      action: 'approve_scale_up',
      explanation: 'Scale up based on evidence-backed projection.',
      evidenceSourceRefs: ['live_service_graph', 'live_k8s_runtime', 'historical_influxdb'],
    },
  }
}

function makeMockRequest(payload: unknown, headers: Record<string, string> = {}): Request {
  const normalizedHeaders = new Map<string, string>(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])
  )
  return {
    body: payload,
    header(name: string): string | undefined {
      return normalizedHeaders.get(name.toLowerCase())
    },
  } as unknown as Request
}

type MockResponseState = {
  statusCode: number | null
  jsonBody: unknown
  sentBody: unknown
  ended: boolean
}

function makeMockResponse(): { response: Response; state: MockResponseState } {
  const state: MockResponseState = {
    statusCode: null,
    jsonBody: undefined,
    sentBody: undefined,
    ended: false,
  }

  const response = {
    status(code: number) {
      state.statusCode = code
      return response
    },
    json(payload: unknown) {
      state.jsonBody = payload
      return response
    },
    send(payload: unknown) {
      state.sentBody = payload
      return response
    },
    end() {
      state.ended = true
      return response
    },
  } as unknown as Response

  return { response, state }
}

test('buildSimulationRunUrl normalizes base and path slashes', () => {
  assert.equal(
    buildSimulationRunUrl('http://localhost:7000/', 'simulations/run'),
    'http://localhost:7000/simulations/run'
  )
  assert.equal(
    buildSimulationRunUrl('http://localhost:7000', '/simulations/run'),
    'http://localhost:7000/simulations/run'
  )
})

test('simulation run handler preserves upstream success payload and status', async () => {
  const requestPayload = makeRunRequestPayload()
  const responsePayload = makeRunResponsePayload()
  let capturedRequest:
    | {
        url: string
        data: unknown
        config: {
          timeout: number
          validateStatus: (status: number) => boolean
          headers?: Record<string, string>
        }
      }
    | undefined

  const handler = createSimulationRunHandler({
    simulationApiBaseUrl: 'http://localhost:7000/',
    simulationRunPath: 'simulations/run',
    httpClient: {
      async post<T>(
        url: string,
        data: unknown,
        config: {
          timeout: number
          validateStatus: (status: number) => boolean
          headers?: Record<string, string>
        }
      ) {
        capturedRequest = { url, data, config }
        return { status: 200, data: responsePayload as T }
      },
    },
  })

  const req = makeMockRequest(requestPayload, { 'X-Request-Id': 'req-123' })
  const { response, state } = makeMockResponse()
  await handler(req, response, () => undefined)

  assert.ok(capturedRequest)
  assert.equal(capturedRequest.url, 'http://localhost:7000/simulations/run')
  assert.deepEqual(capturedRequest.data, requestPayload)
  assert.equal(capturedRequest.config.timeout, SIMULATION_RUN_TIMEOUT_MS)
  assert.equal(capturedRequest.config.validateStatus(500), true)
  assert.deepEqual(capturedRequest.config.headers, { 'X-Request-Id': 'req-123' })

  assert.equal(state.statusCode, 200)
  assert.deepEqual(state.jsonBody, responsePayload)
})

test('simulation run handler preserves deferred/error payload and status code', async () => {
  const deferredPayload: SimulationErrorResponseDto = {
    code: 'SIM_ERR_008',
    resultStatus: 'DEFERRED',
    deferredReason: 'insufficient evidence for defensible output',
    errors: [{ code: 'SIM_ERR_008', message: 'missing scenario params' }],
  }

  const handler = createSimulationRunHandler({
    simulationApiBaseUrl: 'http://localhost:7000',
    simulationRunPath: '/simulations/run',
    httpClient: {
      async post<T>() {
        return { status: 422, data: deferredPayload as T }
      },
    },
  })

  const req = makeMockRequest(makeRunRequestPayload())
  const { response, state } = makeMockResponse()
  await handler(req, response, () => undefined)

  assert.equal(state.statusCode, 422)
  assert.deepEqual(state.jsonBody, deferredPayload)
})

test('simulation run handler returns 502 when upstream is unavailable', async () => {
  const handler = createSimulationRunHandler({
    simulationApiBaseUrl: 'http://localhost:7000',
    simulationRunPath: '/simulations/run',
    httpClient: {
      async post<T>() {
        throw new Error('connect ECONNREFUSED 127.0.0.1:7000')
      },
    },
  })

  const req = makeMockRequest(makeRunRequestPayload())
  const { response, state } = makeMockResponse()
  await handler(req, response, () => undefined)

  assert.equal(state.statusCode, 502)
  assert.deepEqual(state.jsonBody, { error: 'Simulation API unavailable' })
})

test('simulation replay handler enforces snapshot identifiers from request context', async () => {
  const requestPayload = makeRunRequestPayload()
  const upstreamPayload: SimulationRunResponseDto = {
    ...makeRunResponsePayload(),
    snapshotTimestamp: '2026-03-08T12:30:00Z',
    snapshotHash: 'upstream-different-hash',
  }

  const handler = createSimulationReplayHandler({
    simulationApiBaseUrl: 'http://localhost:7000',
    simulationRunPath: '/simulations/run',
    httpClient: {
      async post<T>() {
        return { status: 200, data: upstreamPayload as T }
      },
    },
  })

  const req = makeMockRequest(requestPayload, { 'X-Request-Id': 'req-replay' })
  const { response, state } = makeMockResponse()
  await handler(req, response, () => undefined)

  assert.equal(state.statusCode, 200)
  assert.deepEqual(state.jsonBody, {
    ...upstreamPayload,
    snapshotTimestamp: requestPayload.snapshotTimestamp,
    snapshotHash: requestPayload.snapshotHash,
  })
})

test('simulation replay handler is deterministic for repeated identical requests', async () => {
  const requestPayload = makeRunRequestPayload()
  const upstreamPayload = makeRunResponsePayload()
  let callCount = 0

  const handler = createSimulationReplayHandler({
    simulationApiBaseUrl: 'http://localhost:7000',
    simulationRunPath: '/simulations/run',
    httpClient: {
      async post<T>() {
        callCount += 1
        return {
          status: 200,
          data: {
            ...upstreamPayload,
            snapshotTimestamp: `2026-03-08T09:00:0${callCount}Z`,
            snapshotHash: `hash-${callCount}`,
          } as T,
        }
      },
    },
  })

  const reqOne = makeMockRequest(requestPayload)
  const first = makeMockResponse()
  await handler(reqOne, first.response, () => undefined)

  const reqTwo = makeMockRequest(requestPayload)
  const second = makeMockResponse()
  await handler(reqTwo, second.response, () => undefined)

  assert.equal(callCount, 2)
  assert.equal(first.state.statusCode, 200)
  assert.equal(second.state.statusCode, 200)
  assert.deepEqual(first.state.jsonBody, second.state.jsonBody)
  assert.deepEqual(first.state.jsonBody, {
    ...upstreamPayload,
    snapshotTimestamp: requestPayload.snapshotTimestamp,
    snapshotHash: requestPayload.snapshotHash,
  })
})
