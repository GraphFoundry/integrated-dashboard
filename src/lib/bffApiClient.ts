// BFF API Client types and functions
const BFF_BASE_URL = import.meta.env.VITE_BFF_URL || 'http://localhost:3001'

export interface AlertEvent {
  schema_version: string
  event_id: string
  dedupe_key: string
  observed_at: string
  sent_at: string
  service: ServiceInfo
  alert: AlertInfo
  decision: Decision
  evidence?: Evidence
  impact?: Impact
  context?: Context
  links?: Links
  meta?: Meta
}

export interface ServiceInfo {
  name: string
  namespace: string
}

export interface AlertInfo {
  type: string
  state: 'firing' | 'resolved'
  severity: 'info' | 'warning' | 'low' | 'medium' | 'high' | 'critical'
}

export interface Impact {
  downstream_count?: number
  [key: string]: any
}

export interface Decision {
  action: string
  auto: boolean
  priority: string
  risk_score?: number
  reason_codes: string[]
}

export interface Evidence {
  http_errors?: number
  latency_p99?: number
  cpu_percent?: number
  memory_percent?: number
  [key: string]: any
}

export interface Context {
  pod_name?: string
  cluster?: string
  environment?: string
  [key: string]: any
}

export interface Links {
  details_ref?: string
  runbook?: string
  dashboard?: string
  [key: string]: string | undefined
}

export interface Meta {
  model_version?: string
  threshold_version?: string
  producer?: string
  trace_id?: string
  [key: string]: any
}

export interface Incident {
  dedupe_key: string
  namespace: string
  service: string
  status: 'OPEN' | 'RESOLVED'
  current_severity: string
  current_priority: string
  current_action: string
  auto: boolean
  risk_score: number
  reason_codes: string[]
  first_observed_at: string
  last_observed_at: string
  latest_event_id: string
  event_count: number
  quality_flags: string[]
}

export interface IncidentDetail extends Incident {
  events: AlertEvent[]
}

export interface ServiceRollup {
  namespace: string
  service: string
  open_incidents: number
  critical_count: number
  high_count: number
  medium_count: number
  low_count: number
  last_alert_at: string
}

export interface Overview {
  total_incidents: number
  open_incidents: number
  resolved_incidents: number
  critical_count: number
  high_count: number
  medium_count: number
  low_count: number
  auto_actions_count: number
  manual_actions_count: number
  services_affected: number
  last_updated_at: string
}

export interface IncidentFilter {
  status?: 'open' | 'resolved' | 'all'
  severity?: string
  namespace?: string
  service?: string
  priority?: string
  auto?: boolean
}

export interface WSMessage {
  type: 'incident_updated' | 'event_received' | 'stats' | 'connection' | 'graph_update'
  data: any
}

/** Graph update data pushed via WebSocket from BFF */
export interface GraphUpdateData {
  metricsSnapshot: {
    timestamp: string
    window: string
    services: Array<{
      name: string
      namespace: string
      rps: number
      errorRate: number
      p95: number
      podCount: number
      availability: number
    }>
    edges: Array<{
      from: string
      to: string
      namespace: string
      rps: number
      errorRate: number
      p95: number
    }>
  }
  services: Array<{
    name: string
    namespace: string
    podCount: number
    availability: number
    placement: {
      nodes: Array<{
        node: string
        resources: {
          cpu: { usagePercent: number; cores: number }
          ram: { usedMB: number; totalMB: number }
        }
        pods: Array<{
          name: string
          ramUsedMB: number
          cpuUsagePercent: number
          uptimeSeconds: number
        }>
      }>
    }
  }>
  infrastructure: {
    nodes: Array<{
      name: string
      resources: {
        cpu: { usagePercent: number; cores: number }
        ram: { usedMB: number; totalMB: number }
      }
    }>
  }
  centrality: {
    scores: Array<{
      service: string
      pagerank: number
      betweenness: number
    }>
  }
}

export interface GraphFreshness {
  stale: boolean
  lastUpdatedSecondsAgo: number | null
  windowMinutes: number
}

export interface GraphLatestDataResponse {
  data: GraphUpdateData | null
  receivedAt: string | null
  hasData: boolean
  freshness?: GraphFreshness
  message?: string
}

// API Client
export const bffApi = {
  // Overview
  async getOverview(): Promise<Overview> {
    const response = await fetch(`${BFF_BASE_URL}/api/overview`)
    if (!response.ok) throw new Error('Failed to fetch overview')
    return response.json()
  },

  // Incidents
  async getIncidents(filter?: IncidentFilter): Promise<{ incidents: Incident[]; total: number }> {
    const params = new URLSearchParams()
    if (filter?.status && filter.status !== 'all') params.append('status', filter.status)
    if (filter?.severity) params.append('severity', filter.severity)
    if (filter?.namespace) params.append('namespace', filter.namespace)
    if (filter?.service) params.append('service', filter.service)
    if (filter?.priority) params.append('priority', filter.priority)
    if (filter?.auto !== undefined) params.append('auto', String(filter.auto))

    const url = `${BFF_BASE_URL}/api/incidents${params.toString() ? `?${params}` : ''}`
    const response = await fetch(url)
    if (!response.ok) throw new Error('Failed to fetch incidents')
    return response.json()
  },

  async getIncidentDetail(
    dedupeKey: string,
    namespace: string,
    service: string
  ): Promise<IncidentDetail> {
    const params = new URLSearchParams({ namespace, service })
    const response = await fetch(
      `${BFF_BASE_URL}/api/incidents/${encodeURIComponent(dedupeKey)}?${params}`
    )
    if (!response.ok) throw new Error('Failed to fetch incident detail')
    return response.json()
  },

  // Services
  async getServices(): Promise<{ services: ServiceRollup[]; total: number }> {
    const response = await fetch(`${BFF_BASE_URL}/api/services`)
    if (!response.ok) throw new Error('Failed to fetch services')
    return response.json()
  },

  // Events
  async getEvent(eventId: string): Promise<AlertEvent> {
    const response = await fetch(`${BFF_BASE_URL}/api/events/${encodeURIComponent(eventId)}`)
    if (!response.ok) throw new Error('Failed to fetch event')
    return response.json()
  },

  // Stats
  async getStats(): Promise<any> {
    const response = await fetch(`${BFF_BASE_URL}/api/stats`)
    if (!response.ok) throw new Error('Failed to fetch stats')
    return response.json()
  },
}

