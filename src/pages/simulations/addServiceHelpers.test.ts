import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildDependencyChainPayload,
  getDependencyChainErrors,
  getLiveServiceIdHint,
  normalizeLiveServiceInput,
} from './addServiceHelpers.ts'

test('normalizeLiveServiceInput converts labeled combobox values to namespace:name ids', () => {
  assert.equal(
    normalizeLiveServiceInput('checkoutservice (default) - 2 pods, 100% up'),
    'default:checkoutservice'
  )
  assert.equal(normalizeLiveServiceInput('default:paymentservice'), 'default:paymentservice')
})

test('buildDependencyChainPayload trims empty rows and preserves order', () => {
  assert.deepEqual(buildDependencyChainPayload([' default:frontend ', '', 'default:cartservice']), [
    { serviceId: 'default:frontend', relation: 'calls' },
    { serviceId: 'default:cartservice', relation: 'calls' },
  ])
})

test('getDependencyChainErrors flags missing, duplicate, and unknown dependencies', () => {
  const available = new Set(['default:frontend', 'default:cartservice'])

  assert.deepEqual(
    getDependencyChainErrors(
      ['', 'default:frontend', 'default:frontend', 'default:missing'],
      available
    ),
    [
      'Select a dependency service.',
      'Each dependency can appear only once in the chain.',
      'Each dependency can appear only once in the chain.',
      'Service not found in graph. Select from the dropdown or check the service name.',
    ]
  )
})

test('getLiveServiceIdHint validates namespace:name format', () => {
  const available = new Set(['default:frontend'])

  assert.equal(
    getLiveServiceIdHint('frontend', available),
    'Format: namespace:name (e.g., default:productcatalog)'
  )
  assert.equal(getLiveServiceIdHint('default:frontend', available), null)
})
