import assert from 'node:assert/strict'
import test from 'node:test'
import {
  compareSpeedSummaryCard,
  compareSystemHealthSummaryCard,
  compareTrafficVolumeSummaryCard,
  compareUptimeReliabilitySummaryCard,
  validateVitalSignsSummaryCards
} from './summary-cards-validator'

test(
  'computes traffic volume as the average total request rate across the selected window',
  () => {
    const result = compareTrafficVolumeSummaryCard({
      rawTelemetryPoints: [
        {
          timestamp: '2026-03-08T00:00:00.000Z',
          service: 'frontend',
          namespace: 'default',
          requestRate: 12.3456
        },
        {
          timestamp: '2026-03-08T00:00:00.000Z',
          service: 'checkoutservice',
          namespace: 'default',
          requestRate: '7.6544'
        },
        {
          timestamp: '2026-03-08T00:01:00.000Z',
          service: 'frontend',
          namespace: 'default',
          requestRate: 20
        },
        {
          timestamp: '2026-03-08T00:01:00.000Z',
          service: 'checkoutservice',
          namespace: 'default',
          requestRate: 5
        }
      ],
      displayedTrafficVolume: '22.50'
    })

    assert.equal(result.expected, '22.50')
    assert.equal(result.displayed, '22.50')
    assert.equal(result.pass, true)
    assert.equal(result.absoluteDelta, 0)
    assert.equal(result.expectedRawRequestRate, 22.5)
    assert.equal(result.displayedRawRequestRate, 22.5)
  }
)

test('fails traffic volume card comparison when displayed value diverges', () => {
  const result = compareTrafficVolumeSummaryCard({
    rawTelemetryPoints: [
      {
        timestamp: '2026-03-08T00:00:00.000Z',
        service: 'frontend',
        namespace: 'default',
        requestRate: 12.5
      }
    ],
    displayedTrafficVolume: '12.00'
  })

  assert.equal(result.expected, '12.50')
  assert.equal(result.displayed, '12.00')
  assert.equal(result.pass, false)
  assert.equal(result.absoluteDelta, 0.5)
  assert.equal(result.expectedRawRequestRate, 12.5)
  assert.equal(result.displayedRawRequestRate, 12)
})

test('uses N/A expectation when no per-service points were collected', () => {
  const result = compareTrafficVolumeSummaryCard({
    rawTelemetryPoints: [],
    displayedTrafficVolume: 'N/A'
  })

  assert.equal(result.expected, 'N/A')
  assert.equal(result.displayed, 'N/A')
  assert.equal(result.pass, true)
  assert.equal(result.absoluteDelta, 0)
  assert.equal(result.expectedRawRequestRate, null)
  assert.equal(result.displayedRawRequestRate, null)
})

test(
  'computes system health as 100 - weighted error rate across raw window telemetry',
  () => {
    const result = compareSystemHealthSummaryCard({
      rawTelemetryPoints: [
        {
          timestamp: '2026-03-08T00:00:00.000Z',
          service: 'frontend',
          namespace: 'default',
          requestRate: 80,
          errorRate: 0.02
        },
        {
          timestamp: '2026-03-08T00:00:00.000Z',
          service: 'checkoutservice',
          namespace: 'default',
          requestRate: 20,
          errorRate: 5
        },
        {
          timestamp: '2026-03-08T00:01:00.000Z',
          service: 'inventoryservice',
          namespace: 'default',
          requestRate: 0,
          errorRate: 0.5
        }
      ],
      displayedSystemHealth: '97.40%'
    })

    assert.equal(result.expected, '97.40%')
    assert.equal(result.displayed, '97.40%')
    assert.equal(result.pass, true)
    assert.equal(result.absoluteDelta, 0)
    assert.equal(result.expectedRawHealthScore, 97.4)
    assert.equal(result.displayedRawHealthScore, 97.4)
  }
)

test(
  'falls back to simple average error rate when no services have positive traffic',
  () => {
    const result = compareSystemHealthSummaryCard({
      rawTelemetryPoints: [
        {
          timestamp: '2026-03-08T00:00:00.000Z',
          service: 'frontend',
          namespace: 'default',
          requestRate: 0,
          errorRate: 0.02
        },
        {
          timestamp: '2026-03-08T00:01:00.000Z',
          service: 'checkoutservice',
          namespace: 'default',
          requestRate: 0,
          errorRate: 0.04
        }
      ],
      displayedSystemHealth: '97.00%'
    })

    assert.equal(result.expected, '97.00%')
    assert.equal(result.displayed, '97.00%')
    assert.equal(result.pass, true)
    assert.equal(result.absoluteDelta, 0)
    assert.equal(result.expectedRawHealthScore, 97)
    assert.equal(result.displayedRawHealthScore, 97)
  }
)

