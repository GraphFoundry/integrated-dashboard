import fs from 'fs'
import path from 'path'
import express, { Request, Response } from 'express'
import axios from 'axios'

// Simple .env loader
const envPath = path.resolve(__dirname, '../.env')
const RUNTIME_ENV_FILE = '/etc/runtime-config/runtime.env'

function loadEnvFile(): void {
  if (fs.existsSync(envPath)) {
    try {
      const envConfig = fs.readFileSync(envPath, 'utf8')
      envConfig.split('\n').forEach((line) => {
        const match = line.match(/^([^=]+)=(.*)$/)
        if (match) {
          const key = match[1].trim()
          const value = match[2].trim().replace(/^['"](.*)['"]$/, '$1')
          if (!process.env[key]) {
            process.env[key] = value
          }
        }
      })
      console.log('Loaded environment variables from .env')
    } catch (error) {
      console.warn('Failed to load .env file:', error)
    }
  }
}

function loadRuntimeEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return
  const content = fs.readFileSync(filePath, 'utf8')
  content.split('\n').forEach((line) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) return
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx < 0) return
    const key = trimmed.substring(0, eqIdx).trim()
    const value = trimmed.substring(eqIdx + 1).trim()
    process.env[key] = value
  })
}

loadEnvFile()
loadRuntimeEnvFile(RUNTIME_ENV_FILE)

import cors from 'cors'
import morgan from 'morgan'
import { createProxyMiddleware } from 'http-proxy-middleware'
import http from 'http'
import WebSocket, { WebSocketServer } from 'ws'
import { Storage } from './storage'
import { AlertService } from './service'
import { WSMessage, AlertEvent, GraphUpdateData } from './types'
import { createSimulationReplayHandler, createSimulationRunHandler } from './simulations-run-route'
import { SmsService } from './sms.service'
import { fetchPodsByService } from './k8s'
import { WebhookDedupeStore } from './webhookDedupeStore'
import {
  getPayloadLogicalTimestampMs,
  hashBody,
  isReplayAllowed,
  verifyTimestampedSignature,
} from './webhookSecurity'

interface RawBodyRequest extends Request {
  rawBody?: Buffer
}

interface PredictiveCurrentActionPayload {
  anomalyActive: boolean
  healthScore: number
  primaryBottleneck: Record<string, unknown> | null
  timeToImpactSec: number | null
  recommendation: Record<string, unknown> | null
  evidence: {
    timestamp: string
    [key: string]: unknown
  }
}

const app = express()
app.use(cors())
app.use(morgan('dev'))

// ── Downstream microservice proxies ─────────────────────────────────────────
// Mounted BEFORE express.json() so request bodies stream through unmodified.
const PREDICTIVE_API_BASE_URL = process.env.PREDICTIVE_API_BASE_URL || 'http://localhost:7000'
const SCHEDULER_API_BASE_URL = process.env.SCHEDULER_API_BASE_URL || 'http://localhost:9020'
const SIMULATION_API_BASE_URL = process.env.SIMULATION_API_BASE_URL || PREDICTIVE_API_BASE_URL
const SIMULATION_RUN_PATH = process.env.SIMULATION_RUN_PATH || '/simulations/run'
const PREDICTIVE_CURRENT_ACTION_ROUTES = [
  '/api/predictive/actions/current',
  '/api/predictive/predictive/actions/current',
]

function buildPredictiveCurrentActionUrl(baseUrl: string): string {
  const normalized = baseUrl.replace(/\/+$/, '')
  return normalized.endsWith('/predictive')
    ? `${normalized}/actions/current`
    : `${normalized}/predictive/actions/current`
}

function defaultPredictiveCurrentActionPayload(): PredictiveCurrentActionPayload {
  return {
    anomalyActive: false,
    healthScore: 100,
    primaryBottleneck: null,
    timeToImpactSec: null,
    recommendation: null,
    evidence: {
      timestamp: new Date().toISOString(),
    },
  }
}

