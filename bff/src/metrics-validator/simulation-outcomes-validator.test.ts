import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildSimulationSevenDayWindowUtc,
  collectSimulationDecisionHistoryFromSqlite,
  computeSimulationAverageAffectedServicesFromSqlite,
  computeSimulationAverageLatencyDeltaFromSqlite,
  computeSimulationDailyRunTrendFromSqlite,
  computeSimulationRunCountsFromSqlite
} from './simulation-outcomes-validator'

test('anchors simulation seven-day window to captured page-load timestamp in UTC', () => {
  const result = buildSimulationSevenDayWindowUtc('2026-03-08T10:20:30.000Z')

  assert.equal(result.anchorTimestampUtc, '2026-03-08T10:20:30.000Z')
  assert.equal(result.windowEndUtc, '2026-03-08T10:20:30.000Z')
  assert.equal(result.windowStartUtc, '2026-03-01T10:20:30.000Z')
  assert.equal(result.timezone, 'UTC')
})

test('normalizes offset timestamps to UTC when deriving simulation seven-day window', () => {
  const result = buildSimulationSevenDayWindowUtc('2026-03-08T15:50:30+05:30')

  assert.equal(result.anchorTimestampUtc, '2026-03-08T10:20:30.000Z')
  assert.equal(result.windowEndUtc, '2026-03-08T10:20:30.000Z')
  assert.equal(result.windowStartUtc, '2026-03-01T10:20:30.000Z')
  assert.equal(result.timezone, 'UTC')
})

test('throws when page-load timestamp is invalid for simulation window anchoring', () => {
  assert.throws(
    () => buildSimulationSevenDayWindowUtc('invalid'),
    /Invalid page-load timestamp/
  )
})

test('collects simulation decision history from sqlite-backed endpoint across paginated reads', async () => {
  const observedRequestUrls: string[] = []
  const collected = await collectSimulationDecisionHistoryFromSqlite(
    'vm.example.internal',
    async (request) => {
      observedRequestUrls.push(request.url)
      const requestUrl = new URL(request.url)
      const offset = requestUrl.searchParams.get('offset')

      if (offset === '0') {
        return {
          status: 200,
          statusText: 'OK',
          json: async () => ({
            decisions: [
              {
                timestamp: '2026-03-06T01:00:00.000Z',
                type: 'failure',
                result: { confidence: 'low' }
              },
              {
                timestamp: '2026-03-06T02:00:00.000Z',
                type: 'scaling',
                result: { confidence: 'high' }
              }
            ],
            pagination: { total: 3 }
          })
        }
      }

      return {
        status: 200,
        statusText: 'OK',
        json: async () => ({
          decisions: [
            {
              timestamp: '2026-03-06T03:00:00.000Z',
              type: 'risk',
              result: { confidence: 'low' }
            }
          ],
          pagination: { total: 3 }
        })
      }
    },
    100,
    2,
    new Date('2026-03-08T10:20:30.000Z')
  )

  assert.equal(observedRequestUrls.length, 2)
  const firstRequest = new URL(observedRequestUrls[0])
  const secondRequest = new URL(observedRequestUrls[1])

  assert.equal(
    `${firstRequest.origin}${firstRequest.pathname}`,
    'http://vm.example.internal:7000/decisions/history'
  )
  assert.equal(firstRequest.searchParams.get('limit'), '2')
  assert.equal(firstRequest.searchParams.get('offset'), '0')
  assert.equal(secondRequest.searchParams.get('limit'), '2')
  assert.equal(secondRequest.searchParams.get('offset'), '2')

  assert.equal(collected.endpoint, 'http://vm.example.internal:7000/decisions/history')
  assert.equal(collected.collectedAtUtc, '2026-03-08T10:20:30.000Z')
  assert.equal(collected.pageSize, 2)
  assert.equal(collected.totalFetched, 3)
  assert.equal(collected.records.length, 3)
  assert.equal(collected.records[0].type, 'failure')
  assert.equal(collected.records[1].type, 'scaling')
  assert.equal(collected.records[2].type, 'risk')
})

test('computes simulation run counts using UTC window and sqlite metric filters', () => {
  const window = buildSimulationSevenDayWindowUtc('2026-03-08T10:20:30.000Z')
  const counts = computeSimulationRunCountsFromSqlite(
    [
      {
        timestamp: '2026-03-01T10:20:30.000Z',
        type: 'failure',
        result: { confidence: 'low' }
      },
      {
        timestamp: '2026-03-04T11:00:00.000Z',
        type: ' Scale ',
        result: { confidence: 'HIGH' }
      },
      {
        timestamp: '2026-03-05T00:00:00.000Z',
        type: 'risk',
        result: { confidence: 'LoW' }
      },
      {
        timestamp: '2026-03-08T10:20:30.000Z',
        type: 'add',
        result: { confidence: 'unknown' }
      },
      {
        timestamp: '2026-02-28T23:59:59.000Z',
        type: 'failure',
        result: { confidence: 'low' }
      },
      {
        timestamp: 'not-a-date',
        type: 'scaling',
        result: { confidence: 'low' }
      }
    ],
    window
  )

  assert.deepEqual(counts, {
    runs: 4,
    failureRuns: 1,
    scaleRuns: 1,
    lowConfidenceRuns: 2,
    filters: {
      windowStartUtc: '2026-03-01T10:20:30.000Z',
      windowEndUtc: '2026-03-08T10:20:30.000Z',
      timezone: 'UTC'
    }
  })
})

