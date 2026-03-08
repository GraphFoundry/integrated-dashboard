import assert from 'node:assert/strict'
import test from 'node:test'
import { compareTrafficVolumeSummaryCard } from './summary-cards-validator'

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
