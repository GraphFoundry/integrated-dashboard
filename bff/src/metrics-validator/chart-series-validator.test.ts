import assert from 'node:assert/strict'
import test from 'node:test'
import { validateChartSeriesAgainstTelemetry } from './chart-series-validator'

test(
  'compares traffic/failure-rate/response-speed/uptime chart series against telemetry datapoints at 60-second step',
  () => {
    const result = validateChartSeriesAgainstTelemetry({
      rawTelemetryPoints: [
        {
          timestamp: '2026-03-08T00:01:00.000Z',
          requestRate: 20,
          errorRate: 0.02,
          p50: 50,
          p95: 120,
          p99: 200,
          availability: 99.9
        },
        {
          timestamp: '2026-03-08T00:00:00.000Z',
          requestRate: 10,
          errorRate: 0.01,
          p95: 100,
          availability: 99.8
        },
        {
          timestamp: '2026-03-08T00:02:00.000Z',
          requestRate: 5,
          errorRate: 2,
          p95: 140,
          availability: null
        }
      ],
      telemetryStepSeconds: 60,
      displayedChartSeries: {
        traffic: [
          { timestamp: '2026-03-08T00:00:00.000Z', value: 10 },
          { timestamp: '2026-03-08T00:01:00.000Z', value: 20 },
          { timestamp: '2026-03-08T00:02:00.000Z', value: 5 }
        ],
        failureRate: [
          { timestamp: '2026-03-08T00:00:00.000Z', value: 1 },
          { timestamp: '2026-03-08T00:01:00.000Z', value: 2 },
          { timestamp: '2026-03-08T00:02:00.000Z', value: 2 }
        ],
        responseSpeed: [
          { timestamp: '2026-03-08T00:00:00.000Z', p95: 100 },
          { timestamp: '2026-03-08T00:01:00.000Z', p50: 50, p95: 120, p99: 200 },
          { timestamp: '2026-03-08T00:02:00.000Z', p95: 140 }
        ],
        uptime: [
          { timestamp: '2026-03-08T00:00:00.000Z', value: 99.8 },
          { timestamp: '2026-03-08T00:01:00.000Z', value: 99.9 }
        ],
        hasP50Data: true,
        hasP99Data: true
      }
    })

    assert.equal(result.stepSeconds.pass, true)
    assert.equal(result.traffic.pass, true)
    assert.equal(result.failureRate.pass, true)
    assert.equal(result.responseSpeed.pass, true)
    assert.equal(result.uptime.pass, true)
    assert.equal(result.pass, true)
  }
)

test('normalizes failure-rate and uptime series to percentage values before comparison', () => {
  const result = validateChartSeriesAgainstTelemetry({
    rawTelemetryPoints: [
      {
        timestamp: '2026-03-08T00:00:00.000Z',
        requestRate: 10,
        errorRate: 0.02,
        p95: 100,
        availability: 0.999
      }
    ],
    telemetryStepSeconds: 60,
    displayedChartSeries: {
      traffic: [{ timestamp: '2026-03-08T00:00:00.000Z', value: 10 }],
      failureRate: [{ timestamp: '2026-03-08T00:00:00.000Z', value: 0.02 }],
      responseSpeed: [{ timestamp: '2026-03-08T00:00:00.000Z', p95: 100 }],
      uptime: [{ timestamp: '2026-03-08T00:00:00.000Z', value: 0.999 }],
      hasP50Data: false,
      hasP99Data: false
    }
  })

  assert.equal(result.failureRate.pass, true)
  assert.equal(result.uptime.pass, true)
  assert.equal(result.failureRate.pointComparisons[0]?.expectedValue, 2)
  assert.equal(result.failureRate.pointComparisons[0]?.displayedValue, 2)
  assert.equal(result.uptime.pointComparisons[0]?.expectedValue, 99.9)
  assert.equal(result.uptime.pointComparisons[0]?.displayedValue, 99.9)
  assert.equal(result.pass, true)
})

test('reports step/value mismatches when chart series diverge from telemetry datapoints', () => {
  const result = validateChartSeriesAgainstTelemetry({
    rawTelemetryPoints: [
      {
        timestamp: '2026-03-08T00:00:00.000Z',
        requestRate: 10,
        errorRate: 0.01,
        p95: 100,
        availability: 99.8
      },
      {
        timestamp: '2026-03-08T00:01:00.000Z',
        requestRate: 20,
        errorRate: 0.02,
        p95: 120,
        availability: 99.9
      }
    ],
    telemetryStepSeconds: 30,
    displayedChartSeries: {
      traffic: [
        { timestamp: '2026-03-08T00:00:00.000Z', value: 10 },
        { timestamp: '2026-03-08T00:01:00.000Z', value: 22 }
      ],
      failureRate: [
        { timestamp: '2026-03-08T00:00:00.000Z', value: 1 },
        { timestamp: '2026-03-08T00:01:00.000Z', value: 2 }
      ],
      responseSpeed: [
        { timestamp: '2026-03-08T00:00:00.000Z', p95: 100 },
        { timestamp: '2026-03-08T00:01:00.000Z', p95: 120 }
      ],
      uptime: [
        { timestamp: '2026-03-08T00:00:00.000Z', value: 99.8 },
        { timestamp: '2026-03-08T00:01:00.000Z', value: 99.9 }
      ],
      hasP50Data: false,
      hasP99Data: false
    }
  })

  assert.equal(result.stepSeconds.pass, false)
  assert.equal(result.traffic.pass, false)
  assert.equal(result.traffic.pointComparisons[1]?.absoluteDelta, 2)
  assert.equal(result.failureRate.pass, true)
  assert.equal(result.responseSpeed.pass, true)
  assert.equal(result.uptime.pass, true)
  assert.equal(result.pass, false)
})
