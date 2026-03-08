import assert from 'node:assert/strict'
import test from 'node:test'
import { type LatestPerServiceTelemetryPoint } from './influx-telemetry-collector'
import { validateSystemComponentsTable } from './system-components-validator'

function createPoint(
  serviceId: string,
  errorRate: unknown,
  overrides: Record<string, unknown> = {}
): LatestPerServiceTelemetryPoint {
  return {
    serviceKey: serviceId,
    selectionReason: 'latestOverallFallback',
    datapoint: {
      serviceId,
      errorRate,
      ...overrides
    }
  }
}

function createDisplayedRow(
  serviceId: string,
  overrides: Partial<{
    traffic: string
    successRate: string
    slowEndResponseTime: string
    uptime: string
    riskBadge: {
      level: string
      label: string
      reason: string
    }
  }> = {}
): {
  serviceId: string
  traffic: string
  successRate: string
  slowEndResponseTime: string
  uptime: string
  riskBadge: {
    level: string
    label: string
    reason: string
  }
} {
  return {
    serviceId,
    traffic: 'N/A',
    successRate: 'N/A',
    slowEndResponseTime: 'N/A',
    uptime: 'N/A',
    riskBadge: {
      level: 'low',
      label: 'Low Risk',
      reason: 'Stable'
    },
    ...overrides
  }
}

test('validates up to ten services in descending normalized error-rate order', () => {
  const latestPerServicePoints: ReadonlyArray<LatestPerServiceTelemetryPoint> = [
    createPoint('ns:svc-1', 0.4),
    createPoint('ns:svc-2', 0.12),
    createPoint('ns:svc-3', 5),
    createPoint('ns:svc-4', 0.8),
    createPoint('ns:svc-5', 1.2),
    createPoint('ns:svc-6', 0.01),
    createPoint('ns:svc-7', 0.35),
    createPoint('ns:svc-8', null),
    createPoint('ns:svc-9', undefined),
    createPoint('ns:svc-10', 0.03),
    createPoint('ns:svc-11', 2),
    createPoint('ns:svc-12', 1000)
  ]

  const result = validateSystemComponentsTable({
    latestPerServicePoints,
    displayedTableRows: [
      { serviceId: 'ns:svc-12' },
      { serviceId: 'ns:svc-4' },
      { serviceId: 'ns:svc-1' },
      { serviceId: 'ns:svc-7' },
      { serviceId: 'ns:svc-2' },
      { serviceId: 'ns:svc-3' },
      { serviceId: 'ns:svc-10' },
      { serviceId: 'ns:svc-11' },
      { serviceId: 'ns:svc-5' },
      { serviceId: 'ns:svc-6' }
    ]
  })

  assert.equal(result.serviceOrdering.maxServicesValidated, 10)
  assert.equal(result.serviceOrdering.expectedCount, 10)
  assert.deepEqual(result.serviceOrdering.expectedServiceIds, [
    'ns:svc-12',
    'ns:svc-4',
    'ns:svc-1',
    'ns:svc-7',
    'ns:svc-2',
    'ns:svc-3',
    'ns:svc-10',
    'ns:svc-11',
    'ns:svc-5',
    'ns:svc-6'
  ])
  assert.equal(result.serviceOrdering.pass, true)
})

test('fails ordering comparison when displayed table rows are out of order', () => {
  const latestPerServicePoints: ReadonlyArray<LatestPerServiceTelemetryPoint> = [
    createPoint('team:checkout', 0.5),
    createPoint('team:payments', 0.25),
    createPoint('team:catalog', 0.1)
  ]

  const result = validateSystemComponentsTable({
    latestPerServicePoints,
    displayedTableRows: [
      { serviceId: 'team:payments' },
      { serviceId: 'team:checkout' },
      { serviceId: 'team:catalog' }
    ]
  })

  assert.deepEqual(result.serviceOrdering.expectedServiceIds, [
    'team:checkout',
    'team:payments',
    'team:catalog'
  ])
  assert.equal(result.serviceOrdering.pass, false)
})

test('places services with missing error-rate values after numeric error-rates', () => {
  const result = validateSystemComponentsTable({
    latestPerServicePoints: [
      createPoint('core:api', null),
      createPoint('core:queue', 0.03),
      createPoint('core:worker', Number.NaN)
    ],
    displayedTableRows: [
      { serviceId: 'core:queue' },
      { serviceId: 'core:api' },
      { serviceId: 'core:worker' }
    ]
  })

  assert.deepEqual(result.serviceOrdering.expectedServiceIds, [
    'core:queue',
    'core:api',
    'core:worker'
  ])
  assert.equal(result.serviceOrdering.pass, true)
})

