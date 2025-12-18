import { useEffect, useRef, useState, useCallback } from 'react'
import type { AlertData } from '@/widgets/alerts/types'
import { listAlerts, getAlert, acknowledgeAlert } from '@/lib/alertsApiClient'

type Filters = {
  severity?: string
  serviceId?: string
  q?: string
}

function toAlertData(raw: any): AlertData {
  // Map a minimal alerts.v1 or websocket event into AlertData used by the UI
  return {
    id: raw.event_id || raw.id || raw.alert_id || String(raw.id),
    severity: (raw.alert?.severity || raw.severity || 'info') as AlertData['severity'],
    title: raw.alert?.type || raw.title || raw.reason || 'Alert',
    message: raw.decision?.reason_codes?.join(', ') || raw.message || raw.summary || 'No details',
    serviceId: raw.service?.name || raw.serviceId || undefined,
    timestamp: raw.sent_at || raw.observed_at || raw.timestamp || new Date().toISOString(),
    acknowledged: !!raw.acknowledged,
  }
}

export function useAlerts({ pageSize = 20 } = {}) {
  const [alerts, setAlerts] = useState<AlertData[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [connected, setConnected] = useState(false)
  const [filters, setFiltersState] = useState<Filters>({})
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectRef = useRef<number | null>(null)

  // Fetch page helper
  const fetchPage = useCallback(
    async (p: number, replace = false) => {
      const params: Record<string, unknown> = {
        limit: pageSize,
        offset: p * pageSize,
        ...filters,
      }
      try {
        const data = await listAlerts(params)
        const items = (Array.isArray(data) ? data : data.alerts || []).map(toAlertData)
        setHasMore(items.length === pageSize)
        setAlerts((prev) => (replace ? items : [...prev, ...items]))
      } catch (err) {
        console.error('listAlerts failed', err)
      }
    },
    [pageSize, filters]
  )

  // Load initial / filters / page change
  useEffect(() => {
    let mounted = true
    setLoading(true)
    ;(async () => {
      try {
        await fetchPage(0, true)
        if (mounted) {
          setPage(0)
        }
      } catch (err) {
        // ignore
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [fetchPage])

  const connect = useCallback(() => {
    if (wsRef.current) return

    const loc = window.location
    const scheme = loc.protocol === 'https:' ? 'wss:' : 'ws:'
    // Try to connect to /ws on same origin
    const wsUrl = `${scheme}//${loc.host}/ws`
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.addEventListener('open', () => {
      setConnected(true)
      console.info('Alerts websocket connected')
    })

    ws.addEventListener('message', (ev) => {
      try {
        const payload = JSON.parse(ev.data)
        const event = payload.event || payload || {}
        const a = toAlertData(event)
        setAlerts((prev) => {
          const deduped = prev.filter((p) => p.id !== a.id)
          return [a, ...deduped].slice(0, 1000) // keep a reasonable cap
        })
      } catch (err) {
        console.error('Failed parsing WS message', err)
      }
    })

    ws.addEventListener('close', () => {
      setConnected(false)
      wsRef.current = null
      reconnectRef.current = window.setTimeout(() => connect(), 2000)
    })

    ws.addEventListener('error', (e) => {
      console.error('Alerts websocket error', e)
      ws.close()
    })
  }, [])

  useEffect(() => {
    connect()
    return () => {
      if (reconnectRef.current) {
        // reconnectRef holds a timer id when using real WS reconnect logic
        clearTimeout(reconnectRef.current)
      }
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [connect])

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      await fetchPage(0, true)
      setPage(0)
    } finally {
      setLoading(false)
    }
  }, [fetchPage])

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    try {
      const next = page + 1
      await fetchPage(next, false)
      setPage(next)
    } finally {
      setLoadingMore(false)
    }
  }, [loadingMore, hasMore, page, fetchPage])

  const setFilters = useCallback(
    (f: Filters) => {
      setFiltersState(f)
      // reset page and reload
      setPage(0)
      fetchPage(0, true)
    },
    [fetchPage]
  )

  const fetchDetail = useCallback(async (eventId: string) => {
    try {
      const data = await getAlert(eventId)
      return data
    } catch (err) {
      console.error('fetchDetail failed', err)
      return null
    }
  }, [])

  const acknowledge = useCallback(
    async (id: string) => {
      const prev = alerts
      setAlerts((prevList) => prevList.map((a) => (a.id === id ? { ...a, acknowledged: true } : a)))
      try {
        await acknowledgeAlert(id)
      } catch (err) {
        console.error('acknowledge failed', err)
        // rollback
        setAlerts(prev)
        throw err
      }
    },
    [alerts]
  )

  return {
    alerts,
    loading,
    loadingMore,
    connected,
    filters,
    hasMore,
    page,
    setFilters,
    loadMore,
    refresh,
    fetchDetail,
    acknowledge,
  }
}