// Dedicated handler avoids path-prefix duplication and shields UI from upstream 503 bursts.
app.get(PREDICTIVE_CURRENT_ACTION_ROUTES, async (req: Request, res: Response) => {
  const requestId = req.header('X-Request-Id')

  try {
    const response = await axios.get<PredictiveCurrentActionPayload>(
      buildPredictiveCurrentActionUrl(PREDICTIVE_API_BASE_URL),
      {
        timeout: 3000,
        headers: requestId ? { 'X-Request-Id': requestId } : undefined,
      }
    )
    return res.status(200).json(response.data)
  } catch (error) {
    console.warn('[BFF:predictive-current-action] upstream unavailable, serving safe fallback')
    if (axios.isAxiosError(error)) {
      console.warn('[BFF:predictive-current-action] details:', error.message)
    }
    return res.status(200).json(defaultPredictiveCurrentActionPayload())
  }
})

app.use(
  '/api/predictive',
  createProxyMiddleware({
    target: PREDICTIVE_API_BASE_URL,
    changeOrigin: true,
    pathRewrite: { '^/api/predictive': '' },
    on: {
      proxyReq: (proxyReq, req) => {
        // Forward X-Request-Id if present
        const rid = req.headers['x-request-id']
        if (rid) proxyReq.setHeader('X-Request-Id', rid as string)
      },
      error: (err, _req, res) => {
        console.error('[Proxy:predictive] error:', err.message)
        if ('writeHead' in res && typeof res.writeHead === 'function') {
          ;(res as import('http').ServerResponse).writeHead(502, { 'Content-Type': 'application/json' })
          ;(res as import('http').ServerResponse).end(JSON.stringify({ error: 'Predictive API unavailable' }))
        }
      },
    },
  })
)

app.use(
  '/api/scheduler',
  createProxyMiddleware({
    target: SCHEDULER_API_BASE_URL,
    changeOrigin: true,
    pathRewrite: { '^/api/scheduler': '' },
    on: {
      proxyReq: (proxyReq, req) => {
        const rid = req.headers['x-request-id']
        if (rid) proxyReq.setHeader('X-Request-Id', rid as string)
      },
      error: (err, _req, res) => {
        console.error('[Proxy:scheduler] error:', err.message)
        if ('writeHead' in res && typeof res.writeHead === 'function') {
          ;(res as import('http').ServerResponse).writeHead(502, { 'Content-Type': 'application/json' })
          ;(res as import('http').ServerResponse).end(JSON.stringify({ error: 'Scheduler API unavailable' }))
        }
      },
    },
  })
)

app.use(
  express.json({
    limit: '10mb',
    verify: (req, _res, buf) => {
      ;(req as RawBodyRequest).rawBody = Buffer.from(buf)
    },
  })
)

// Dedicated simulation passthrough preserves upstream status/body without adding synthetic fields.
app.post(
  '/api/simulations/run',
  createSimulationRunHandler({
    simulationApiBaseUrl: SIMULATION_API_BASE_URL,
    simulationRunPath: SIMULATION_RUN_PATH,
  })
)

// Replay endpoint preserves caller snapshot identifiers for deterministic re-runs.
app.post(
  '/api/simulations/replay',
  createSimulationReplayHandler({
    simulationApiBaseUrl: SIMULATION_API_BASE_URL,
    simulationRunPath: SIMULATION_RUN_PATH,
  })
)

const PORT = process.env.PORT || 3001
const DB_PATH = process.env.DB_PATH || './alerts.db'

function parseIntEnv(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed)) return fallback
  return parsed
}

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || ''
let WEBHOOK_REPLAY_WINDOW_SEC = parseIntEnv('WEBHOOK_REPLAY_WINDOW_SEC', 300)
let WEBHOOK_DEDUPE_WINDOW_SEC = parseIntEnv('WEBHOOK_DEDUPE_WINDOW_SEC', 86400)
const WEBHOOK_DEDUPE_FILE =
  process.env.WEBHOOK_DEDUPE_FILE || path.resolve(__dirname, '../data/webhook-dedupe.json')
