import assert from 'node:assert/strict'
import test from 'node:test'
import {
  formatLatencyForDisplay,
  formatPercentForDisplay,
  formatRequestRateForDisplay,
  formatSuccessRateFromErrorRateForDisplay,
  normalizeAvailabilityForDisplay,
  normalizeErrorRateForDisplay
} from './normalization'

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

test('normalizes availability using the same rule as error rate', () => {
  assert.equal(normalizeAvailabilityForDisplay(0.99), 99)
  assert.equal(normalizeAvailabilityForDisplay(1), 100)
  assert.equal(normalizeAvailabilityForDisplay(1.2), 1.2)
  assert.equal(normalizeAvailabilityForDisplay(101), 100)
  assert.equal(normalizeAvailabilityForDisplay(undefined), null)
})

test('covers boundary normalization inputs for error rate and availability', () => {
  const boundaryCases: Array<{
    input: number | null | undefined
    expected: number | null
  }> = [
    { input: 0, expected: 0 },
    { input: 0.01, expected: 1 },
    { input: 1, expected: 100 },
    { input: 1.2, expected: 1.2 },
    { input: 100.1, expected: 100 },
    { input: null, expected: null },
    { input: undefined, expected: null }
  ]

  for (const { input, expected } of boundaryCases) {
    assert.equal(normalizeErrorRateForDisplay(input), expected)
    assert.equal(normalizeAvailabilityForDisplay(input), expected)
  }
})

test('formats request-rate values with dashboard rounding and tiny-value handling', () => {
  assert.equal(formatRequestRateForDisplay(12.3456), '12.35')
  assert.equal(formatRequestRateForDisplay(0.00001), '<0.0001')
  assert.equal(formatRequestRateForDisplay(null), 'N/A')
})

test('formats percentages with dashboard suffix and rounding', () => {
  assert.equal(formatPercentForDisplay(99.1234), '99.12%')
  assert.equal(formatPercentForDisplay(99.1234, 1), '99.1%')
  assert.equal(formatPercentForDisplay(undefined), 'N/A')
})

test('formats latency values with dashboard unit conventions', () => {
  assert.equal(formatLatencyForDisplay(0.5), '500μs')
  assert.equal(formatLatencyForDisplay(250.3), '250ms')
  assert.equal(formatLatencyForDisplay(1234.56), '1.23s')
  assert.equal(formatLatencyForDisplay(undefined), 'N/A')
})

test('formats table success-rate values from normalized error-rate', () => {
  assert.equal(formatSuccessRateFromErrorRateForDisplay(2.345), '97.66%')
  assert.equal(formatSuccessRateFromErrorRateForDisplay(undefined), 'N/A')
})
