import assert from 'node:assert/strict'
import test from 'node:test'
import { createReadOnlyHttpClientWrapper } from './http-client-wrapper'
import { createReadOnlySshCommandWrapper } from './ssh-command-wrapper'

test('blocks mutating HTTP methods with explicit error and does not execute request', async () => {
  let executeCount = 0
  const client = createReadOnlyHttpClientWrapper(
    async () => {
      executeCount += 1
      return { ok: true }
    },
    ['https://dashboard.example.com/metrics']
  )

  await assert.rejects(
    client({
      url: 'https://dashboard.example.com/metrics',
      method: 'POST'
    }),
    /Mutating HTTP method "POST" is blocked in read-only mode; only GET requests are permitted/
  )
  assert.equal(executeCount, 0)
})

test('blocks non-allowlisted HTTP methods and does not execute request', async () => {
  let executeCount = 0
  const client = createReadOnlyHttpClientWrapper(
    async () => {
      executeCount += 1
      return { ok: true }
    },
    ['https://dashboard.example.com/metrics']
  )

  await assert.rejects(
    client({
      url: 'https://dashboard.example.com/metrics',
      method: 'HEAD'
    }),
    /HTTP method "HEAD" is not allowed in read-only mode; only GET requests are permitted/
  )
  assert.equal(executeCount, 0)
})

test('blocks mutating SSH restart commands with explicit error and does not execute command', async () => {
  let executeCount = 0
  const execute = createReadOnlySshCommandWrapper(async () => {
    executeCount += 1
    return 'ok'
  })

  await assert.rejects(
    execute('systemctl restart analysis-engine'),
    /Mutating SSH operation "restart" is blocked in read-only mode; restart\/reconfigure commands are not permitted/
  )
  assert.equal(executeCount, 0)
})

test('blocks chained SSH commands and does not execute command', async () => {
  let executeCount = 0
  const execute = createReadOnlySshCommandWrapper(async () => {
    executeCount += 1
    return 'ok'
  })

  await assert.rejects(
    execute('cat /var/log/app.log && uptime'),
    /SSH command contains blocked shell control operators; only single read-only commands are allowed/
  )
  assert.equal(executeCount, 0)
})
