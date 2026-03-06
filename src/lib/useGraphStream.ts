import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import {
  connectToGraphStream,
  getLatestGraphData,
  type GraphUpdateData,
  type GraphFreshness,
} from '@/lib/bffApiClient'
import { getDependencyGraphSnapshot, getServicesWithPlacement, getNodes, isInfrastructureService } from '@/lib/api'
import type { GraphSnapshot, GraphRiskLevel, ServiceWithPlacement, NodeWithResources } from '@/lib/types'

const enableDirectFallback = import.meta.env.VITE_ENABLE_GRAPH_DIRECT_FALLBACK === 'true'
const graphCacheRefreshMs = Number.parseInt(import.meta.env.VITE_GRAPH_CACHE_REFRESH_MS || '5000', 10) || 5000

function namespacedServiceKey(name: string, namespace?: string): string {
  return `${(namespace || 'default').trim() || 'default'}:${name}`
}

function pickNamespace(
  serviceName: string,
  preferredNamespace: string | undefined,
  namespacesByService: Map<string, Set<string>>,
  activeServiceKeys: Set<string>
): string | null {
  const namespaces = namespacesByService.get(serviceName)
  if (!namespaces || namespaces.size === 0) return null

  const preferred = preferredNamespace?.trim()
  if (preferred && namespaces.has(preferred)) return preferred

  if (preferred && activeServiceKeys.has(namespacedServiceKey(serviceName, preferred))) {
    return preferred
  }

  if (namespaces.size === 1) return Array.from(namespaces)[0]

  for (const ns of namespaces) {
    if (activeServiceKeys.has(namespacedServiceKey(serviceName, ns))) return ns
  }

  return Array.from(namespaces).sort()[0] ?? null
}

function buildServicesTopologySignature(services: ServiceWithPlacement[]): string {
  return services
    .map((svc) => {
      const nodeSignature = (svc.placement?.nodes || [])
        .map((np) => {
          const podNames = (np.pods || []).map((p) => p.name).sort().join(',')
          return `${np.node}#${podNames}`
        })
        .sort()
        .join(';')
      return `${svc.namespace}:${svc.name}#${svc.podCount ?? 0}#${nodeSignature}`
    })
    .sort()
    .join('|')
}

function buildNodesTopologySignature(nodes: NodeWithResources[]): string {
  return nodes
    .map((node) => node.name)
    .sort()
    .join('|')
}

function normalizeServicesWithPlacement(services: ServiceWithPlacement[]): ServiceWithPlacement[] {
  return services
    .filter((svc) => {
      if (!svc?.name || !svc?.namespace) return false
      return !isInfrastructureService({ name: svc.name, namespace: svc.namespace })
    })
    .map((svc) => ({
      name: svc.name,
      namespace: svc.namespace,
      podCount: typeof svc.podCount === 'number' ? svc.podCount : 0,
      availability: typeof svc.availability === 'number' ? svc.availability : 0,
      placement: svc.placement ?? { nodes: [] },
    }))
}

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
  const [freshness, setFreshness] = useState<GraphFreshness | null>(null)
  const isFirstUpdate = useRef(true)
  const lastReceivedAtMs = useRef<number>(0)

  // Handler for incoming WebSocket graph updates
  const handleGraphUpdate = useCallback((data: GraphUpdateData) => {
    const nowIso = new Date().toISOString()
    lastReceivedAtMs.current = Date.parse(nowIso) || Date.now()
    setGraphData(data)
    setLastUpdated(nowIso)
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
        if (!isMounted || !result) return
        if (result.freshness) setFreshness(result.freshness)
        if (result.data) {
          const receivedAt = result.receivedAt || new Date().toISOString()
          lastReceivedAtMs.current = Date.parse(receivedAt) || Date.now()
          setGraphData(result.data)
          setLastUpdated(receivedAt)
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

    // 2.5 Pull latest BFF cache every few seconds as a resilience layer.
    // This still reflects webhook-ingested data (not direct analysis-engine polling).
    const cacheRefreshTimer = setInterval(() => {
      if (!isMounted) return
      getLatestGraphData()
        .then((result) => {
          if (!isMounted || !result) return
          if (result.freshness) setFreshness(result.freshness)
          if (!result.data) return
          const receivedAt = result.receivedAt || new Date().toISOString()
          const receivedAtMs = Date.parse(receivedAt) || Date.now()
          if (receivedAtMs <= lastReceivedAtMs.current) return

          lastReceivedAtMs.current = receivedAtMs
          setGraphData(result.data)
          setLastUpdated(receivedAt)
          if (isFirstUpdate.current) {
            setLoading(false)
            isFirstUpdate.current = false
          }
        })
        .catch(() => {
          // Ignore transient cache refresh failures; WS channel remains primary.
        })
    }, graphCacheRefreshMs)

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
      clearInterval(cacheRefreshTimer)
      clearTimeout(fallbackTimer)
    }
  }, [handleGraphUpdate])

  /**
   * Force-refresh graph data by fetching from the BFF cache.
   * Call this after drill/simulation operations to pick up cluster state changes.
   */
  const refetch = useCallback(async () => {
    try {
      const result = await getLatestGraphData()
      if (!result) return
      if (result.freshness) setFreshness(result.freshness)
      if (!result.data) return

      const receivedAt = result.receivedAt || new Date().toISOString()
      const receivedAtMs = Date.parse(receivedAt) || Date.now()
      if (receivedAtMs <= lastReceivedAtMs.current) return

      lastReceivedAtMs.current = receivedAtMs
      setGraphData(result.data)
      setLastUpdated(receivedAt)
      if (isFirstUpdate.current) {
        setLoading(false)
        isFirstUpdate.current = false
      }
    } catch {
      // Ignore transient refetch failures
    }
  }, [])

  return { graphData, loading, lastUpdated, freshness, refetch }
}

