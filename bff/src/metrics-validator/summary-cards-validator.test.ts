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
  'computes traffic volume as sum of latest positive-traffic request rates and passes on match',
  () => {
    const result = compareTrafficVolumeSummaryCard({
      latestPerServicePoints: [
        {
          serviceKey: 'default:frontend',
          selectionReason: 'latestPositiveTraffic',
          datapoint: { requestRate: 12.3456 }
        },
        {
          serviceKey: 'default:checkoutservice',
          selectionReason: 'latestPositiveTraffic',
          datapoint: { requestRate: '7.6544' }
        },
        {
          serviceKey: 'default:inventoryservice',
          selectionReason: 'latestOverallFallback',
          datapoint: { requestRate: 0 }
        }
      ],
      displayedTrafficVolume: '20.00'
    })

    assert.equal(result.expected, '20.00')
    assert.equal(result.displayed, '20.00')
    assert.equal(result.pass, true)
    assert.equal(result.absoluteDelta, 0)
    assert.equal(result.expectedRawRequestRate, 20)
    assert.equal(result.displayedRawRequestRate, 20)
  }
)

test('fails traffic volume card comparison when displayed value diverges', () => {
  const result = compareTrafficVolumeSummaryCard({
    latestPerServicePoints: [
      {
        serviceKey: 'default:frontend',
        selectionReason: 'latestPositiveTraffic',
        datapoint: { requestRate: 12.5 }
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
    latestPerServicePoints: [],
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
  'computes system health as 100 - weighted error rate using positive request-rate weighting',
  () => {
    const result = compareSystemHealthSummaryCard({
      latestPerServicePoints: [
        {
          serviceKey: 'default:frontend',
          selectionReason: 'latestPositiveTraffic',
          datapoint: { requestRate: 80, errorRate: 0.02 }
        },
        {
          serviceKey: 'default:checkoutservice',
          selectionReason: 'latestPositiveTraffic',
          datapoint: { requestRate: 20, errorRate: 5 }
        },
        {
          serviceKey: 'default:inventoryservice',
          selectionReason: 'latestOverallFallback',
          datapoint: { requestRate: 0, errorRate: 0.5 }
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
      latestPerServicePoints: [
        {
          serviceKey: 'default:frontend',
          selectionReason: 'latestOverallFallback',
          datapoint: { requestRate: 0, errorRate: 0.02 }
        },
        {
          serviceKey: 'default:checkoutservice',
          selectionReason: 'latestOverallFallback',
          datapoint: { requestRate: 0, errorRate: 0.04 }
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
  'computes speed as max latest p95 across services while ignoring missing p95 values',
  () => {
    const result = compareSpeedSummaryCard({
      latestPerServicePoints: [
        {
          serviceKey: 'default:frontend',
          selectionReason: 'latestPositiveTraffic',
          datapoint: { p95: 420 }
        },
        {
          serviceKey: 'default:checkoutservice',
          selectionReason: 'latestPositiveTraffic',
          datapoint: { p95: '850' }
        },
        {
          serviceKey: 'default:inventoryservice',
          selectionReason: 'latestOverallFallback',
          datapoint: { p95: undefined }
        },
        {
          serviceKey: 'default:paymentservice',
          selectionReason: 'latestOverallFallback',
          datapoint: { p95: 'not-a-number' }
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
    latestPerServicePoints: [
      {
        serviceKey: 'default:frontend',
        selectionReason: 'latestPositiveTraffic',
        datapoint: { p95: 1200 }
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
    latestPerServicePoints: [
      {
        serviceKey: 'default:frontend',
        selectionReason: 'latestPositiveTraffic',
        datapoint: { p95: null }
      },
      {
        serviceKey: 'default:checkoutservice',
        selectionReason: 'latestPositiveTraffic',
        datapoint: {}
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
  'computes uptime reliability as average normalized availability across services',
  () => {
    const result = compareUptimeReliabilitySummaryCard({
      latestPerServicePoints: [
        {
          serviceKey: 'default:frontend',
          selectionReason: 'latestPositiveTraffic',
          datapoint: { availability: 0.99 }
        },
        {
          serviceKey: 'default:checkoutservice',
          selectionReason: 'latestPositiveTraffic',
          datapoint: { availability: '98.5' }
        },
        {
          serviceKey: 'default:inventoryservice',
          selectionReason: 'latestOverallFallback',
          datapoint: { availability: null }
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
    latestPerServicePoints: [
      {
        serviceKey: 'default:frontend',
        selectionReason: 'latestPositiveTraffic',
        datapoint: { availability: null }
      },
      {
        serviceKey: 'default:checkoutservice',
        selectionReason: 'latestPositiveTraffic',
        datapoint: { availability: 'unknown' }
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
      latestPerServicePoints: [
        {
          serviceKey: 'default:frontend',
          selectionReason: 'latestPositiveTraffic',
          datapoint: {
            requestRate: 10,
            errorRate: 0.02,
            p95: 275,
            availability: 0.99
          }
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
