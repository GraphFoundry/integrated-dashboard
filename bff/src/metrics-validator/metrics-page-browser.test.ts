import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildMetricsPageUrl,
  deriveMetricsTimeRangeValue,
  openMetricsPageWithSelectedWindowAndScope
} from './metrics-page-browser'

function createValidatorCapture(
  overrides: Partial<{
    loading: boolean
    selectedServiceId: string
    selectedTimeRange: string
  }> = {}
) {
  return {
    loading: overrides.loading ?? false,
    selectedServiceId: overrides.selectedServiceId ?? 'default:checkoutservice',
    selectedTimeRange: overrides.selectedTimeRange ?? '1h',
    capturedAtUtc: '2026-03-08T00:01:00.000Z',
    summaryCards: {
      trafficVolume: '123.45',
      systemHealth: '99.50%',
      speed: '420.00 ms',
      uptimeReliability: '99.99%'
    },
    tableRows: [
      {
        serviceId: 'default:checkoutservice',
        componentName: 'checkoutservice',
        namespace: 'default',
        traffic: '23.10',
        successRate: '99.20%',
        slowEndResponseTime: '380.00 ms',
        uptime: '99.90%',
        riskBadge: {
          level: 'medium',
          label: 'Medium Risk',
          reason: 'Elevated error rate (0.80%)'
        }
      }
    ],
    simulationPanel: {
      runs7d: '8',
      failureRuns: '3',
      scaleRuns: '5',
      avgAffected: '1.80',
      avgLatencyDelta: '+12.30 ms',
      lowConfidenceRuns: '1',
      runTrend: [
        {
          date: '2026-03-07',
          runs: '2',
          failureRuns: '1',
          scaleRuns: '1'
        }
      ]
    },
    chartSeries: {
      traffic: [
        {
          timestamp: '2026-03-08T00:00:00.000Z',
          value: 23.1
        }
      ],
      failureRate: [
        {
          timestamp: '2026-03-08T00:00:00.000Z',
          value: 0.8
        }
      ],
      responseSpeed: [
        {
          timestamp: '2026-03-08T00:00:00.000Z',
          p95: 380
        }
      ],
      uptime: [
        {
          timestamp: '2026-03-08T00:00:00.000Z',
          value: 99.9
        }
      ],
      hasP50Data: false,
      hasP99Data: false
    }
  }
}

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
  const validatorCapture = createValidatorCapture()
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
    readMetricsValidatorCapture: async () => validatorCapture,
    readPageLoadTimestampUtc: async () => '2026-03-08T00:00:00.000Z',
    readSelectedFiltersCapture: async () => ({
      serviceId: 'default:checkoutservice',
      serviceLabel: 'checkoutservice (default)',
      timeRange: '1h',
      timeRangeLabel: 'Last 1 hour'
    }),
    captureScreenshot: async (outputPath: string) => {
      observedSteps.push(`screenshot:${outputPath}`)
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
      serviceScope: 'default:checkoutservice',
      auditScreenshotPath: '/tmp/metrics-audit.png'
    },
    async () => fakeSession
  )

  assert.equal(result.metricsPageUrl, 'http://dashboard.local:5173/metrics')
  assert.equal(result.auditScreenshotPath, '/tmp/metrics-audit.png')
  assert.equal(result.pageLoadTimestampUtc, '2026-03-08T00:00:00.000Z')
  assert.equal(result.appliedServiceScope, 'default:checkoutservice')
  assert.equal(result.appliedTimeRange, '1h')
  assert.deepEqual(result.selectedFilters, {
    service: {
      serviceId: 'default:checkoutservice',
      label: 'checkoutservice (default)'
    },
    timeRange: {
      value: '1h',
      label: 'Last 1 hour'
    }
  })
  assert.equal(result.displayedValues.summaryCards.trafficVolume, '123.45')
  assert.equal(result.displayedValues.tableRows[0]?.riskBadge.label, 'Medium Risk')
  assert.equal(result.displayedValues.simulationPanel?.runs7d, '8')
  assert.equal(result.displayedValues.chartSeries.responseSpeed[0]?.p95, 380)
  assert.deepEqual(observedSteps, [
    'goto:http://dashboard.local:5173/metrics',
    'wait:#service-select',
    'wait:#time-range-select',
    'select:#service-select=default:checkoutservice',
    'select:#time-range-select=1h',
    'screenshot:/tmp/metrics-audit.png',
    'close'
  ])
})