test(
  'computes speed as the worst p95 seen anywhere in the selected window',
  () => {
    const result = compareSpeedSummaryCard({
      rawTelemetryPoints: [
        {
          timestamp: '2026-03-08T00:00:00.000Z',
          service: 'frontend',
          namespace: 'default',
          p95: 420
        },
        {
          timestamp: '2026-03-08T00:01:00.000Z',
          service: 'checkoutservice',
          namespace: 'default',
          p95: '850'
        },
        {
          timestamp: '2026-03-08T00:02:00.000Z',
          service: 'inventoryservice',
          namespace: 'default',
          p95: undefined
        },
        {
          timestamp: '2026-03-08T00:03:00.000Z',
          service: 'paymentservice',
          namespace: 'default',
          p95: 'not-a-number'
        }
      ],
      displayedSpeed: '850ms'
    })

    assert.equal(result.expected, '850ms')
    assert.equal(result.displayed, '850ms')
    assert.equal(result.pass, true)
    assert.equal(result.absoluteDelta, 0)
    assert.equal(result.expectedRawP95Milliseconds, 850)
    assert.equal(result.displayedRawP95Milliseconds, 850)
  }
)

test('fails speed card comparison when displayed latency diverges', () => {
  const result = compareSpeedSummaryCard({
    rawTelemetryPoints: [
      {
        timestamp: '2026-03-08T00:00:00.000Z',
        service: 'frontend',
        namespace: 'default',
        p95: 1200
      }
    ],
    displayedSpeed: '1.00s'
  })

  assert.equal(result.expected, '1.20s')
  assert.equal(result.displayed, '1.00s')
  assert.equal(result.pass, false)
  assert.equal(result.absoluteDelta, 200)
  assert.equal(result.expectedRawP95Milliseconds, 1200)
  assert.equal(result.displayedRawP95Milliseconds, 1000)
})

test('uses N/A speed expectation when no finite p95 datapoints exist', () => {
  const result = compareSpeedSummaryCard({
    rawTelemetryPoints: [
      {
        timestamp: '2026-03-08T00:00:00.000Z',
        service: 'frontend',
        namespace: 'default',
        p95: null
      },
      {
        timestamp: '2026-03-08T00:01:00.000Z',
        service: 'checkoutservice',
        namespace: 'default'
      }
    ],
    displayedSpeed: 'N/A'
  })

  assert.equal(result.expected, 'N/A')
  assert.equal(result.displayed, 'N/A')
  assert.equal(result.pass, true)
  assert.equal(result.absoluteDelta, 0)
  assert.equal(result.expectedRawP95Milliseconds, null)
  assert.equal(result.displayedRawP95Milliseconds, null)
})

test(
  'computes uptime reliability as average normalized availability across the selected window',
  () => {
    const result = compareUptimeReliabilitySummaryCard({
      rawTelemetryPoints: [
        {
          timestamp: '2026-03-08T00:00:00.000Z',
          service: 'frontend',
          namespace: 'default',
          availability: 0.99
        },
        {
          timestamp: '2026-03-08T00:01:00.000Z',
          service: 'checkoutservice',
          namespace: 'default',
          availability: '98.5'
        },
        {
          timestamp: '2026-03-08T00:02:00.000Z',
          service: 'inventoryservice',
          namespace: 'default',
          availability: null
        }
      ],
      displayedUptimeReliability: '98.75%'
    })

    assert.equal(result.expected, '98.75%')
    assert.equal(result.displayed, '98.75%')
    assert.equal(result.pass, true)
    assert.equal(result.absoluteDelta, 0)
    assert.equal(result.expectedRawUptimeReliabilityPercent, 98.75)
    assert.equal(result.displayedRawUptimeReliabilityPercent, 98.75)
  }
)

test('uses N/A uptime reliability expectation when no finite availability exists', () => {
  const result = compareUptimeReliabilitySummaryCard({
    rawTelemetryPoints: [
      {
        timestamp: '2026-03-08T00:00:00.000Z',
        service: 'frontend',
        namespace: 'default',
        availability: null
      },
      {
        timestamp: '2026-03-08T00:01:00.000Z',
        service: 'checkoutservice',
        namespace: 'default',
        availability: 'unknown'
      }
    ],
    displayedUptimeReliability: 'N/A'
  })

  assert.equal(result.expected, 'N/A')
  assert.equal(result.displayed, 'N/A')
  assert.equal(result.pass, true)
  assert.equal(result.absoluteDelta, 0)
  assert.equal(result.expectedRawUptimeReliabilityPercent, null)
  assert.equal(result.displayedRawUptimeReliabilityPercent, null)
})

test(
  'records expected, displayed, absolute delta, and pass/fail for every summary card comparison',
  () => {
    const result = validateVitalSignsSummaryCards({
      rawTelemetryPoints: [
        {
          timestamp: '2026-03-08T00:00:00.000Z',
          service: 'frontend',
          namespace: 'default',
          requestRate: 10,
          errorRate: 0.02,
          p95: 275,
          availability: 0.99
        }
      ],
      displayedSummaryCards: {
        trafficVolume: '10.00',
        systemHealth: '98.00%',
        speed: '275ms',
        uptimeReliability: '99.00%'
      }
    })

    for (const comparison of Object.values(result)) {
      assert.equal(typeof comparison.expected, 'string')
      assert.equal(typeof comparison.displayed, 'string')
      assert.equal(
        typeof comparison.absoluteDelta === 'number' ||
          comparison.absoluteDelta === null,
        true
      )
      assert.equal(typeof comparison.pass, 'boolean')
    }
  }
)