let WEBHOOK_RATE_LIMIT_WINDOW_MS = parseIntEnv('WEBHOOK_RATE_LIMIT_WINDOW_MS', 60000)
let WEBHOOK_RATE_LIMIT_MAX = parseIntEnv('WEBHOOK_RATE_LIMIT_MAX', 120)
const GRAPH_HEALTH_URL = process.env.GRAPH_HEALTH_URL || 'http://localhost:3000/graph/health'
const GRAPH_STALE_WINDOW_MINUTES = 5

interface GraphFreshness {
  stale: boolean
  lastUpdatedSecondsAgo: number | null
  windowMinutes: number
}

function respondWithInternalServerError(
  res: Response,
  logPrefix: string,
  error: unknown,
  body: Record<string, unknown>
): void {
  console.error(logPrefix, error)
  res.status(500).json(body)
}

// Initialize storage and service
const storage = new Storage(DB_PATH)
const server = http.createServer(app)
const wss = new WebSocketServer({ server, path: '/ws' })
const smsService = new SmsService()

// Broadcast function for WebSocket
function broadcast(message: WSMessage) {
  const payload = JSON.stringify(message)
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload)
    }
  })
}

const alertService = new AlertService(storage, broadcast, smsService)
const graphWebhookDedupe = new WebhookDedupeStore(WEBHOOK_DEDUPE_FILE, WEBHOOK_DEDUPE_WINDOW_SEC)

if (!WEBHOOK_SECRET) {
  console.warn('[Graph Webhook] WEBHOOK_SECRET is not set. /webhook/graph-update will reject requests.')
}

const graphWebhookStats = {
  receivedTotal: 0,
  acceptedTotal: 0,
  duplicateTotal: 0,
  outOfOrderTotal: 0,
  failedTotal: 0,
  signatureRejectedTotal: 0,
  replayRejectedTotal: 0,
  rateLimitedTotal: 0,
  lastEventId: null as string | null,
}

let webhookRateWindowStart = Date.now()
let webhookRateWindowCount = 0

function allowGraphWebhookRequest(): boolean {
  if (WEBHOOK_RATE_LIMIT_WINDOW_MS <= 0 || WEBHOOK_RATE_LIMIT_MAX <= 0) return true
  const now = Date.now()
  if (now-webhookRateWindowStart >= WEBHOOK_RATE_LIMIT_WINDOW_MS) {
    webhookRateWindowStart = now
    webhookRateWindowCount = 0
  }
  if (webhookRateWindowCount >= WEBHOOK_RATE_LIMIT_MAX) {
    return false
  }
  webhookRateWindowCount += 1
  return true
}

// WebSocket connection handler
wss.on('connection', (ws: WebSocket) => {
  console.log('Client connected to WebSocket')

  // Send connection confirmation
  ws.send(
    JSON.stringify({
      type: 'connection',
      data: { status: 'connected', timestamp: new Date().toISOString() },
    })
  )

  ws.on('close', () => {
    console.log('Client disconnected from WebSocket')
  })

  ws.on('error', (error) => {
    console.error('WebSocket error:', error)
  })
})

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    graphWebhook: {
      signatureEnforced: Boolean(WEBHOOK_SECRET),
      replayWindowSec: WEBHOOK_REPLAY_WINDOW_SEC,
      dedupeEntries: graphWebhookDedupe.size(),
    },
  })
})

// ===== WEBHOOK INGESTION =====
// POST /ingest/webhook - Receive full alert events from graph-alert-service
app.post('/ingest/webhook', (req: Request, res: Response) => {
  try {
    const event = req.body as AlertEvent

    const result = alertService.ingestAlertEvent(event)

    if (result.success) {
      res.status(200).json({ success: true, message: result.message })
    } else {
      res.status(400).json({ success: false, error: result.message })
    }
  } catch (error) {
    respondWithInternalServerError(
      res,
      'Webhook ingestion error:',
      error,
      { success: false, error: 'Internal server error' }
    )
  }
})

