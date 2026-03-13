import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildInfluxTelemetryEndpoint,
  collectInfluxTelemetry,
  extractLatestPerServicePoints
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
  assert.deepEqual(collected.queryParameters, {
    from: '2026-03-07T00:00:00.000Z',
    to: '2026-03-07T01:00:00.000Z',
    step: '60',
    service: 'frontend'
  })
  assert.deepEqual(collected.rawPayloadExcerpt.topLevelKeys, ['datapoints'])
  assert.equal(collected.rawPayloadExcerpt.datapointCount, 2)
  assert.equal(collected.rawPayloadExcerpt.datapointsSample.length, 2)
  assert.equal(
    collected.rawPayloadExcerpt.datapointsSample[0].timestamp,
    '2026-03-07T00:00:00Z'
  )
  assert.equal(collected.rawPoints.length, 2)
  assert.equal(collected.rawPoints[0].service, 'frontend')
  assert.equal(collected.latestPerServicePoints.length, 1)
  assert.equal(
    collected.latestPerServicePoints[0].selectionReason,
    'latestPositiveTraffic'
  )
  assert.equal(
    collected.latestPerServicePoints[0].datapoint.requestRate,
    21.1
  )
})

test('omits service filter for global scope', async () => {
  const observedRequests: Array<{ url: string; method?: string }> = []

  const collected = await collectInfluxTelemetry(
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
  assert.equal(collected.queryParameters.service, undefined)
  assert.deepEqual(collected.rawPayloadExcerpt.topLevelKeys, ['datapoints'])
  assert.equal(collected.rawPayloadExcerpt.datapointCount, 0)
  assert.equal(collected.rawPayloadExcerpt.datapointsSample.length, 0)
})

test(
  'extracts latest per-service datapoints with positive-traffic preference and fallback',
  () => {
    const latestPerService = extractLatestPerServicePoints([
      {
        timestamp: '2026-03-07T00:01:00Z',
        namespace: 'default',
        service: 'frontend',
        requestRate: 12.5,
        availability: 0.99
      },
      {
        timestamp: '2026-03-07T00:02:00Z',
        namespace: 'default',
        service: 'frontend',
        requestRate: 0,
        availability: 0.98
      },
      {
        timestamp: '2026-03-07T00:00:00Z',
        namespace: 'default',
        service: 'checkoutservice',
        requestRate: 0,
        p95: 510
      },
      {
        timestamp: '2026-03-07T00:03:00Z',
        namespace: 'default',
        service: 'checkoutservice',
        requestRate: 0,
        p95: 430
      }
    ])

    const byService = new Map(
      latestPerService.map((entry) => [entry.serviceKey, entry])
    )

    const frontend = byService.get('default:frontend')
    assert.ok(frontend)
    assert.equal(frontend.selectionReason, 'latestPositiveTraffic')
    assert.equal(frontend.datapoint.requestRate, 12.5)
    assert.equal(frontend.datapoint.availability, 0.98)

    const checkout = byService.get('default:checkoutservice')
    assert.ok(checkout)
    assert.equal(checkout.selectionReason, 'latestOverallFallback')
    assert.equal(checkout.datapoint.p95, 430)
  }
)
