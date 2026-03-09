import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getFailureAffectedCallers,
  getFailureAffectedDownstream,
  getFailureAffectedServiceCount,
} from './decisionHistory.ts'

test('counts legacy failure affected services from callers and downstream arrays', () => {
  const result = {
    affectedCallers: [{ serviceId: 'onlineboutique:loadgenerator' }],
    affectedDownstream: [
      { serviceId: 'onlineboutique:checkoutservice' },
      { serviceId: 'onlineboutique:cartservice' },
    ],
  }

  assert.equal(getFailureAffectedServiceCount(result), 3)
})

test('falls back to impactedServices and excludes the target when neighbors exist', () => {
  const result = {
    impactedServices: [
      { serviceId: 'onlineboutique:frontend', role: 'target' },
      { serviceId: 'onlineboutique:loadgenerator', role: 'caller' },
      { serviceId: 'onlineboutique:checkoutservice', role: 'downstream' },
      { serviceId: 'onlineboutique:checkoutservice', role: 'downstream' },
    ],
  }

  assert.equal(getFailureAffectedServiceCount(result), 2)
  assert.equal(getFailureAffectedCallers(result).length, 1)
  assert.equal(getFailureAffectedDownstream(result).length, 2)
})

test('supports item-wrapped legacy lists', () => {
  const result = {
    affectedCallers: { items: [{ serviceId: 'onlineboutique:frontend' }] },
    affectedDownstream: { items: [{ serviceId: 'onlineboutique:adservice' }] },
  }

  assert.equal(getFailureAffectedServiceCount(result), 2)
})
