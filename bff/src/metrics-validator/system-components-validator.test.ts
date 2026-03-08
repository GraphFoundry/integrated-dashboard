import assert from 'node:assert/strict'
import test from 'node:test'
import { type LatestPerServiceTelemetryPoint } from './influx-telemetry-collector'
import { validateSystemComponentsTable } from './system-components-validator'

function createPoint(
  serviceId: string,
  errorRate: unknown
): LatestPerServiceTelemetryPoint {
  return {
    serviceKey: serviceId,
    selectionReason: 'latestOverallFallback',
    datapoint: {
      serviceId,
      errorRate
    }
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