// ===== UI REST API =====

// Store latest graph data in memory for REST fallback
let latestGraphData: GraphUpdateData | null = null
let graphDataReceivedAt: string | null = null
let latestGraphLogicalTimestampMs: number | null = null

function computeFallbackFreshness(data: GraphUpdateData | null): GraphFreshness {
  const windowMinutes = GRAPH_STALE_WINDOW_MINUTES
  if (!data?.metricsSnapshot?.timestamp) {
    return { stale: true, lastUpdatedSecondsAgo: null, windowMinutes }
  }

  const tsMs = Date.parse(data.metricsSnapshot.timestamp)
  if (!Number.isFinite(tsMs)) {
    return { stale: true, lastUpdatedSecondsAgo: null, windowMinutes }
  }

  const ageSeconds = Math.max(0, Math.floor((Date.now() - tsMs) / 1000))
  return {
    stale: ageSeconds > windowMinutes * 60,
    lastUpdatedSecondsAgo: ageSeconds,
    windowMinutes,
  }
}

async function resolveGraphFreshness(data: GraphUpdateData | null): Promise<GraphFreshness> {
  try {
    const response = await axios.get(GRAPH_HEALTH_URL, { timeout: 1500 })
    const body = response?.data as Partial<GraphFreshness> | undefined
    if (typeof body?.stale === 'boolean') {
      const lastUpdatedSecondsAgo =
        typeof body.lastUpdatedSecondsAgo === 'number' ? body.lastUpdatedSecondsAgo : null
      const windowMinutes =
        typeof body.windowMinutes === 'number' ? body.windowMinutes : GRAPH_STALE_WINDOW_MINUTES
      return {
        stale: body.stale,
        lastUpdatedSecondsAgo,
        windowMinutes,
      }
    }
  } catch {
    // Fall back to cached timestamp if graph health is temporarily unavailable.
  }

  return computeFallbackFreshness(data)
}