test('validates per-row traffic/success/latency/uptime values against formatted telemetry', () => {
  const result = validateSystemComponentsTable({
    latestPerServicePoints: [
      createPoint('core:checkout', 0.02, {
        requestRate: 12.3456,
        p95: 123.4,
        availability: 99.9
      }),
      createPoint('core:payments', 0.012, {
        requestRate: 0.00003,
        p95: 0.45,
        availability: 0.999
      })
    ],
    displayedTableRows: [
      createDisplayedRow('core:checkout', {
        traffic: '12.35',
        successRate: '98.00%',
        slowEndResponseTime: '123ms',
        uptime: '99.90%'
      }),
      createDisplayedRow('core:payments', {
        traffic: '<0.0001',
        successRate: '98.80%',
        slowEndResponseTime: '450μs',
        uptime: '99.90%'
      })
    ]
  })

  assert.equal(result.rowMetricValues.pass, true)
  assert.equal(result.rowMetricValues.expectedRowCount, 2)
  assert.equal(result.rowMetricValues.displayedRowCount, 2)
  assert.deepEqual(result.rowMetricValues.comparedServiceIds, [
    'core:checkout',
    'core:payments'
  ])
  assert.equal(result.rowMetricValues.rowComparisons.length, 2)
  for (const rowComparison of result.rowMetricValues.rowComparisons) {
    assert.equal(rowComparison.pass, true)
    assert.equal(rowComparison.traffic.pass, true)
    assert.equal(rowComparison.successRate.pass, true)
    assert.equal(rowComparison.slowEndResponseTime.pass, true)
    assert.equal(rowComparison.uptime.pass, true)
  }
})

test('fails per-row comparison when displayed values differ from expected formatting', () => {
  const result = validateSystemComponentsTable({
    latestPerServicePoints: [
      createPoint('core:checkout', 0.02, {
        requestRate: 12.3456,
        p95: 123.4,
        availability: 99.9
      })
    ],
    displayedTableRows: [
      createDisplayedRow('core:checkout', {
        traffic: '12.35',
        successRate: '95.00%',
        slowEndResponseTime: '123ms',
        uptime: '99.90%'
      })
    ]
  })

  assert.equal(result.rowMetricValues.pass, false)
  assert.equal(result.rowMetricValues.rowComparisons.length, 1)
  const checkoutRow = result.rowMetricValues.rowComparisons[0]
  assert.equal(checkoutRow.serviceId, 'core:checkout')
  assert.equal(checkoutRow.pass, false)
  assert.equal(checkoutRow.traffic.pass, true)
  assert.equal(checkoutRow.successRate.pass, false)
  assert.equal(checkoutRow.slowEndResponseTime.pass, true)
  assert.equal(checkoutRow.uptime.pass, true)
  assert.equal(checkoutRow.successRate.expected, '98.00%')
  assert.equal(checkoutRow.successRate.displayed, '95.00%')
})

test('validates risk badge classification using ordered high/medium/low rules', () => {
  const result = validateSystemComponentsTable({
    latestPerServicePoints: [
      createPoint('svc:high-error', 0.08, {
        availability: 99.9,
        p95: 400
      }),
      createPoint('svc:high-availability', 0.005, {
        availability: 94.9,
        p95: 400
      }),
      createPoint('svc:high-latency', 0.005, {
        availability: 99.9,
        p95: 1500
      }),
      createPoint('svc:medium-error', 0.02, {
        availability: 99.9,
        p95: 400
      }),
      createPoint('svc:medium-availability', 0.005, {
        availability: 98.5,
        p95: 400
      }),
      createPoint('svc:medium-latency', 0.005, {
        availability: 99.9,
        p95: 700
      }),
      createPoint('svc:low-stable', 0.005, {
        availability: 99.9,
        p95: 120
      })
    ],
    displayedTableRows: [
      createDisplayedRow('svc:high-error', {
        riskBadge: { level: 'high', label: 'High Risk', reason: 'High error rate' }
      }),
      createDisplayedRow('svc:high-availability', {
        riskBadge: { level: 'high', label: 'High Risk', reason: 'Low availability' }
      }),
      createDisplayedRow('svc:high-latency', {
        riskBadge: { level: 'high', label: 'High Risk', reason: 'P95 latency spike' }
      }),
      createDisplayedRow('svc:medium-error', {
        riskBadge: { level: 'medium', label: 'Medium Risk', reason: 'Elevated error rate' }
      }),
      createDisplayedRow('svc:medium-availability', {
        riskBadge: {
          level: 'medium',
          label: 'Medium Risk',
          reason: 'Availability degraded'
        }
      }),
      createDisplayedRow('svc:medium-latency', {
        riskBadge: { level: 'medium', label: 'Medium Risk', reason: 'Elevated latency' }
      }),
      createDisplayedRow('svc:low-stable', {
        riskBadge: { level: 'low', label: 'Low Risk', reason: 'Stable' }
      })
    ]
  })

  assert.equal(result.riskBadgeClassification.pass, true)
  assert.equal(result.riskBadgeClassification.expectedRowCount, 7)
  assert.equal(result.riskBadgeClassification.displayedRowCount, 7)
  assert.equal(result.riskBadgeClassification.rowComparisons.length, 7)
  for (const rowComparison of result.riskBadgeClassification.rowComparisons) {
    assert.equal(rowComparison.pass, true)
    assert.equal(rowComparison.expected, rowComparison.displayed)
  }
})

test('fails risk badge classification when displayed risk level does not match', () => {
  const result = validateSystemComponentsTable({
    latestPerServicePoints: [
      createPoint('svc:checkout', 0.05, {
        availability: 99.9,
        p95: 400
      })
    ],
    displayedTableRows: [
      createDisplayedRow('svc:checkout', {
        riskBadge: { level: 'low', label: 'Low Risk', reason: 'Stable' }
      })
    ]
  })

  assert.equal(result.riskBadgeClassification.pass, false)
  assert.equal(result.riskBadgeClassification.rowComparisons.length, 1)
  const row = result.riskBadgeClassification.rowComparisons[0]
  assert.equal(row.serviceId, 'svc:checkout')
  assert.equal(row.expected, 'medium')
  assert.equal(row.displayed, 'low')
  assert.equal(row.pass, false)
})
