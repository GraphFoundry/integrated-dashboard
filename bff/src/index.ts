import fs from 'fs'
import path from 'path'
import express, { Request, Response } from 'express'

// Simple .env loader
const envPath = path.resolve(__dirname, '../.env')

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

loadEnvFile()

import cors from 'cors'
import morgan from 'morgan'
import http from 'http'
import WebSocket, { WebSocketServer } from 'ws'
import { Storage } from './storage'
import { AlertService } from './service'
import { WSMessage, AlertEvent, GraphUpdateData } from './types'
import { SmsService } from './sms.service'

const app = express()
app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(morgan('dev'))

const PORT = process.env.PORT || 3001
const DB_PATH = process.env.DB_PATH || './alerts.db'

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
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
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

// POST /webhook/graph-update - Receive graph updates from analysis-engine
app.post('/webhook/graph-update', (req: Request, res: Response) => {
  try {
    const payload = req.body

    if (payload.event !== 'graph_update' || !payload.data) {
      return res.status(400).json({ success: false, error: 'Invalid graph update payload' })
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

    console.log(
      `[Graph Webhook] Received and broadcast: ${graphData.metricsSnapshot?.services?.length || 0} services, ${graphData.metricsSnapshot?.edges?.length || 0} edges`
    )

    res.status(200).json({ success: true, message: 'Graph update broadcast to clients' })
  } catch (error) {
    respondWithInternalServerError(
      res,
      'Graph webhook error:',
      error,
      { success: false, error: 'Internal server error' }
    )
  }
})

// GET /api/graph/latest - Get the latest cached graph data (REST fallback)
app.get('/api/graph/latest', (req: Request, res: Response) => {
  if (!latestGraphData) {
    return res.status(404).json({ error: 'No graph data available yet' })
  }
  res.json({
    data: latestGraphData,
    receivedAt: graphDataReceivedAt,
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

// GET /api/stats - Connection and system stats
app.get('/api/stats', (req: Request, res: Response) => {
  const overview = alertService.getOverview()
  res.json({
    ws_connections: wss.clients.size,
    ...overview,
  })
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
  storage.close()
  server.close(() => {
    console.log('Server closed')
    process.exit(0)
  })
}

process.on('SIGINT', handleShutdown)
process.on('SIGTERM', handleShutdown)
