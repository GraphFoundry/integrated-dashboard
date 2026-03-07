import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeErrorRateForDisplay } from './normalization'

test('normalizes fractional error rate into percentage points', () => {
  assert.equal(normalizeErrorRateForDisplay(0.01), 1)
  assert.equal(normalizeErrorRateForDisplay(1), 100)
})

test('treats values greater than 1 as percent-form and caps at 100', () => {
  assert.equal(normalizeErrorRateForDisplay(1.2), 1.2)
  assert.equal(normalizeErrorRateForDisplay(98.5), 98.5)
  assert.equal(normalizeErrorRateForDisplay(123.4), 100)
})

test('returns null for missing or non-finite inputs', () => {
  assert.equal(normalizeErrorRateForDisplay(undefined), null)
  assert.equal(normalizeErrorRateForDisplay(null), null)
  assert.equal(normalizeErrorRateForDisplay(Number.NaN), null)
  assert.equal(normalizeErrorRateForDisplay(Number.POSITIVE_INFINITY), null)
})

