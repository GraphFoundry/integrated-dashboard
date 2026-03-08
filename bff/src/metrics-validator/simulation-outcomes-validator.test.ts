import assert from 'node:assert/strict'
import test from 'node:test'
import { buildSimulationSevenDayWindowUtc } from './simulation-outcomes-validator'

test('anchors simulation seven-day window to captured page-load timestamp in UTC', () => {
  const result = buildSimulationSevenDayWindowUtc('2026-03-08T10:20:30.000Z')

  assert.equal(result.anchorTimestampUtc, '2026-03-08T10:20:30.000Z')
  assert.equal(result.windowEndUtc, '2026-03-08T10:20:30.000Z')
  assert.equal(result.windowStartUtc, '2026-03-01T10:20:30.000Z')
  assert.equal(result.timezone, 'UTC')
})

test('normalizes offset timestamps to UTC when deriving simulation seven-day window', () => {
  const result = buildSimulationSevenDayWindowUtc('2026-03-08T15:50:30+05:30')

  assert.equal(result.anchorTimestampUtc, '2026-03-08T10:20:30.000Z')
  assert.equal(result.windowEndUtc, '2026-03-08T10:20:30.000Z')
  assert.equal(result.windowStartUtc, '2026-03-01T10:20:30.000Z')
  assert.equal(result.timezone, 'UTC')
})

test('throws when page-load timestamp is invalid for simulation window anchoring', () => {
  assert.throws(
    () => buildSimulationSevenDayWindowUtc('invalid'),
    /Invalid page-load timestamp/
  )
})