/**
 * Hook that provides dependency graph snapshot data from WebSocket,
 * transformed to match the existing GraphSnapshot format used by
 * IncidentExplorer and other components.
 *
 * Drop-in replacement for the previous polling useEffect pattern.
 */
export function useDependencyGraphSnapshot() {
  const { graphData, loading, lastUpdated, freshness } = useGraphStream()
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
    const nodes = metricsSnapshot.services
      .filter((svc) => !isInfrastructureService({ name: svc.name, namespace: svc.namespace || 'default' }))
      .map((svc) => {
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

    const edges = metricsSnapshot.edges
      .filter((e) => {
        const fromNs = serviceNamespaceMap.get(e.from) || 'default'
        const toNs = e.namespace || serviceNamespaceMap.get(e.to) || 'default'
        return (
          !isInfrastructureService({ name: e.from, namespace: fromNs }) &&
          !isInfrastructureService({ name: e.to, namespace: toNs })
        )
      })
      .map((e) => {
        const fromNs = serviceNamespaceMap.get(e.from) || 'default'
        const toNs = e.namespace || serviceNamespaceMap.get(e.to) || 'default'
        return {
          id: `${fromNs}:${e.from}->${toNs}:${e.to}`,
          source: `${fromNs}:${e.from}`,
          target: `${toNs}:${e.to}`,
          reqRate: e.rps,
          errorRatePct: Number(e.errorRate || 0) * 100,
          latencyP95Ms: e.p95,
        }
      })

    const fallbackUpdatedSecondsAgo =
      lastUpdated && Number.isFinite(Date.parse(lastUpdated))
        ? Math.max(0, Math.floor((Date.now() - Date.parse(lastUpdated)) / 1000))
        : null
    const resolvedWindowMinutes = freshness?.windowMinutes ?? 5
    const resolvedUpdatedSecondsAgo = freshness?.lastUpdatedSecondsAgo ?? fallbackUpdatedSecondsAgo
    const resolvedStale =
      freshness?.stale ?? (resolvedUpdatedSecondsAgo === null
        ? true
        : resolvedUpdatedSecondsAgo > resolvedWindowMinutes * 60)

    setSnapshot({
      nodes,
      edges,
      metadata: {
        stale: resolvedStale,
        lastUpdatedSecondsAgo: resolvedUpdatedSecondsAgo,
        windowMinutes: resolvedWindowMinutes,
        nodeCount: nodes.length,
        edgeCount: edges.length,
        nodesWithMetrics: nodes.length,
        edgesWithMetrics: edges.length,
        generatedAt: lastUpdated || new Date().toISOString(),
      },
    })
    setFallbackLoading(false)
  }, [graphData, lastUpdated, freshness])

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
  const { graphData, loading, lastUpdated, refetch: refetchGraph } = useGraphStream()
  const [services, setServices] = useState<ServiceWithPlacement[]>([])
  const [allNodes, setAllNodes] = useState<NodeWithResources[]>([])
  const [fallbackLoading, setFallbackLoading] = useState(true)
  const servicesSignatureRef = useRef('')
  const nodesSignatureRef = useRef('')
  const topologyEpochRef = useRef(0)
  const filteredServiceKeySet = useMemo(
    () => new Set((services || []).map((svc) => namespacedServiceKey(svc.name, svc.namespace))),
    [services]
  )
  const namespacesByServiceName = useMemo(() => {
    const map = new Map<string, Set<string>>()
    ;(services || []).forEach((svc) => {
      const list = map.get(svc.name) ?? new Set<string>()
      list.add(svc.namespace || 'default')
      map.set(svc.name, list)
    })
    return map
  }, [services])

  const dependencyEdges = useMemo(() => {
    const snapshotEdges = graphData?.metricsSnapshot?.edges || []
    if (snapshotEdges.length === 0) return []

    const mapped: Array<{
      source: string
      target: string
      sourceNamespace: string
      targetNamespace: string
      rps: number
      errorRate: number
    }> = []

    snapshotEdges.forEach((e) => {
      const targetNamespace =
        pickNamespace(e.to, e.namespace, namespacesByServiceName, filteredServiceKeySet) ||
        (e.namespace?.trim() || 'default')

      const sourceNamespace =
        pickNamespace(e.from, targetNamespace, namespacesByServiceName, filteredServiceKeySet) ||
        pickNamespace(e.from, e.namespace, namespacesByServiceName, filteredServiceKeySet) ||
        pickNamespace(e.from, undefined, namespacesByServiceName, filteredServiceKeySet) ||
        targetNamespace

      const sourceKey = namespacedServiceKey(e.from, sourceNamespace)
      const targetKey = namespacedServiceKey(e.to, targetNamespace)
      if (!filteredServiceKeySet.has(sourceKey) || !filteredServiceKeySet.has(targetKey)) return

      mapped.push({
        source: e.from,
        target: e.to,
        sourceNamespace,
        targetNamespace,
        rps: e.rps,
        errorRate: e.errorRate,
      })
    })

    return mapped
  }, [filteredServiceKeySet, graphData, namespacesByServiceName])

  /** Per-service live metrics keyed by "namespace:service" */
  const serviceMetrics = useMemo(
    () =>
      new Map(
        (graphData?.metricsSnapshot?.services || [])
          .map((s) => ({
            key: namespacedServiceKey(s.name, s.namespace),
            value: { rps: s.rps, errorRate: s.errorRate, p95: s.p95 },
          }))
          .filter((entry) => filteredServiceKeySet.has(entry.key))
          .map((s) => [
            s.key,
            s.value,
          ])
      ),
    [filteredServiceKeySet, graphData]
  )

  useEffect(() => {
    if (!graphData) return
    const snapshotTsMs = Date.parse(graphData.metricsSnapshot?.timestamp || '')
    const snapshotEpoch = Number.isFinite(snapshotTsMs) ? snapshotTsMs : Date.now()
    if (snapshotEpoch < topologyEpochRef.current) return

    // Map webhook services to ServiceWithPlacement format
    const mappedServices = normalizeServicesWithPlacement(graphData.services || [])

    // Map infrastructure nodes
    const mappedNodes: NodeWithResources[] = (graphData.infrastructure?.nodes || []).map((n) => ({
      name: n.name,
      resources: n.resources,
    }))

    const nextServicesSignature = buildServicesTopologySignature(mappedServices)
    const nextNodesSignature = buildNodesTopologySignature(mappedNodes)
    let updated = false

    if (nextServicesSignature !== servicesSignatureRef.current) {
      servicesSignatureRef.current = nextServicesSignature
      setServices(mappedServices)
      updated = true
    }
    if (nextNodesSignature !== nodesSignatureRef.current) {
      nodesSignatureRef.current = nextNodesSignature
      setAllNodes(mappedNodes)
      updated = true
    }
    if (updated || snapshotEpoch > topologyEpochRef.current) {
      topologyEpochRef.current = snapshotEpoch
    }
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
          const fallbackServices = normalizeServicesWithPlacement(servicesData.services || [])
          const fallbackNodes = nodesData.nodes || []
          servicesSignatureRef.current = buildServicesTopologySignature(fallbackServices)
          nodesSignatureRef.current = buildNodesTopologySignature(fallbackNodes)
          topologyEpochRef.current = Date.now()
          setServices(fallbackServices)
          setAllNodes(fallbackNodes)
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

  /**
   * Force-refresh services & nodes from the analysis-engine directly,
   * bypassing the webhook cache. Useful after drills/simulations that
   * mutate cluster state so the topology map reflects changes immediately.
   */
  const refetch = useCallback(async () => {
    // First try the BFF-level refetch (fast, uses cached webhook data)
    await refetchGraph()

    // Then also pull live data directly from the analysis-engine
    // to capture very recent k8s changes (e.g. new pods from a scale drill)
    const directFetchEpoch = Date.now()
    try {
      const [servicesData, nodesData] = await Promise.all([
        getServicesWithPlacement(),
        getNodes().catch(() => ({ nodes: [] })),
      ])
      let updated = false
      if (servicesData.services) {
        const normalizedServices = normalizeServicesWithPlacement(servicesData.services)
        const nextServicesSignature = buildServicesTopologySignature(normalizedServices)
        if (nextServicesSignature !== servicesSignatureRef.current) {
          servicesSignatureRef.current = nextServicesSignature
          setServices(normalizedServices)
          updated = true
        }
      }
      if (nodesData.nodes) {
        const nextNodesSignature = buildNodesTopologySignature(nodesData.nodes)
        if (nextNodesSignature !== nodesSignatureRef.current) {
          nodesSignatureRef.current = nextNodesSignature
          setAllNodes(nodesData.nodes)
          updated = true
        }
      }
      if (updated || directFetchEpoch > topologyEpochRef.current) {
        topologyEpochRef.current = directFetchEpoch
      }
    } catch {
      // Direct fetch failed — rely on BFF-level data
    }
  }, [refetchGraph])

  return {
    services,
    allNodes,
    loading: loading && fallbackLoading,
    lastUpdated,
    // Expose dependency edges from the snapshot (now includes rps / errorRate)
    dependencyEdges,
    // Per-service live metrics map
    serviceMetrics,
    // Manual refetch trigger for drill/simulation operations
    refetch,
  }
}
