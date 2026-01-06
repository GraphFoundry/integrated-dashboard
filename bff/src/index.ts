import fs from 'fs'
import path from 'path'
import express, { Request, Response } from 'express'

// Simple .env loader
const envPath = path.resolve(__dirname, '../.env')
if (fs.existsSync(envPath)) {
  try {
    const envConfig = fs.readFileSync(envPath, 'utf8')
    envConfig.split('\n').forEach(line => {
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
  } catch (e) {
    console.warn('Failed to load .env file:', e)
  }
}
import cors from 'cors'
import morgan from 'morgan'
import http from 'http'
import WebSocket, { WebSocketServer } from 'ws'
import { Storage } from './storage'
import { AlertService } from './service'
import { WSMessage, AlertEvent } from './types'
import { SmsService } from './sms.service'

const app = express()
app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(morgan('dev'))

const PORT = process.env.PORT || 3001
const DB_PATH = process.env.DB_PATH || './alerts.db'

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
  } catch (error: any) {
    console.error('Webhook ingestion error:', error)
    res.status(500).json({ success: false, error: 'Internal server error' })
  }
})

// ===== UI REST API =====

// GET /api/overview - Dashboard overview stats
app.get('/api/overview', (req: Request, res: Response) => {
  try {
    const overview = alertService.getOverview()
    res.json(overview)
  } catch (error: any) {
    console.error('Failed to get overview:', error)
    res.status(500).json({ error: 'Failed to fetch overview' })
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
  } catch (error: any) {
    console.error('Failed to list incidents:', error)
    res.status(500).json({ error: 'Failed to fetch incidents' })
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
  } catch (error: any) {
    console.error('Failed to get incident detail:', error)
    res.status(500).json({ error: 'Failed to fetch incident detail' })
  }
})

// GET /api/services - List services with incident rollup
app.get('/api/services', (req: Request, res: Response) => {
  try {
    const services = alertService.getServices()
    res.json({ services, total: services.length })
  } catch (error: any) {
    console.error('Failed to list services:', error)
    res.status(500).json({ error: 'Failed to fetch services' })
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
  } catch (error: any) {
    console.error('Failed to get event:', error)
    res.status(500).json({ error: 'Failed to fetch event' })
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
  } catch (error: any) {
    console.error('Failed to send SMS:', error)
    res.status(500).json({ success: false, error: 'Internal server error' })
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
process.on('SIGINT', () => {
  console.log('\nShutting down gracefully...')
  storage.close()
  server.close(() => {
    console.log('Server closed')
    process.exit(0)
  })
})

process.on('SIGTERM', () => {
  console.log('\nShutting down gracefully...')
  storage.close()
  server.close(() => {
    console.log('Server closed')
    process.exit(0)
  })
})