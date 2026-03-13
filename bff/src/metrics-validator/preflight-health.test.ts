import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assertAnalysisEnginePollWorkerActive,
  assertAllPreflightServiceChecksHealthy,
  buildReportMetadata,
  buildDefaultServiceHealthTargets,
  runAnalysisEnginePollWorkerActivityCheck,
  runPipelinePreflightHealthChecks
} from './cli'

test('builds default health endpoints for required services from vm host', () => {
  const targets = buildDefaultServiceHealthTargets('vm.example.internal')

  assert.deepEqual(
    targets.map((target) => target.service),
    ['prometheus', 'sge', 'analysisEngine', 'influxdb', 'bff']
  )
  assert.deepEqual(
    targets.map((target) => target.endpoint),
    [
      'http://vm.example.internal:9090/-/healthy',
      'http://vm.example.internal:3000/graph/health',
      'http://vm.example.internal:7000/health',
      'http://vm.example.internal:8086/health',
      'http://vm.example.internal:3001/health'
    ]
  )
})

test('runs read-only GET checks for all required services and reports healthy results', async () => {
  const observedRequests: Array<{ url: string; method?: string }> = []

  const checks = await runPipelinePreflightHealthChecks(
    'vm.example.internal',
    async (request) => {
      observedRequests.push({ url: request.url, method: request.method })
      return { status: 200, statusText: 'OK' }
    },
    50
  )

  assert.equal(checks.length, 5)
  assert.equal(observedRequests.length, 5)
  assert.ok(observedRequests.every((request) => request.method === 'GET'))
  assert.ok(checks.every((check) => check.healthy))
  assert.doesNotThrow(() => assertAllPreflightServiceChecksHealthy(checks))
})

test('marks unhealthy services and raises aggregate preflight failure', async () => {
  const checks = await runPipelinePreflightHealthChecks(
    'vm.example.internal',
    async (request) => {
      if (request.url === 'http://vm.example.internal:8086/health') {
        return { status: 503, statusText: 'Service Unavailable' }
      }
      return { status: 200, statusText: 'OK' }
    },
    50
  )

  const influxCheck = checks.find((check) => check.service === 'influxdb')
  assert.ok(influxCheck)
  assert.equal(influxCheck.healthy, false)
  assert.match(influxCheck.detail, /HTTP 503 Service Unavailable/)

  assert.throws(
    () => assertAllPreflightServiceChecksHealthy(checks),
    /Preflight health checks failed for 1 service\(s\): influxdb/
  )
})

test('confirms analysis-engine poll worker activity from health telemetry evidence', async () => {
  const evidence = await runAnalysisEnginePollWorkerActivityCheck(
    'vm.example.internal',
    async () => ({
      status: 200,
      statusText: 'OK',
      json: async () => ({
        telemetry: {
          workerEnabled: true,
          pollIntervalMs: 30000,
          latestSuccessfulPollWriteTimestampUtc: '2026-03-07T10:30:00Z'
        }
      })
    }),
    50
  )

  assert.equal(evidence.active, true)
  assert.equal(evidence.evidence, 'health')
  assert.equal(evidence.pollIntervalMs, 30000)
  assert.equal(evidence.pollIntervalSource, 'telemetry.pollIntervalMs')
  assert.equal(
    evidence.latestSuccessfulPollWriteTimestampUtc,
    '2026-03-07T10:30:00.000Z'
  )
  assert.equal(
    evidence.latestSuccessfulPollWriteTimestampSource,
    'telemetry.latestSuccessfulPollWriteTimestampUtc'
  )
  const reportMetadata = buildReportMetadata(evidence)
  assert.equal(reportMetadata.analysisEnginePollIntervalMs, 30000)
  assert.equal(
    reportMetadata.analysisEnginePollIntervalSource,
    'telemetry.pollIntervalMs'
  )
  assert.equal(
    reportMetadata.analysisEngineLatestSuccessfulPollWriteTimestampUtc,
    '2026-03-07T10:30:00.000Z'
  )
  assert.equal(
    reportMetadata.analysisEngineLatestSuccessfulPollWriteTimestampSource,
    'telemetry.latestSuccessfulPollWriteTimestampUtc'
  )
  assert.doesNotThrow(() => assertAnalysisEnginePollWorkerActive(evidence))
})

test('fails when analysis-engine health evidence does not confirm workerEnabled', async () => {
  const evidence = await runAnalysisEnginePollWorkerActivityCheck(
    'vm.example.internal',
    async () => ({
      status: 200,
      statusText: 'OK',
      json: async () => ({
        telemetry: {
          workerEnabled: false
        }
      })
    }),
    50
  )

  assert.equal(evidence.active, false)
  assert.equal(evidence.pollIntervalMs, null)
  assert.equal(evidence.pollIntervalSource, null)
  assert.equal(evidence.latestSuccessfulPollWriteTimestampUtc, null)
  assert.equal(evidence.latestSuccessfulPollWriteTimestampSource, null)
  assert.match(evidence.detail, /workerEnabled=false/)
  assert.throws(
    () => assertAnalysisEnginePollWorkerActive(evidence),
    /Analysis Engine poll worker activity check failed/
  )
})

test('extracts poll interval and latest poll write timestamp from seconds fields', async () => {
  const evidence = await runAnalysisEnginePollWorkerActivityCheck(
    'vm.example.internal',
    async () => ({
      status: 200,
      statusText: 'OK',
      json: async () => ({
        telemetry: {
          workerEnabled: true,
          pollIntervalSeconds: 45,
          latestSuccessfulPollWriteTimestampSeconds: 1704067200
        }
      })
    }),
    50
  )

  assert.equal(evidence.active, true)
  assert.equal(evidence.pollIntervalMs, 45000)
  assert.equal(evidence.pollIntervalSource, 'telemetry.pollIntervalSeconds')
  assert.equal(
    evidence.latestSuccessfulPollWriteTimestampUtc,
    '2024-01-01T00:00:00.000Z'
  )
  assert.equal(
    evidence.latestSuccessfulPollWriteTimestampSource,
    'telemetry.latestSuccessfulPollWriteTimestampSeconds'
  )

  const reportMetadata = buildReportMetadata(evidence)
  assert.equal(reportMetadata.analysisEnginePollIntervalMs, 45000)
  assert.equal(
    reportMetadata.analysisEnginePollIntervalSource,
    'telemetry.pollIntervalSeconds'
  )
  assert.equal(
    reportMetadata.analysisEngineLatestSuccessfulPollWriteTimestampUtc,
    '2024-01-01T00:00:00.000Z'
  )
  assert.equal(
    reportMetadata.analysisEngineLatestSuccessfulPollWriteTimestampSource,
    'telemetry.latestSuccessfulPollWriteTimestampSeconds'
  )
})
