import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import {
  connectToGraphStream,
  getLatestGraphData,
  type GraphUpdateData,
} from '@/lib/bffApiClient'
import { getDependencyGraphSnapshot, getServicesWithPlacement, getNodes } from '@/lib/api'
import type { GraphSnapshot, GraphRiskLevel, ServiceWithPlacement, NodeWithResources } from '@/lib/types'

const enableDirectFallback = import.meta.env.VITE_ENABLE_GRAPH_DIRECT_FALLBACK === 'true'

/**
 * React hook that connects to the BFF WebSocket for real-time graph updates.
 *
 * On mount, it fetches the latest data via REST (from both BFF cache and
 * analysis-engine as fallback), then listens for WebSocket pushes.
 *
 * This replaces the previous 5-second polling pattern used by
 * IncidentExplorer and NodeResourceGraph.
 */
export function useGraphStream() {
  const [graphData, setGraphData] = useState<GraphUpdateData | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  const isFirstUpdate = useRef(true)

  // Handler for incoming WebSocket graph updates
  const handleGraphUpdate = useCallback((data: GraphUpdateData) => {
    setGraphData(data)
    setLastUpdated(new Date().toISOString())
    if (isFirstUpdate.current) {
      setLoading(false)
      isFirstUpdate.current = false
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    // 1. Try to get cached data from BFF first (fast initial render)
    getLatestGraphData()
      .then((result) => {
        if (isMounted && result?.data) {
          setGraphData(result.data)
          setLastUpdated(result.receivedAt)
          setLoading(false)
          isFirstUpdate.current = false
        }
      })
      .catch(() => {
        // BFF cache miss - will wait for WebSocket
      })

    // 2. Connect to WebSocket for real-time updates
    const cleanup = connectToGraphStream((data) => {
      if (isMounted) {
        handleGraphUpdate(data)
      }
    })

    // 3. Optional fallback: disabled by default to avoid masking webhook pipeline failures.
    const fallbackTimer = setTimeout(async () => {
      if (isMounted && isFirstUpdate.current) {
        if (!enableDirectFallback) {
          setLoading(false)
          isFirstUpdate.current = false
          return
        }

        try {
          console.log('[useGraphStream] Fallback: fetching from analysis-engine')
          await getDependencyGraphSnapshot()
          if (isMounted && isFirstUpdate.current) {
            // The full data will arrive via webhook
            setLoading(false)
            isFirstUpdate.current = false
          }
        } catch {
          if (isMounted) {
            setLoading(false)
            isFirstUpdate.current = false
          }
        }
      }
    }, 5000)

    return () => {
      isMounted = false
      cleanup()
      clearTimeout(fallbackTimer)
    }
  }, [handleGraphUpdate])

  return { graphData, loading, lastUpdated }
}

/**
 * Hook that provides dependency graph snapshot data from WebSocket,
 * transformed to match the existing GraphSnapshot format used by
 * IncidentExplorer and other components.
 *
 * Drop-in replacement for the previous polling useEffect pattern.
 */
export function useDependencyGraphSnapshot() {
  const { graphData, loading, lastUpdated } = useGraphStream()
  const [snapshot, setSnapshot] = useState<GraphSnapshot | null>(null)
  const [fallbackLoading, setFallbackLoading] = useState(true)

  // Transform webhook data to GraphSnapshot format
  useEffect(() => {
    if (!graphData) return

    const { metricsSnapshot, centrality } = graphData

    // Build centrality lookup
    const centralityMap = new Map<string, { pagerank: number; betweenness: number }>()
    if (centrality?.scores) {
      centrality.scores.forEach((s) => {
        centralityMap.set(s.service, { pagerank: s.pagerank, betweenness: s.betweenness })
      })
    }

    // Build nodes (same enrichment logic as analysis-engine DependencyGraphHandler)
    const nodes = metricsSnapshot.services.map((svc) => {
      const ns = svc.namespace || 'default'
      const id = `${ns}:${svc.name}`
      const errPct = svc.errorRate * 100
      const availPct = (typeof svc.availability === 'number' ? svc.availability : 0) * 100
      const centralityScore = centralityMap.get(svc.name)

      // Risk calculation (mirrors analysis-engine calculateRiskLevel)
      let riskLevel: GraphRiskLevel = 'LOW'
      let riskReason = 'Operating normally'

      const podCount = typeof svc.podCount === 'number' ? svc.podCount : 0
      if (podCount === 0) {
        riskLevel = 'CRITICAL'
        riskReason = 'No pods running'
      } else if (availPct < 50) {
        riskLevel = 'CRITICAL'
        riskReason = `Critical availability (${availPct.toFixed(1)}%)`
      } else if (errPct > 5) {
        riskLevel = 'HIGH'
        riskReason = `High error rate (${errPct.toFixed(2)}%)`
      } else if (availPct < 95) {
        riskLevel = 'HIGH'
        riskReason = `Low availability (${availPct.toFixed(1)}%)`
      } else if (svc.p95 > 1000) {
        riskLevel = 'HIGH'
        riskReason = `P95 latency spike (${svc.p95.toFixed(0)}ms)`
      } else if (errPct > 1) {
        riskLevel = 'MEDIUM'
        riskReason = `Elevated error rate (${errPct.toFixed(2)}%)`
      } else if (availPct < 99) {
        riskLevel = 'MEDIUM'
        riskReason = `Availability degraded (${availPct.toFixed(1)}%)`
      } else if (svc.p95 > 500) {
        riskLevel = 'MEDIUM'
        riskReason = `Slow responses (${svc.p95.toFixed(0)}ms)`
      }

      return {
        id,
        name: svc.name,
        namespace: ns,
        riskLevel,
        riskReason,
        reqRate: svc.rps,
        errorRatePct: errPct,
        latencyP95Ms: svc.p95,
        availabilityPct: availPct,
        podCount,
        availability: typeof svc.availability === 'number' ? svc.availability : 0,
        pageRank: centralityScore?.pagerank,
        betweenness: centralityScore?.betweenness,
        updatedAt: metricsSnapshot.timestamp,
      }
    })

    // Build edges
    const serviceNamespaceMap = new Map<string, string>()
    metricsSnapshot.services.forEach((svc) => {
      serviceNamespaceMap.set(svc.name, svc.namespace || 'default')
    })

    const edges = metricsSnapshot.edges.map((e) => {
      const fromNs = serviceNamespaceMap.get(e.from) || 'default'
      const toNs = e.namespace || serviceNamespaceMap.get(e.to) || 'default'
      return {
        id: `${fromNs}:${e.from}->${toNs}:${e.to}`,
        source: `${fromNs}:${e.from}`,
        target: `${toNs}:${e.to}`,
        reqRate: e.rps,
        latencyP95Ms: e.p95,
      }
    })

    setSnapshot({
      nodes,
      edges,
      metadata: {
        stale: false,
        lastUpdatedSecondsAgo: 0,
        windowMinutes: 5,
        nodeCount: nodes.length,
        edgeCount: edges.length,
        nodesWithMetrics: nodes.length,
        edgesWithMetrics: edges.length,
        generatedAt: lastUpdated || new Date().toISOString(),
      },
    })
    setFallbackLoading(false)
  }, [graphData, lastUpdated])

  // Optional fallback: disabled by default to avoid masking webhook pipeline failures.
  useEffect(() => {
    if (snapshot) return // Already have data from WS

    let isMounted = true
    if (!enableDirectFallback) {
      setFallbackLoading(false)
      return () => {
        isMounted = false
      }
    }

    const fetchFallback = async () => {
      try {
        const data = await getDependencyGraphSnapshot()
        if (isMounted && !snapshot) {
          setSnapshot(data)
          setFallbackLoading(false)
        }
      } catch {
        if (isMounted) setFallbackLoading(false)
      }
    }

    fetchFallback()
    return () => {
      isMounted = false
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return {
    snapshot,
    loading: loading && fallbackLoading,
    lastUpdated,
  }
}

/**
 * Hook that provides services with placement data from WebSocket,
 * matching the shape returned by getServicesWithPlacement().
 *
 * Drop-in replacement for the polling pattern in NodeResourceGraph.
 */
export function useServicesWithPlacement() {
  const { graphData, loading, lastUpdated } = useGraphStream()
  const [services, setServices] = useState<ServiceWithPlacement[]>([])
  const [allNodes, setAllNodes] = useState<NodeWithResources[]>([])
  const [fallbackLoading, setFallbackLoading] = useState(true)
  const dependencyEdges = useMemo(
    () =>
      (graphData?.metricsSnapshot?.edges || []).map((e) => ({
        source: e.from,
        target: e.to,
      })),
    [graphData]
  )

  useEffect(() => {
    if (!graphData) return

    // Map webhook services to ServiceWithPlacement format
    const mappedServices: ServiceWithPlacement[] = graphData.services.map((svc) => ({
      name: svc.name,
      namespace: svc.namespace,
      podCount: svc.podCount,
      availability: svc.availability,
      placement: svc.placement,
    }))

    // Map infrastructure nodes
    const mappedNodes: NodeWithResources[] = (graphData.infrastructure?.nodes || []).map((n) => ({
      name: n.name,
      resources: n.resources,
    }))

    setServices(mappedServices)
    setAllNodes(mappedNodes)
    setFallbackLoading(false)
  }, [graphData])

  // Optional fallback: disabled by default to avoid masking webhook pipeline failures.
  useEffect(() => {
    if (services.length > 0) return

    let isMounted = true
    if (!enableDirectFallback) {
      setFallbackLoading(false)
      return () => {
        isMounted = false
      }
    }

    const fetchFallback = async () => {
      try {
        const [servicesData, nodesData] = await Promise.all([
          getServicesWithPlacement(),
          getNodes().catch(() => ({ nodes: [] })),
        ])
        if (isMounted && services.length === 0) {
          setServices(servicesData.services || [])
          setAllNodes(nodesData.nodes || [])
          setFallbackLoading(false)
        }
      } catch {
        if (isMounted) setFallbackLoading(false)
      }
    }

    fetchFallback()
    return () => {
      isMounted = false
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return {
    services,
    allNodes,
    loading: loading && fallbackLoading,
    lastUpdated,
    // Expose dependency edges from the snapshot
    dependencyEdges,
  }
}