test('computes average affected services using failure/scaling estimation and excludes zero estimates', () => {
  const window = buildSimulationSevenDayWindowUtc('2026-03-08T10:20:30.000Z')
  const averageAffected = computeSimulationAverageAffectedServicesFromSqlite(
    [
      {
        timestamp: '2026-03-02T10:20:30.000Z',
        type: 'failure',
        result: {
          affectedCallers: ['gateway'],
          affectedDownstream: []
        }
      },
      {
        timestamp: '2026-03-03T10:20:30.000Z',
        type: 'scaling',
        result: {
          affectedPaths: ['checkout', 'orders']
        }
      },
      {
        timestamp: '2026-03-04T10:20:30.000Z',
        type: 'failure',
        result: {
          affectedCallers: { items: ['api-a', 'api-b'] }
        }
      },
      {
        timestamp: '2026-03-05T10:20:30.000Z',
        type: 'failure',
        result: {
          affectedCallers: [],
          affectedDownstream: []
        }
      },
      {
        timestamp: '2026-03-06T10:20:30.000Z',
        type: 'scale',
        result: {
          affectedPaths: []
        }
      },
      {
        timestamp: '2026-03-07T10:20:30.000Z',
        type: 'risk',
        result: {
          affectedPaths: ['ignored-for-risk']
        }
      },
      {
        timestamp: '2026-02-28T10:20:29.999Z',
        type: 'failure',
        result: {
          affectedCallers: ['outside-window']
        }
      },
      {
        timestamp: 'invalid-timestamp',
        type: 'scaling',
        result: {
          affectedPaths: ['invalid-time']
        }
      }
    ],
    window
  )

  assert.deepEqual(averageAffected, {
    avgAffectedServices: 1.67,
    contributingRuns: 3,
    filters: {
      windowStartUtc: '2026-03-01T10:20:30.000Z',
      windowEndUtc: '2026-03-08T10:20:30.000Z',
      timezone: 'UTC'
    },
    estimationRules: {
      failure: 'affectedCallers + affectedDownstream',
      scaling: 'affectedPaths',
      excludesZeroEstimates: true
    }
  })
})

test('computes average latency delta from scaling records with numeric latency deltas only', () => {
  const window = buildSimulationSevenDayWindowUtc('2026-03-08T10:20:30.000Z')
  const averageLatencyDelta = computeSimulationAverageLatencyDeltaFromSqlite(
    [
      {
        timestamp: '2026-03-02T10:20:30.000Z',
        type: 'scaling',
        result: {
          latencyEstimate: {
            deltaMs: 25.5
          }
        }
      },
      {
        timestamp: '2026-03-03T10:20:30.000Z',
        type: ' scale ',
        result: {
          latencyEstimate: {
            deltaMs: -4
          }
        }
      },
      {
        timestamp: '2026-03-04T10:20:30.000Z',
        type: 'scaling',
        result: {
          latencyEstimate: {
            deltaMs: '12.5'
          }
        }
      },
      {
        timestamp: '2026-03-05T10:20:30.000Z',
        type: 'failure',
        result: {
          latencyEstimate: {
            deltaMs: 100
          }
        }
      },
      {
        timestamp: '2026-02-28T10:20:29.999Z',
        type: 'scaling',
        result: {
          latencyEstimate: {
            deltaMs: 50
          }
        }
      },
      {
        timestamp: 'invalid-timestamp',
        type: 'scale',
        result: {
          latencyEstimate: {
            deltaMs: 75
          }
        }
      },
      {
        timestamp: '2026-03-06T10:20:30.000Z',
        type: 'scale',
        result: {}
      }
    ],
    window
  )

  assert.deepEqual(averageLatencyDelta, {
    avgLatencyDeltaMs: 10.75,
    contributingRuns: 2,
    filters: {
      windowStartUtc: '2026-03-01T10:20:30.000Z',
      windowEndUtc: '2026-03-08T10:20:30.000Z',
      timezone: 'UTC'
    },
    estimationRules: {
      decisionTypes: ['scaling', 'scale'],
      sourceField: 'latencyEstimate.deltaMs',
      requiresNumericDelta: true
    }
  })
})

test('groups simulation run trend by UTC calendar day with total/failure/scale counts', () => {
  const window = buildSimulationSevenDayWindowUtc('2026-03-08T10:20:30.000Z')
  const trend = computeSimulationDailyRunTrendFromSqlite(
    [
      {
        timestamp: '2026-03-03T23:30:00-05:00',
        type: 'failure',
        result: {}
      },
      {
        timestamp: '2026-03-04T00:15:00+02:00',
        type: ' scaling ',
        result: {}
      },
      {
        timestamp: '2026-03-04T12:00:00.000Z',
        type: 'scale',
        result: {}
      },
      {
        timestamp: '2026-03-04T18:00:00.000Z',
        type: 'risk',
        result: {}
      },
      {
        timestamp: '2026-03-05T05:00:00.000Z',
        type: 'FAILURE',
        result: {}
      },
      {
        timestamp: '2026-02-28T23:00:00.000Z',
        type: 'failure',
        result: {}
      },
      {
        timestamp: 'invalid-timestamp',
        type: 'scale',
        result: {}
      }
    ],
    window
  )

  assert.deepEqual(trend, {
    trend: [
      {
        date: '2026-03-03',
        runs: 1,
        failureRuns: 0,
        scaleRuns: 1
      },
      {
        date: '2026-03-04',
        runs: 3,
        failureRuns: 1,
        scaleRuns: 1
      },
      {
        date: '2026-03-05',
        runs: 1,
        failureRuns: 1,
        scaleRuns: 0
      }
    ],
    filters: {
      windowStartUtc: '2026-03-01T10:20:30.000Z',
      windowEndUtc: '2026-03-08T10:20:30.000Z',
      timezone: 'UTC'
    },
    grouping: 'utcCalendarDay'
  })
})
