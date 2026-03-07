import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildMetricsPageUrl,
  deriveMetricsTimeRangeValue,
  openMetricsPageWithSelectedWindowAndScope
} from './metrics-page-browser'

test('buildMetricsPageUrl resolves the metrics route from dashboard entry URLs', () => {
  assert.equal(
    buildMetricsPageUrl('http://dashboard.local:5173'),
    'http://dashboard.local:5173/metrics'
  )
  assert.equal(
    buildMetricsPageUrl('http://dashboard.local:5173/overview?tab=foo#section'),
    'http://dashboard.local:5173/metrics'
  )
  assert.equal(
    buildMetricsPageUrl('http://dashboard.local:5173/app'),
    'http://dashboard.local:5173/app/metrics'
  )
})

test('deriveMetricsTimeRangeValue maps selected run window to nearest metrics horizon', () => {
  assert.equal(
    deriveMetricsTimeRangeValue('2026-03-08T00:00:00.000Z', '2026-03-08T00:05:00.000Z'),
    '5m'
  )
  assert.equal(
    deriveMetricsTimeRangeValue('2026-03-08T00:00:00.000Z', '2026-03-08T00:20:00.000Z'),
    '15m'
  )
  assert.equal(
    deriveMetricsTimeRangeValue('2026-03-08T00:00:00.000Z', '2026-03-08T02:00:00.000Z'),
    '1h'
  )
})

test('opens metrics page and applies selected service scope + time horizon via browser session', async () => {
  const observedSteps: string[] = []
  const fakeSession = {
    goto: async (url: string) => {
      observedSteps.push(`goto:${url}`)
    },
    waitForSelector: async (selector: string) => {
      observedSteps.push(`wait:${selector}`)
    },
    selectOption: async (selector: string, value: string) => {
      observedSteps.push(`select:${selector}=${value}`)
    },
    url: () => 'http://dashboard.local:5173/metrics',
    close: async () => {
      observedSteps.push('close')
    }
  }

  const result = await openMetricsPageWithSelectedWindowAndScope(
    {
      dashboardUrl: 'http://dashboard.local:5173/overview',
      windowStartUtc: '2026-03-08T00:00:00.000Z',
      windowEndUtc: '2026-03-08T01:00:00.000Z',
      serviceScope: 'default:checkoutservice'
    },
    async () => fakeSession
  )

  assert.equal(result.metricsPageUrl, 'http://dashboard.local:5173/metrics')
  assert.equal(result.appliedServiceScope, 'default:checkoutservice')
  assert.equal(result.appliedTimeRange, '1h')
  assert.deepEqual(observedSteps, [
    'goto:http://dashboard.local:5173/metrics',
    'wait:#service-select',
    'wait:#time-range-select',
    'select:#service-select=default:checkoutservice',
    'select:#time-range-select=1h',
    'close'
  ])
})

test('normalizes global service scope values to the metrics global selector option', async () => {
  const selectedValues: string[] = []
  const fakeSession = {
    goto: async () => {},
    waitForSelector: async () => {},
    selectOption: async (_selector: string, value: string) => {
      selectedValues.push(value)
    },
    url: () => 'http://dashboard.local:5173/metrics',
    close: async () => {}
  }

  const result = await openMetricsPageWithSelectedWindowAndScope(
    {
      dashboardUrl: 'http://dashboard.local:5173',
      windowStartUtc: '2026-03-08T00:00:00.000Z',
      windowEndUtc: '2026-03-08T00:05:00.000Z',
      serviceScope: 'global'
    },
    async () => fakeSession
  )

  assert.equal(result.appliedServiceScope, '')
  assert.equal(selectedValues[0], '')
})

test('throws when run window is invalid for metrics-page time horizon mapping', async () => {
  await assert.rejects(
    () =>
      openMetricsPageWithSelectedWindowAndScope(
        {
          dashboardUrl: 'http://dashboard.local:5173',
          windowStartUtc: '2026-03-08T02:00:00.000Z',
          windowEndUtc: '2026-03-08T01:00:00.000Z',
          serviceScope: 'default:checkoutservice'
        },
        async () => {
          throw new Error('should not create browser session for invalid windows')
        }
      ),
    /Invalid run window/
  )
})