// WebSocket connection helper — returns a cleanup function (auto-reconnects)
export function connectToAlertStream(
  onMessage: (message: WSMessage) => void,
  options?: { reconnectDelayMs?: number }
): () => void {
  const reconnectDelay = options?.reconnectDelayMs ?? 3000
  let ws: WebSocket | null = null
  let closed = false
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let initialConnectTimer: ReturnType<typeof setTimeout> | null = null

  const clearReconnectTimer = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
  }

  const scheduleReconnect = () => {
    if (closed || reconnectTimer) return
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      connect()
    }, reconnectDelay)
  }

  function connect() {
    if (closed) return
    clearReconnectTimer()

    const wsUrl = BFF_BASE_URL.replace('http://', 'ws://').replace('https://', 'wss://')
    const socket = new WebSocket(`${wsUrl}/ws`)
    ws = socket

    socket.onopen = () => {
      if (closed || ws !== socket) return
      console.log('Connected to alert stream')
    }

    socket.onmessage = (event) => {
      if (closed || ws !== socket) return
      try {
        const message = JSON.parse(event.data) as WSMessage
        onMessage(message)
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error)
      }
    }

    socket.onerror = (error) => {
      if (closed || ws !== socket) return
      console.error('WebSocket error:', error)
    }

    socket.onclose = () => {
      if (ws !== socket) return
      ws = null
      if (closed) return
      console.log('Disconnected from alert stream')
      scheduleReconnect()
    }
  }

  initialConnectTimer = setTimeout(() => {
    initialConnectTimer = null
    connect()
  }, 0)

  return () => {
    closed = true
    if (initialConnectTimer) {
      clearTimeout(initialConnectTimer)
      initialConnectTimer = null
    }
    clearReconnectTimer()
    const socket = ws
    ws = null
    if (socket) {
      socket.onmessage = null
      socket.onerror = null
      socket.onclose = null
      if (socket.readyState === WebSocket.CONNECTING) {
        // Avoid "closed before the connection is established" noise on fast unmount/remount.
        socket.onopen = () => socket.close()
      } else {
        socket.onopen = null
      }
      if (socket.readyState === WebSocket.OPEN) {
        socket.close()
      }
    }
  }
}

/**
 * Connect to the BFF WebSocket with auto-reconnect and listen
 * specifically for graph_update events.
 *
 * Returns a cleanup function to close the connection.
 */
export function connectToGraphStream(
  onGraphUpdate: (data: GraphUpdateData) => void,
  options?: { reconnectDelayMs?: number }
): () => void {
  const reconnectDelay = options?.reconnectDelayMs ?? 3000
  let ws: WebSocket | null = null
  let closed = false
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let initialConnectTimer: ReturnType<typeof setTimeout> | null = null

  const clearReconnectTimer = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
  }

  const scheduleReconnect = () => {
    if (closed || reconnectTimer) return
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      connect()
    }, reconnectDelay)
  }

  function connect() {
    if (closed) return
    clearReconnectTimer()

    const wsUrl = BFF_BASE_URL.replace('http://', 'ws://').replace('https://', 'wss://')
    const socket = new WebSocket(`${wsUrl}/ws`)
    ws = socket

    socket.onopen = () => {
      if (closed || ws !== socket) return
      console.log('[GraphStream] Connected to BFF WebSocket')
    }

    socket.onmessage = (event) => {
      if (closed || ws !== socket) return
      try {
        const message = JSON.parse(event.data) as WSMessage
        if (message.type === 'graph_update') {
          onGraphUpdate(message.data as GraphUpdateData)
        }
      } catch (error) {
        console.error('[GraphStream] Failed to parse message:', error)
      }
    }

    socket.onerror = (error) => {
      if (closed || ws !== socket) return
      console.error('[GraphStream] WebSocket error:', error)
    }

    socket.onclose = () => {
      if (ws !== socket) return
      ws = null
      if (closed) return
      console.log('[GraphStream] Disconnected')
      scheduleReconnect()
    }
  }

  initialConnectTimer = setTimeout(() => {
    initialConnectTimer = null
    connect()
  }, 0)

  // Return cleanup function
  return () => {
    closed = true
    if (initialConnectTimer) {
      clearTimeout(initialConnectTimer)
      initialConnectTimer = null
    }
    clearReconnectTimer()
    const socket = ws
    ws = null
    if (socket) {
      socket.onmessage = null
      socket.onerror = null
      socket.onclose = null
      if (socket.readyState === WebSocket.CONNECTING) {
        // Avoid "closed before the connection is established" noise on fast unmount/remount.
        socket.onopen = () => socket.close()
      } else {
        socket.onopen = null
      }
      if (socket.readyState === WebSocket.OPEN) {
        socket.close()
      }
    }
  }
}

/**
 * Fetch the latest cached graph data via REST (fallback if WebSocket is not connected yet)
 */
export async function getLatestGraphData(): Promise<GraphLatestDataResponse | null> {
  try {
    const response = await fetch(`${BFF_BASE_URL}/api/graph/latest`)
    if (!response.ok) return null
    return response.json()
  } catch {
    return null
  }
}