test('normalizes global service scope values to the metrics global selector option', async () => {
  const selectedValues: string[] = []
  const validatorCapture = createValidatorCapture({
    selectedServiceId: '',
    selectedTimeRange: '5m'
  })
  const fakeSession = {
    goto: async () => {},
    waitForSelector: async () => {},
    selectOption: async (_selector: string, value: string) => {
      selectedValues.push(value)
    },
    readMetricsValidatorCapture: async () => validatorCapture,
    readPageLoadTimestampUtc: async () => '2026-03-08T00:00:00.000Z',
    readSelectedFiltersCapture: async () => ({
      serviceId: '',
      serviceLabel: 'Entire System (Global)',
      timeRange: '5m',
      timeRangeLabel: 'Last 5 minutes (Real-time)'
    }),
    captureScreenshot: async () => {},
    url: () => 'http://dashboard.local:5173/metrics',
    close: async () => {}
  }

  const result = await openMetricsPageWithSelectedWindowAndScope(
    {
      dashboardUrl: 'http://dashboard.local:5173',
      windowStartUtc: '2026-03-08T00:00:00.000Z',
      windowEndUtc: '2026-03-08T00:05:00.000Z',
      serviceScope: 'global',
      auditScreenshotPath: '/tmp/metrics-global-audit.png'
    },
    async () => fakeSession
  )

  assert.equal(result.appliedServiceScope, '')
  assert.equal(selectedValues[0], '')
  assert.deepEqual(result.selectedFilters, {
    service: {
      serviceId: '',
      label: 'Entire System (Global)'
    },
    timeRange: {
      value: '5m',
      label: 'Last 5 minutes (Real-time)'
    }
  })
  assert.equal(result.displayedValues.summaryCards.systemHealth, '99.50%')
})

test('throws when metrics page-load timestamp is unavailable from browser context', async () => {
  const fakeSession = {
    goto: async () => {},
    waitForSelector: async () => {},
    selectOption: async () => {},
    readMetricsValidatorCapture: async () => createValidatorCapture(),
    readPageLoadTimestampUtc: async () => null,
    readSelectedFiltersCapture: async () => ({
      serviceId: '',
      serviceLabel: 'Entire System (Global)',
      timeRange: '5m',
      timeRangeLabel: 'Last 5 minutes (Real-time)'
    }),
    captureScreenshot: async () => {},
    url: () => 'http://dashboard.local:5173/metrics',
    close: async () => {}
  }

  await assert.rejects(
    () =>
      openMetricsPageWithSelectedWindowAndScope(
        {
          dashboardUrl: 'http://dashboard.local:5173',
          windowStartUtc: '2026-03-08T00:00:00.000Z',
          windowEndUtc: '2026-03-08T00:05:00.000Z',
          serviceScope: 'global',
          auditScreenshotPath: '/tmp/metrics-audit-missing-page-load.png'
        },
        async () => fakeSession
      ),
    /missing a valid page-load timestamp/
  )
})

test('throws when run window is invalid for metrics-page time horizon mapping', async () => {
  await assert.rejects(
    () =>
      openMetricsPageWithSelectedWindowAndScope(
        {
          dashboardUrl: 'http://dashboard.local:5173',
          windowStartUtc: '2026-03-08T02:00:00.000Z',
          windowEndUtc: '2026-03-08T01:00:00.000Z',
          serviceScope: 'default:checkoutservice',
          auditScreenshotPath: '/tmp/metrics-invalid-window.png'
        },
        async () => {
          throw new Error('should not create browser session for invalid windows')
        }
      ),
    /Invalid run window/
  )
})

test('throws when selected filters shown in UI are unavailable from browser context', async () => {
  const fakeSession = {
    goto: async () => {},
    waitForSelector: async () => {},
    selectOption: async () => {},
    readMetricsValidatorCapture: async () => createValidatorCapture(),
    readPageLoadTimestampUtc: async () => '2026-03-08T00:00:00.000Z',
    readSelectedFiltersCapture: async () => null,
    captureScreenshot: async () => {},
    url: () => 'http://dashboard.local:5173/metrics',
    close: async () => {}
  }

  await assert.rejects(
    () =>
      openMetricsPageWithSelectedWindowAndScope(
        {
          dashboardUrl: 'http://dashboard.local:5173',
          windowStartUtc: '2026-03-08T00:00:00.000Z',
          windowEndUtc: '2026-03-08T01:00:00.000Z',
          serviceScope: 'default:checkoutservice',
          auditScreenshotPath: '/tmp/metrics-missing-ui-filters.png'
        },
        async () => fakeSession
      ),
    /missing selected filter labels/
  )
})