// POST /webhook/graph-update - Receive graph updates from analysis-engine
app.post('/webhook/graph-update', (req: Request, res: Response) => {
  try {
    graphWebhookStats.receivedTotal += 1

    if (!allowGraphWebhookRequest()) {
      graphWebhookStats.rateLimitedTotal += 1
      graphWebhookStats.failedTotal += 1
      return res.status(429).json({ success: false, error: 'Webhook rate limit exceeded' })
    }

    if (!WEBHOOK_SECRET) {
      graphWebhookStats.failedTotal += 1
      return res.status(503).json({ success: false, error: 'Webhook secret is not configured' })
    }

    const rawRequest = req as RawBodyRequest
    const rawBody = rawRequest.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}))
    const timestampHeader = req.header('X-Webhook-Timestamp') || ''
    const signatureHeader = req.header('X-Webhook-Signature') || ''

    if (!timestampHeader) {
      graphWebhookStats.signatureRejectedTotal += 1
      graphWebhookStats.failedTotal += 1
      return res.status(400).json({ success: false, error: 'Missing X-Webhook-Timestamp' })
    }

    const replayCheck = isReplayAllowed(timestampHeader, WEBHOOK_REPLAY_WINDOW_SEC)
    if (!replayCheck.ok) {
      graphWebhookStats.replayRejectedTotal += 1
      graphWebhookStats.failedTotal += 1
      const statusCode = replayCheck.reason === 'invalid timestamp format' ? 400 : 401
      return res.status(statusCode).json({ success: false, error: replayCheck.reason })
    }

    if (!verifyTimestampedSignature(rawBody, signatureHeader, timestampHeader, WEBHOOK_SECRET)) {
      graphWebhookStats.signatureRejectedTotal += 1
      graphWebhookStats.failedTotal += 1
      return res.status(401).json({ success: false, error: 'Invalid webhook signature' })
    }

    const payload = req.body as Record<string, unknown>
    if (payload.event !== 'graph_update' || !payload.data || typeof payload.data !== 'object') {
      graphWebhookStats.failedTotal += 1
      return res.status(400).json({ success: false, error: 'Invalid graph update payload' })
    }

    const eventIdFromPayload = typeof payload.event_id === 'string' ? payload.event_id : ''
    const eventIdFromHeader = req.header('X-Webhook-Id') || ''
    const eventId = eventIdFromPayload || eventIdFromHeader || `legacy_${hashBody(rawBody).slice(0, 20)}`
    const correlationFromPayload =
      typeof payload.correlation_id === 'string' ? payload.correlation_id : ''
    const correlationId = correlationFromPayload || req.header('X-Correlation-Id') || eventId

    const dedupe = graphWebhookDedupe.register(eventId, Date.now())
    if (dedupe.duplicate) {
      graphWebhookStats.duplicateTotal += 1
      return res
        .status(200)
        .json({ success: true, duplicate: true, eventId, message: 'Duplicate webhook ignored' })
    }

    const logicalTimestampMs = getPayloadLogicalTimestampMs(payload)
    if (
      logicalTimestampMs !== null &&
      latestGraphLogicalTimestampMs !== null &&
      logicalTimestampMs < latestGraphLogicalTimestampMs
    ) {
      graphWebhookStats.outOfOrderTotal += 1
      return res.status(200).json({
        success: true,
        ignored: true,
        eventId,
        message: 'Out-of-order webhook ignored',
      })
    }

    if (logicalTimestampMs !== null) {
      latestGraphLogicalTimestampMs = logicalTimestampMs
    }
    const graphData = payload.data as GraphUpdateData

    // Cache the latest data for REST fallback
    latestGraphData = graphData
    graphDataReceivedAt = new Date().toISOString()

    // Broadcast to all connected WebSocket clients
    const wsMessage: WSMessage = {
      type: 'graph_update',
      data: graphData,
    }
    broadcast(wsMessage)
    graphWebhookStats.acceptedTotal += 1
    graphWebhookStats.lastEventId = eventId

    console.log(
      `[Graph Webhook] Accepted eventId=${eventId} correlationId=${correlationId}: ${graphData.metricsSnapshot?.services?.length || 0} services, ${graphData.metricsSnapshot?.edges?.length || 0} edges`
    )

    res
      .status(200)
      .json({ success: true, eventId, correlationId, message: 'Graph update broadcast to clients' })
  } catch (error) {
    graphWebhookStats.failedTotal += 1
    respondWithInternalServerError(
      res,
      'Graph webhook error:',
      error,
      { success: false, error: 'Internal server error' }
    )
  }
})

// GET /api/graph/latest - Get the latest cached graph data (REST fallback)
app.get('/api/graph/latest', async (req: Request, res: Response) => {
  const freshness = await resolveGraphFreshness(latestGraphData)
  if (!latestGraphData) {
    // Keep startup polling quiet: return an empty payload until first webhook arrives.
    return res.status(200).json({
      data: null,
      receivedAt: graphDataReceivedAt,
      hasData: false,
      freshness,
      message: 'No graph data available yet',
    })
  }
  res.status(200).json({
    data: latestGraphData,
    receivedAt: graphDataReceivedAt,
    hasData: true,
    freshness,
  })
})

// GET /api/overview - Dashboard overview stats
app.get('/api/overview', (req: Request, res: Response) => {
  try {
    const overview = alertService.getOverview()
    res.json(overview)
  } catch (error) {
    respondWithInternalServerError(
      res,
      'Failed to get overview:',
      error,
      { error: 'Failed to fetch overview' }
    )
  }
})

