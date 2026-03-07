import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildSgeSnapshotEndpoint,
  collectSgeSnapshot
} from './sge-snapshot-collector'

test('builds default SGE snapshot endpoint from vm host', () => {
  assert.equal(
    buildSgeSnapshotEndpoint('vm.example.internal'),
    'http://vm.example.internal:3000/metrics/snapshot'
  )
})

test('collects timestamped service metrics payload from SGE snapshot endpoint', async () => {
  const observedRequests: Array<{ url: string; method?: string }> = []
  const collected = await collectSgeSnapshot(
    'vm.example.internal',
    async (request) => {
      observedRequests.push({ url: request.url, method: request.method })
      return {
        status: 200,
        statusText: 'OK',
        json: async () => ({
          timestamp: '2026-03-08T00:45:00Z',
          services: [
            {
              name: 'frontend',
              namespace: 'default',
              rps: 21.3,
              errorRate: 0.0123,
              p95: 140.21
            },
            {
              name: 'checkoutservice',
              namespace: 'default',
              rps: 8.8,
              errorRate: 0.0312,
              p95: 220.4
            }
          ]
        })
      }
    },
    50,
    new Date('2026-03-08T01:00:00Z')
  )

  assert.deepEqual(observedRequests, [
    {
      url: 'http://vm.example.internal:3000/metrics/snapshot',
      method: 'GET'
    }
  ])
  assert.equal(
    collected.endpoint,
    'http://vm.example.internal:3000/metrics/snapshot'
  )
  assert.equal(collected.collectedAtUtc, '2026-03-08T01:00:00.000Z')
  assert.equal(collected.snapshotTimestampUtc, '2026-03-08T00:45:00.000Z')
  assert.deepEqual(collected.queryParameters, {})
  assert.deepEqual(collected.rawPayloadExcerpt.topLevelKeys, [
    'timestamp',
    'services'
  ])
  assert.equal(collected.rawPayloadExcerpt.serviceCount, 2)
  assert.equal(collected.rawPayloadExcerpt.servicesSample.length, 2)
  assert.equal(collected.rawPayloadExcerpt.servicesSample[0].name, 'frontend')
  assert.equal(collected.serviceMetricsPayload.length, 2)
  assert.equal(collected.serviceMetricsPayload[0].name, 'frontend')
})

test('fails when SGE snapshot payload is missing services array', async () => {
  await assert.rejects(
    collectSgeSnapshot(
      'vm.example.internal',
      async () => ({
        status: 200,
        statusText: 'OK',
        json: async () => ({
          timestamp: '2026-03-08T00:45:00Z'
        })
      }),
      50
    ),
    /SGE snapshot payload is missing services array/
  )
})
