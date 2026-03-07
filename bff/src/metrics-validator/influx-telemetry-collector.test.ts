import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildInfluxTelemetryEndpoint,
  collectInfluxTelemetry
} from './influx-telemetry-collector'

test('builds default Influx telemetry endpoint from vm host', () => {
  assert.equal(
    buildInfluxTelemetryEndpoint('vm.example.internal'),
    'http://vm.example.internal:7000/telemetry/service'
  )
})

test('collects raw telemetry points for selected window and scoped service', async () => {
  const observedRequests: Array<{ url: string; method?: string }> = []
  const collected = await collectInfluxTelemetry(
    {
      vmHost: 'vm.example.internal',
      windowStartUtc: '2026-03-07T00:00:00.000Z',
      windowEndUtc: '2026-03-07T01:00:00.000Z',
      serviceScope: 'default:frontend'
    },
    async (request) => {
      observedRequests.push({ url: request.url, method: request.method })
      return {
        status: 200,
        statusText: 'OK',
        json: async () => ({
          datapoints: [
            {
              timestamp: '2026-03-07T00:00:00Z',
              service: 'frontend',
              namespace: 'default',
              requestRate: 20.5
            },
            {
              timestamp: '2026-03-07T00:01:00Z',
              service: 'frontend',
              namespace: 'default',
              requestRate: 21.1
            }
          ]
        })
      }
    },
    50,
    new Date('2026-03-08T01:15:00Z')
  )

  assert.equal(observedRequests.length, 1)
  assert.equal(observedRequests[0].method, 'GET')
  const requestUrl = new URL(observedRequests[0].url)
  assert.equal(
    `${requestUrl.origin}${requestUrl.pathname}`,
    'http://vm.example.internal:7000/telemetry/service'
  )
  assert.equal(requestUrl.searchParams.get('from'), '2026-03-07T00:00:00.000Z')
  assert.equal(requestUrl.searchParams.get('to'), '2026-03-07T01:00:00.000Z')
  assert.equal(requestUrl.searchParams.get('step'), '60')
  assert.equal(requestUrl.searchParams.get('service'), 'frontend')

  assert.equal(collected.endpoint, 'http://vm.example.internal:7000/telemetry/service')
  assert.equal(collected.collectedAtUtc, '2026-03-08T01:15:00.000Z')
  assert.equal(collected.windowStartUtc, '2026-03-07T00:00:00.000Z')
  assert.equal(collected.windowEndUtc, '2026-03-07T01:00:00.000Z')
  assert.equal(collected.serviceScope, 'default:frontend')
  assert.equal(collected.stepSeconds, 60)
  assert.equal(collected.rawPoints.length, 2)
  assert.equal(collected.rawPoints[0].service, 'frontend')
})

test('omits service filter for global scope', async () => {
  const observedRequests: Array<{ url: string; method?: string }> = []

  await collectInfluxTelemetry(
    {
      vmHost: 'vm.example.internal',
      windowStartUtc: '2026-03-07T00:00:00.000Z',
      windowEndUtc: '2026-03-07T01:00:00.000Z',
      serviceScope: 'all'
    },
    async (request) => {
      observedRequests.push({ url: request.url, method: request.method })
      return {
        status: 200,
        statusText: 'OK',
        json: async () => ({
          datapoints: []
        })
      }
    },
    50
  )

  assert.equal(observedRequests.length, 1)
  const requestUrl = new URL(observedRequests[0].url)
  assert.equal(requestUrl.searchParams.get('service'), null)
})