// GET /api/incidents - List incidents with optional filters
app.get('/api/incidents', (req: Request, res: Response) => {
  try {
    const filter = {
      status: req.query.status as string | undefined,
      severity: req.query.severity as string | undefined,
      namespace: req.query.namespace as string | undefined,
      service: req.query.service as string | undefined,
      priority: req.query.priority as string | undefined,
      auto: req.query.auto ? req.query.auto === 'true' : undefined,
    }

    const incidents = alertService.listIncidents(filter)
    res.json({ incidents, total: incidents.length })
  } catch (error) {
    respondWithInternalServerError(
      res,
      'Failed to list incidents:',
      error,
      { error: 'Failed to fetch incidents' }
    )
  }
})

// GET /api/incidents/:dedupeKey - Get incident detail with timeline
app.get('/api/incidents/:dedupeKey', (req: Request, res: Response) => {
  try {
    const { dedupeKey } = req.params
    const namespace = req.query.namespace as string || 'default'
    const service = req.query.service as string

    if (!service) {
      return res.status(400).json({ error: 'service query parameter is required' })
    }

    const incident = alertService.getIncidentDetail(dedupeKey, namespace, service)

    if (!incident) {
      return res.status(404).json({ error: 'Incident not found' })
    }

    res.json(incident)
  } catch (error) {
    respondWithInternalServerError(
      res,
      'Failed to get incident detail:',
      error,
      { error: 'Failed to fetch incident detail' }
    )
  }
})

// GET /api/services - List services with incident rollup
app.get('/api/services', (req: Request, res: Response) => {
  try {
    const services = alertService.getServices()
    res.json({ services, total: services.length })
  } catch (error) {
    respondWithInternalServerError(
      res,
      'Failed to list services:',
      error,
      { error: 'Failed to fetch services' }
    )
  }
})

// GET /api/events/:eventId - Get specific event details
app.get('/api/events/:eventId', (req: Request, res: Response) => {
  try {
    const { eventId } = req.params
    const event = alertService.getEvent(eventId)

    if (!event) {
      return res.status(404).json({ error: 'Event not found' })
    }

    res.json(event)
  } catch (error) {
    respondWithInternalServerError(
      res,
      'Failed to get event:',
      error,
      { error: 'Failed to fetch event' }
    )
  }
})

// POST /api/notifications/sms - Send SMS notification
app.post('/api/notifications/sms', async (req: Request, res: Response) => {
  try {
    const { recipient, message, shouldSummarize } = req.body

    if (!recipient || !message) {
      return res.status(400).json({ success: false, error: 'Recipient and message are required' })
    }

    const result = await smsService.sendSms({
      recipient,
      message,
      shouldSummarize: shouldSummarize ?? true
    })

    if (result.success) {
      res.json({ success: true, data: result.data })
    } else {
      res.status(502).json({ success: false, error: result.error })
    }
  } catch (error) {
    respondWithInternalServerError(
      res,
      'Failed to send SMS:',
      error,
      { success: false, error: 'Internal server error' }
    )
  }
})

// GET /api/k8s/pods - Pods grouped by service name (direct K8s API)
app.get('/api/k8s/pods', async (req: Request, res: Response) => {
  try {
    const namespace = req.query.namespace as string | undefined
    const podsByService = await fetchPodsByService(namespace)
    res.json({ podsByService })
  } catch (error) {
    console.error('[BFF:k8s/pods] Failed to fetch pods:', error instanceof Error ? error.message : error)
    res.status(502).json({ error: 'Failed to fetch pods from Kubernetes API', podsByService: {} })
  }
})

// GET /api/stats - Connection and system stats
app.get('/api/stats', (req: Request, res: Response) => {
  const overview = alertService.getOverview()
  res.json({
    ws_connections: wss.clients.size,
    graph_webhook: {
      ...graphWebhookStats,
      dedupeEntries: graphWebhookDedupe.size(),
      replayWindowSec: WEBHOOK_REPLAY_WINDOW_SEC,
      rateLimitWindowMs: WEBHOOK_RATE_LIMIT_WINDOW_MS,
      rateLimitMax: WEBHOOK_RATE_LIMIT_MAX,
      signatureEnforced: Boolean(WEBHOOK_SECRET),
    },
    ...overview,
  })
})

// ── Config management endpoints ─────────────────────────────────────────────
import {
  getAllConfigs,
  getServiceConfig,
  updateConfigKey as updateConfigKeyFn,
  applyConfig,
} from './configManager'

app.get('/api/configs', async (_req: Request, res: Response) => {
  try {
    const configs = await getAllConfigs()
    res.json(configs)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[Config] Failed to get configs:', message)
    res.status(500).json({ error: message })
  }
})

app.get('/api/configs/:serviceId', async (req: Request, res: Response) => {
  try {
    const config = await getServiceConfig(req.params.serviceId)
    if (!config) {
      res.status(404).json({ error: 'Service not found' })
      return
    }
    res.json(config)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[Config] Failed to get config for ${req.params.serviceId}:`, message)
    res.status(500).json({ error: message })
  }
})

app.put('/api/configs/:serviceId/:key', async (req: Request, res: Response) => {
  try {
    const { serviceId, key } = req.params
    const { value } = req.body as { value: string }
    if (value === undefined || value === null) {
      res.status(400).json({ error: 'Missing "value" in request body' })
      return
    }
    const result = await updateConfigKeyFn(serviceId, key, String(value))
    if (!result.updated) {
      res.status(400).json({ error: result.error })
      return
    }
    res.json({ updated: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[Config] Failed to update key:`, message)
    res.status(500).json({ error: message })
  }
})

app.post('/api/configs/:serviceId/apply', async (req: Request, res: Response) => {
  try {
    const { serviceId } = req.params
    const updates = req.body?.updates as Record<string, string> | undefined
    const result = await applyConfig(serviceId, updates)
    if (!result.applied) {
      res.status(400).json({ error: result.error })
      return
    }
    res.json(result)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[Config] Failed to apply config for ${req.params.serviceId}:`, message)
    res.status(500).json({ error: message })
  }
})

app.post('/admin/reload-config', (req: Request, res: Response) => {
  try {
    loadRuntimeEnvFile(RUNTIME_ENV_FILE)
    // Apply env overrides from request body (takes precedence over file)
    const envOverrides = req.body?.env as Record<string, string> | undefined
    if (envOverrides && typeof envOverrides === 'object') {
      for (const [key, value] of Object.entries(envOverrides)) {
        process.env[key] = String(value)
      }
    }
    WEBHOOK_REPLAY_WINDOW_SEC = parseIntEnv('WEBHOOK_REPLAY_WINDOW_SEC', 300)
    WEBHOOK_DEDUPE_WINDOW_SEC = parseIntEnv('WEBHOOK_DEDUPE_WINDOW_SEC', 86400)
    WEBHOOK_RATE_LIMIT_WINDOW_MS = parseIntEnv('WEBHOOK_RATE_LIMIT_WINDOW_MS', 60000)
    WEBHOOK_RATE_LIMIT_MAX = parseIntEnv('WEBHOOK_RATE_LIMIT_MAX', 120)
    console.log('[CONFIG] Runtime config reloaded')
    res.json({ status: 'reloaded' })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[CONFIG] Reload failed:', message)
    res.status(500).json({ status: 'error', message })
  }
})

// Start server
server.listen(PORT, () => {
  console.log(`Dashboard BFF server running on http://localhost:${PORT}`)
  console.log(`WebSocket endpoint: ws://localhost:${PORT}/ws`)
  console.log(`Webhook endpoint: http://localhost:${PORT}/ingest/webhook`)
})

// Graceful shutdown
function handleShutdown(): void {
  console.log('\nShutting down gracefully...')
  graphWebhookDedupe.close()
  storage.close()
  server.close(() => {
    console.log('Server closed')
    process.exit(0)
  })
}

process.on('SIGINT', handleShutdown)
process.on('SIGTERM', handleShutdown)
