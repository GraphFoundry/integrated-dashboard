import { useState, useEffect, useMemo, useRef } from 'react'
import { GraphCanvas, GraphNode as ReagraphNode, type GraphCanvasRef } from 'reagraph'
import {
  ChevronRight,
  ArrowLeft,
  Server,
  Package,
  Box,
  AlertCircle,
  Database,
  Cpu,
  HardDrive,
  TrendingUp,
  Clock,
  Plus,
  Minus,
  LocateFixed,
} from 'lucide-react'
import EmptyState from '@/components/layout/EmptyState'
import SkeletonBlock from '@/components/common/SkeletonBlock'
import ErrorBanner from '@/components/common/ErrorBanner'
import { cn, secondaryButtonClass } from '@/components/common/uiClassTokens'
import { useServicesWithPlacement } from '@/lib/useGraphStream'
import { useTheme } from '@/theme/useTheme'
import type { ServiceWithPlacement, NodeWithResources } from '@/lib/types'
import {
  extractNodesFromServices,
  extractServicesForNode,
  extractPodsForService,
  getResourceColor,
} from '../../lib/nodeResourceHelpers'

type ViewLevel = 'nodes' | 'services' | 'pods'

type BreadcrumbItem = {
  label: string
  level: ViewLevel
  nodeId?: string
  serviceName?: string
}

interface BreadcrumbNavProps {
  readonly breadcrumbs: BreadcrumbItem[]
  readonly onBreadcrumbClick: (item: BreadcrumbItem) => void
}

function GraphShell({
  children,
  className = '',
}: {
  readonly children: React.ReactNode
  readonly className?: string
}) {
  return (
    <div
      className={`bg-[var(--surface-solid)] border border-[var(--border)] rounded-lg overflow-hidden flex flex-col h-full min-h-[640px] ${className}`}
    >
      {children}
    </div>
  )
}

function BreadcrumbNav({ breadcrumbs, onBreadcrumbClick }: BreadcrumbNavProps) {
  return (
    <nav className="flex items-center gap-1 text-sm">
      {breadcrumbs.map((item, idx) => (
        <div key={`${item.level}-${item.label}-${idx}`} className="flex items-center gap-1">
          {idx > 0 && <ChevronRight className="w-4 h-4 text-[var(--text-dim)]" />}
          <button
            type="button"
            onClick={() => onBreadcrumbClick(item)}
            className={cn(
              'neon-focus-ring interactive-soft rounded-md px-2.5 py-1.5 text-xs sm:text-sm',
              idx === breadcrumbs.length - 1
                ? 'border border-[var(--color-emerald-300)]/45 bg-emerald-500/18 font-semibold text-[var(--text-primary)]'
                : 'border border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--text-secondary)] hover:border-[var(--color-emerald-300)]/45 hover:text-[var(--text-primary)]'
            )}
          >
            {item.label}
          </button>
        </div>
      ))}
    </nav>
  )
}

// Helper function for empty state messages
function getEmptyStateMessage(
  level: ViewLevel,
  nodeId: string | null,
  serviceName: string | null
): string {
  if (level === 'nodes')
    return 'No node placement data available. Services are running but infrastructure metrics are not collected.'
  if (level === 'services') return `No services found on node ${nodeId}`
  return `No pods found for service ${serviceName}`
}

function formatUptime(seconds?: number): string {
  if (seconds === undefined || seconds === null) return 'N/A'
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) return `${days}d ${hours % 24}h`
  if (hours > 0) return `${hours}h ${minutes % 60}m`
  return `${minutes}m`
}

// ... imports

interface NodeResourceGraphProps {
  simulatedService?: {
    name: string
    namespace: string
    nodeName: string
    cpuRequest: number
    ramRequest: number
    replicas: number
    dependencies?: { serviceId: string; relation: 'calls' | 'called_by' }[]
  } | null
  nodeMetricOverrides?: Record<
    string,
    {
      cpuUsed: number
      cpuTotal: number
      ramUsedMB: number
      ramTotalMB: number
    }
  > | null
}

export default function NodeResourceGraph({
  simulatedService,
  nodeMetricOverrides,
}: NodeResourceGraphProps) {
  const { resolvedTheme } = useTheme()
  const {
    services: wsServices,
    allNodes: wsAllNodes,
    loading: wsLoading,
    dependencyEdges: wsDependencyEdges,
  } = useServicesWithPlacement()

  const [loading, setLoading] = useState(true)
  const [error] = useState<string | null>(null)
  const [services, setServices] = useState<ServiceWithPlacement[]>([])
  const [allNodes, setAllNodes] = useState<NodeWithResources[]>([])
  const [viewLevel, setViewLevel] = useState<ViewLevel>('nodes')
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([
    { label: 'Nodes', level: 'nodes' },
  ])
  const [currentNodeId, setCurrentNodeId] = useState<string | null>(null)
  const [currentServiceName, setCurrentServiceName] = useState<string | null>(null)
  const [hoveredNode, setHoveredNode] = useState<ReagraphNode | null>(null)
  const [mousePosition, setMousePosition] = useState<{ x: number; y: number } | null>(null)
  const [isNodeHovered, setIsNodeHovered] = useState(false)
  const [selections, setSelections] = useState<string[]>([])
  const [serviceDependencyEdges, setServiceDependencyEdges] = useState<
    { source: string; target: string }[]
  >([])
  const graphRef = useRef<GraphCanvasRef | null>(null)
  const graphTheme = useMemo(() => createGraphTheme(resolvedTheme), [resolvedTheme])

  const hasInitialDrillDown = useRef(false)

  // Update from WebSocket stream (replaces polling)
  useEffect(() => {
    if (wsServices.length === 0 && wsLoading) return

    let fetchedServices: ServiceWithPlacement[] = [...wsServices]

    // If we have a simulated service, merge it into the services list
    if (simulatedService) {
      const simServiceId = `${simulatedService.namespace}:${simulatedService.name}`
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const exists = fetchedServices.find((s: any) => `${s.namespace}:${s.name}` === simServiceId)

      if (!exists) {
        fetchedServices = [
          ...fetchedServices,
          {
            name: simulatedService.name,
            namespace: simulatedService.namespace,
            podCount: simulatedService.replicas,
            availability: 1.0,
            placement: {
              nodes: [
                {
                  node: simulatedService.nodeName,
                  resources: {
                    cpu: { usagePercent: 0, cores: 0 },
                    ram: { usedMB: 0, totalMB: 0 },
                  },
                  pods: Array(simulatedService.replicas)
                    .fill(null)
                    .map((_, i) => ({
                      name: `${simulatedService.name}-sim-${i}`,
                      ramUsedMB: simulatedService.ramRequest,
                      cpuUsagePercent: (simulatedService.cpuRequest / 2) * 10,
                      uptimeSeconds: 0,
                    })),
                },
              ],
            },
          },
        ]
      }
    }

    setServices(fetchedServices)
    setAllNodes(wsAllNodes)
    setLoading(false)

    // Only drill down on initial load of simulation
    if (
      simulatedService &&
      viewLevel === 'nodes' &&
      !currentNodeId &&
      !hasInitialDrillDown.current
    ) {
      hasInitialDrillDown.current = true
      setViewLevel('services')
      setCurrentNodeId(simulatedService.nodeName)
      setBreadcrumbs([
        { label: 'Nodes', level: 'nodes' },
        { label: simulatedService.nodeName, level: 'services', nodeId: simulatedService.nodeName },
      ])
    }

    // Build dependency edges for Level 2
    const edges: { source: string; target: string }[] = wsDependencyEdges.map((e) => ({
      source: e.source,
      target: e.target,
    }))

    // Inject simulated edges
    if (simulatedService && simulatedService.dependencies) {
      simulatedService.dependencies.forEach((dep) => {
        const peerName = dep.serviceId.split(':')[1] || dep.serviceId
        if (dep.relation === 'calls') {
          edges.push({ source: simulatedService.name, target: peerName })
        } else {
          edges.push({ source: peerName, target: simulatedService.name })
        }
      })
    }

    setServiceDependencyEdges(edges)
  }, [
    wsServices,
    wsAllNodes,
    wsLoading,
    simulatedService,
    viewLevel,
    currentNodeId,
    wsDependencyEdges,
  ])

  // Generate graph data based on current view level
  const graphData = useMemo(() => {
    if (viewLevel === 'nodes') {
      const nodeData = extractNodesFromServices(services)
      type NodeData = ReturnType<typeof extractNodesFromServices>[0]

      // Apply overrides if provided
      if (nodeMetricOverrides) {
        nodeData.forEach((n) => {
          if (nodeMetricOverrides[n.id]) {
            const override = nodeMetricOverrides[n.id]
            n.cpuUsagePercent = (override.cpuUsed / override.cpuTotal) * 100
            n.cpuUsed = override.cpuUsed

            n.ramUsageMB = override.ramUsedMB
            n.ramUsagePercent = (override.ramUsedMB / override.ramTotalMB) * 100
            n.ramTotalMB = override.ramTotalMB
          }
        })
      }

      // Merge extracted nodes with allNodes to ensure we show empty nodes too
      const nodeMap = new Map<string, NodeData>()

      // 1. Add nodes from direct fetch (includes empty nodes)
      allNodes.forEach((node) => {
        nodeMap.set(node.name, {
          id: node.name,
          label: node.name,
          cpuUsagePercent: node.resources.cpu.usagePercent,
          cpuUsed: 0, // Not available in simple node fetch yet, defaults to 0
          cpuTotal: node.resources.cpu.cores,
          ramUsageMB: node.resources.ram.usedMB,
          ramUsagePercent: (node.resources.ram.usedMB / node.resources.ram.totalMB) * 100,
          ramTotalMB: node.resources.ram.totalMB,
          totalPods: 0,
        })
      })

      // 2. Override/Merge with detailed placement data (has pod counts etc)
      nodeData.forEach((n) => {
        nodeMap.set(n.id, n)
      })

      const mergedNodes = Array.from(nodeMap.values())

      // Apply overrides if provided
      if (nodeMetricOverrides) {
        mergedNodes.forEach((n) => {
          if (nodeMetricOverrides[n.id]) {
            const override = nodeMetricOverrides[n.id]
            n.cpuUsagePercent = (override.cpuUsed / override.cpuTotal) * 100
            n.cpuUsed = override.cpuUsed

            n.ramUsageMB = override.ramUsedMB
            n.ramUsagePercent = (override.ramUsedMB / override.ramTotalMB) * 100
            n.ramTotalMB = override.ramTotalMB
          }
        })
      }

      return {
        nodes: mergedNodes.map((n: NodeData) => ({
          id: n.id,
          label: n.label,
          size: 50,
          fill: getResourceColor(n.cpuUsagePercent),
          data: n,
        })),
        edges: [], // No edges at node level
      }
    }

    if (viewLevel === 'services' && currentNodeId) {
      const servicesOnNode = extractServicesForNode(services, currentNodeId)
      type ServiceData = ReturnType<typeof extractServicesForNode>[0]
      const nodes = servicesOnNode.map((s: ServiceData) => {
        const isSimulated =
          simulatedService &&
          s.id === simulatedService.name &&
          s.namespace === simulatedService.namespace

        let fill = '#ef4444' // red (low availability)
        if (isSimulated) {
          fill = '#06b6d4' // cyan-500 (Simulated)
        } else if (s.availability >= 0.95) {
          fill = '#10b981' // green (high availability)
        } else if (s.availability >= 0.8) {
          fill = '#f59e0b' // yellow (medium availability)
        }
        return {
          id: s.id,
          label: s.label,

          size: 50,
          fill,
          data: { ...s, isSimulated },
        }
      })

      // Filter edges to only show connections between services on this node
      const serviceIds = new Set(servicesOnNode.map((s: ServiceData) => s.id))
      const edges = serviceDependencyEdges
        .filter((e) => serviceIds.has(e.source) && serviceIds.has(e.target))
        .map((e, idx) => ({
          id: `edge-${idx}`,
          source: e.source,
          target: e.target,
        }))

      return { nodes, edges }
    }

    if (viewLevel === 'pods' && currentServiceName) {
      const service = services.find((s) => s.name === currentServiceName)
      if (!service) return { nodes: [], edges: [] }

      const podData = extractPodsForService(service)
      type PodData = ReturnType<typeof extractPodsForService>[0]
      return {
        nodes: podData.map((p: PodData) => {
          // If service is not available (0 or very low), show pods as red
          const fill = p.serviceAvailability === 0 ? '#ef4444' : getResourceColor(p.cpuUsagePercent)
          return {
            id: p.id,
            label: p.label,

            size: 40,
            fill,
            data: p,
          }
        }),
        edges: [], // No edges at pod level
      }
    }

    return { nodes: [], edges: [] }
  }, [
    viewLevel,
    currentNodeId,
    currentServiceName,
    services,
    allNodes,
    serviceDependencyEdges,
    nodeMetricOverrides,
    simulatedService,
  ])

  // Handle node click based on current level
  const handleNodeClick = (node: ReagraphNode) => {
    if (viewLevel === 'nodes') {
      // Level 1 → Level 2: Show services on this node
      setHoveredNode(null) // Hide tooltip when drilling down
      setMousePosition(null)
      setSelections([])
      const nodeId = node.id
      setCurrentNodeId(nodeId)
      setViewLevel('services')
      setBreadcrumbs([
        { label: 'Nodes', level: 'nodes' },
        { label: nodeId, level: 'services', nodeId },
      ])
    } else if (viewLevel === 'services') {
      // Level 2 → Level 3: Show pods for this service
      setHoveredNode(null) // Hide tooltip when drilling down
      setMousePosition(null)
      setSelections([])
      const serviceName = node.id
      setCurrentServiceName(serviceName)
      setViewLevel('pods')
      setBreadcrumbs([
        { label: 'Nodes', level: 'nodes' },
        { label: currentNodeId || '', level: 'services', nodeId: currentNodeId || undefined },
        { label: serviceName, level: 'pods', serviceName },
      ])
    }
  }
  // Level 3 (pods): No further drill-down, don't hide tooltip
  // Handle breadcrumb click
  const handleBreadcrumbClick = (item: BreadcrumbItem) => {
    setViewLevel(item.level)

    if (item.level === 'nodes') {
      setCurrentNodeId(null)
      setCurrentServiceName(null)
      setBreadcrumbs([{ label: 'Nodes', level: 'nodes' }])
    } else if (item.level === 'services' && item.nodeId) {
      setCurrentNodeId(item.nodeId)
      setCurrentServiceName(null)
      setBreadcrumbs([
        { label: 'Nodes', level: 'nodes' },
        { label: item.nodeId, level: 'services', nodeId: item.nodeId },
      ])
    }
  }

  // Handle back button
  const handleBack = () => {
    if (breadcrumbs.length > 1) {
      const newBreadcrumbs = breadcrumbs.slice(0, -1)
      const previousLevel = newBreadcrumbs[newBreadcrumbs.length - 1]
      if (previousLevel) {
        handleBreadcrumbClick(previousLevel)
      }
    }
  }

  if (loading) {
    return (
      <GraphShell>
        <div
          className="p-4 border-b border-[var(--border)] flex justify-between items-center bg-[var(--surface-soft)]"
          aria-busy="true"
        >
          <div className="flex items-center gap-2">
            <SkeletonBlock variant="line" className="h-8 w-8 rounded-md" />
            <SkeletonBlock variant="line" className="h-8 w-44 rounded-md" />
          </div>
          <SkeletonBlock variant="line" className="h-4 w-28" />
        </div>
        <div className="px-4 py-2 bg-[var(--surface-subtle)] border-b border-[var(--border)]">
          <SkeletonBlock variant="line" className="h-4 w-2/5" />
        </div>
        <div className="flex-1 relative p-4">
          <SkeletonBlock variant="card" className="h-full w-full rounded-lg" />
        </div>
      </GraphShell>
    )
  }

  if (error) {
    return (
      <GraphShell>
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="w-full max-w-md space-y-3">
            <ErrorBanner message={error} />
            <p className="text-center text-xs text-[var(--text-dim)]">
              Check backend connectivity to Graph Engine
            </p>
          </div>
        </div>
      </GraphShell>
    )
  }

  const hasData = graphData.nodes.length > 0

  return (
    <GraphShell className="relative">
      {/* Header with Breadcrumb and Back Button */}
      <div className="p-4 border-b border-[var(--border)] flex justify-between items-center bg-[var(--surface-soft)]">
        <div className="flex items-center gap-2">
          {breadcrumbs.length > 1 && (
            <button
              type="button"
              onClick={handleBack}
              className="neon-focus-ring interactive-soft rounded-md border border-[var(--border)] bg-[var(--surface-subtle)] p-1.5 text-[var(--text-secondary)] hover:border-[var(--color-emerald-300)]/45 hover:text-[var(--text-primary)]"
              title="Go back"
              aria-label="Go back to previous graph level"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <BreadcrumbNav breadcrumbs={breadcrumbs} onBreadcrumbClick={handleBreadcrumbClick} />
        </div>

        <div className="text-xs text-[var(--text-dim)]">
          {viewLevel === 'nodes' && `${graphData.nodes.length} nodes`}
          {viewLevel === 'services' && `${graphData.nodes.length} services on ${currentNodeId}`}
          {viewLevel === 'pods' && `${graphData.nodes.length} pods for ${currentServiceName}`}
        </div>
      </div>

      {/* Level indicator */}
      <div className="px-4 py-2 bg-[var(--surface-subtle)] border-b border-[var(--border)]">
        <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
          {viewLevel === 'nodes' && (
            <>
              <Server className="w-4 h-4" />
              <span>Click a node to view services running on it</span>
            </>
          )}
          {viewLevel === 'services' && (
            <>
              <Package className="w-4 h-4" />
              <span>Click a service to view its pods and container metrics</span>
            </>
          )}
          {viewLevel === 'pods' && (
            <>
              <Box className="w-4 h-4" />
              <span>Viewing pod-level CPU and RAM metrics</span>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 relative">
        {hasData ? (
          <div
            className={`absolute inset-0 ${isNodeHovered ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'}`}
            onMouseMove={(e) => {
              setMousePosition({ x: e.clientX, y: e.clientY })
            }}
            role="presentation"
          >
            <div className="absolute right-4 top-4 z-20 flex items-center gap-2">
              <button
                type="button"
                onClick={() => graphRef.current?.zoomOut?.()}
                className="neon-focus-ring interactive-soft rounded-md border border-[var(--border)] bg-[var(--surface-subtle)] p-2 text-[var(--text-secondary)] hover:border-[var(--ring)] hover:text-[var(--text-primary)]"
                aria-label="Zoom out graph"
                title="Zoom out"
              >
                <Minus className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => graphRef.current?.zoomIn?.()}
                className="neon-focus-ring interactive-soft rounded-md border border-[var(--border)] bg-[var(--surface-subtle)] p-2 text-[var(--text-secondary)] hover:border-[var(--ring)] hover:text-[var(--text-primary)]"
                aria-label="Zoom in graph"
                title="Zoom in"
              >
                <Plus className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => graphRef.current?.fitNodesInView?.()}
                className="neon-focus-ring interactive-soft rounded-md border border-[var(--border)] bg-[var(--surface-subtle)] p-2 text-[var(--text-secondary)] hover:border-[var(--ring)] hover:text-[var(--text-primary)]"
                aria-label="Fit graph to view"
                title="Fit graph"
              >
                <LocateFixed className="h-4 w-4" />
              </button>
            </div>
            <GraphCanvas
              ref={graphRef}
              nodes={graphData.nodes}
              edges={graphData.edges}
              selections={selections}
              layoutType={viewLevel === 'nodes' ? 'circular2d' : 'forceDirected2d'}
              labelType="all"
              theme={graphTheme}
              onNodeClick={(node) => handleNodeClick(node)}
              onNodePointerOver={(node) => {
                setHoveredNode(node)
                setIsNodeHovered(true)
                setSelections([node.id])
              }}
              onNodePointerOut={() => {
                setHoveredNode(null)
                setIsNodeHovered(false)
                setSelections([])
              }}
              onCanvasClick={() => {
                setSelections([])
                setIsNodeHovered(false)
              }}
              minZoom={0.1}
              maxZoom={5}
            />

            {/* Hover Tooltip */}
            {hoveredNode &&
              mousePosition &&
              (() => {
                const tooltipWidth = 256 // max-w-sm is ~256px
                const tooltipHeight = 200 // approximate height
                const viewportWidth = window.innerWidth
                const viewportHeight = window.innerHeight

                // Smart positioning to prevent overflow
                let left = mousePosition.x + 16
                let top = mousePosition.y + 16

                // Adjust horizontal position if tooltip would overflow right
                if (left + tooltipWidth > viewportWidth) {
                  left = mousePosition.x - tooltipWidth - 16
                }

                // Adjust vertical position if tooltip would overflow bottom
                if (top + tooltipHeight > viewportHeight) {
                  top = mousePosition.y - tooltipHeight - 16
                }

                // Ensure tooltip doesn't go off left edge
                if (left < 16) {
                  left = 16
                }

                // Ensure tooltip doesn't go off top edge
                if (top < 16) {
                  top = 16
                }

                return (
                  <div
                    className="fixed z-50 pointer-events-none bg-[var(--surface-contrast)] backdrop-blur-md border border-[var(--border-strong)] rounded-lg shadow-2xl max-w-sm animate-in fade-in zoom-in-95 duration-150"
                    style={{
                      left: `${left}px`,
                      top: `${top}px`,
                    }}
                  >
                    <div className="p-3">
                      {viewLevel === 'nodes' && hoveredNode.data && (
                        <>
                          <div className="flex items-center gap-2 mb-3">
                            <Server className="w-4 h-4 text-blue-400" />
                            <span className="font-semibold text-[var(--text-primary)] text-sm">
                              {hoveredNode.data.label}
                            </span>
                          </div>
                          <div className="space-y-2.5 text-xs">
                            <div className="flex items-center gap-2">
                              <Package className="w-3.5 h-3.5 text-purple-400" />
                              <span className="text-[var(--text-muted)]">Pods:</span>
                              <span className="font-mono font-semibold text-[var(--text-primary)]">
                                {hoveredNode.data.totalPods}
                              </span>
                            </div>
                            <div className="flex items-start gap-2">
                              <Cpu className="w-3.5 h-3.5 text-cyan-400 mt-0.5" />
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-[var(--text-muted)]">CPU:</span>
                                  <span className="font-mono font-semibold text-[var(--text-primary)]">
                                    {hoveredNode.data.cpuUsagePercent?.toFixed?.(1) ?? 'N/A'}%
                                  </span>
                                </div>
                                <div className="text-[var(--text-dim)] mt-0.5">
                                  {hoveredNode.data.cpuUsed?.toFixed?.(1) ?? 'N/A'}/
                                  {hoveredNode.data.cpuTotal ?? 'N/A'} allocatable cores
                                </div>
                              </div>
                            </div>
                            <div className="flex items-start gap-2">
                              <HardDrive className="w-3.5 h-3.5 text-emerald-400 mt-0.5" />
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-[var(--text-muted)]">RAM:</span>
                                  <span className="font-mono font-semibold text-[var(--text-primary)]">
                                    {hoveredNode.data.ramUsageMB != null
                                      ? (hoveredNode.data.ramUsageMB / 1024).toFixed(2)
                                      : 'N/A'}
                                    GB
                                  </span>
                                </div>
                                <div className="text-[var(--text-dim)] mt-0.5">
                                  {hoveredNode.data.ramUsagePercent?.toFixed?.(1) ?? 'N/A'}% used
                                </div>
                              </div>
                            </div>
                          </div>
                        </>
                      )}

                      {viewLevel === 'services' &&
                        hoveredNode.data &&
                        (() => {
                          const availPct =
                            hoveredNode.data.availability != null
                              ? hoveredNode.data.availability * 100
                              : null
                          const availColorClass =
                            availPct !== null && availPct > 99
                              ? 'text-green-300'
                              : availPct !== null && availPct > 95
                                ? 'text-yellow-300'
                                : 'text-red-300'
                          const availIconClass =
                            availPct !== null && availPct > 99
                              ? 'text-green-400'
                              : availPct !== null && availPct > 95
                                ? 'text-yellow-400'
                                : 'text-red-400'

                          return (
                            <>
                              <div className="flex items-center gap-2 mb-3">
                                <Box className="w-4 h-4 text-blue-400" />
                                <div>
                                  <div className="font-semibold text-[var(--text-primary)] text-sm flex items-center gap-2">
                                    {hoveredNode.data.label}
                                    {hoveredNode.data.isSimulated && (
                                      <span className="text-[10px] bg-cyan-900 text-cyan-300 px-1.5 py-0.5 rounded border border-cyan-700">
                                        SIMULATED
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-xs text-[var(--text-muted)]">
                                    {hoveredNode.data.namespace}
                                  </div>
                                </div>
                              </div>
                              <div className="space-y-2 text-xs">
                                <div className="flex items-center gap-2">
                                  <Package className="w-3.5 h-3.5 text-purple-400" />
                                  <span className="text-[var(--text-muted)]">Pods:</span>
                                  <span className="font-mono font-semibold text-[var(--text-primary)]">
                                    {hoveredNode.data.podCount}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <TrendingUp className={`w-3.5 h-3.5 ${availIconClass}`} />
                                  <span className="text-[var(--text-muted)]">Availability:</span>
                                  <span className={`font-mono font-semibold ${availColorClass}`}>
                                    {availPct !== null ? availPct.toFixed(1) : 'N/A'}%
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 pt-1 border-t border-[var(--border)] mt-1">
                                  <Clock className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                                  <span className="text-[var(--text-muted)]">Avg Pod Age:</span>
                                  <span className="font-mono font-semibold text-[var(--text-primary)]">
                                    {formatUptime(hoveredNode.data.avgUptimeSeconds)}
                                  </span>
                                </div>
                              </div>
                            </>
                          )
                        })()}

                      {viewLevel === 'pods' &&
                        hoveredNode.data &&
                        (() => {
                          const isServiceUnavailable = hoveredNode.data.serviceAvailability === 0
                          const availColorClass = isServiceUnavailable
                            ? 'text-red-400'
                            : 'text-green-400'

                          return (
                            <>
                              <div className="flex items-center gap-2 mb-3">
                                <Package className="w-4 h-4 text-purple-400" />
                                <span className="font-semibold text-[var(--text-primary)] text-sm">
                                  {hoveredNode.data.label}
                                </span>
                              </div>
                              <div className="space-y-2 text-xs">
                                <div className="flex items-center gap-2">
                                  <Server className="w-3.5 h-3.5 text-blue-400" />
                                  <span className="text-[var(--text-muted)]">Node:</span>
                                  <span className="font-mono font-semibold text-[var(--text-primary)]">
                                    {hoveredNode.data.nodeName}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                                  <span className="text-[var(--text-muted)]">CPU:</span>
                                  <span className="font-mono font-semibold text-[var(--text-primary)]">
                                    {hoveredNode.data.cpuUsagePercent?.toFixed?.(1) ?? 'N/A'}%
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
                                  <span className="text-[var(--text-muted)]">RAM:</span>
                                  <span className="font-mono font-semibold text-[var(--text-primary)]">
                                    {hoveredNode.data.ramUsedMB != null
                                      ? (hoveredNode.data.ramUsedMB / 1024).toFixed(2)
                                      : 'N/A'}
                                    GB
                                  </span>
                                </div>
                                {isServiceUnavailable && (
                                  <div className="flex items-center gap-2 pt-1 border-t border-[var(--border)]">
                                    <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                                    <span className={`font-semibold ${availColorClass}`}>
                                      Service Not Available
                                    </span>
                                  </div>
                                )}
                                <div className="flex items-center gap-2 pt-1 border-t border-[var(--border)] mt-1">
                                  <Clock className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                                  <span className="text-[var(--text-muted)]">Pod Age:</span>
                                  <span className="font-mono font-semibold text-[var(--text-primary)]">
                                    {formatUptime(hoveredNode.data.uptimeSeconds)}
                                  </span>
                                </div>
                              </div>
                            </>
                          )
                        })()}
                    </div>
                  </div>
                )
              })()}
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center p-8">
            <EmptyState
              icon={<Database className="w-12 h-12 text-[var(--text-dim)]" />}
              message={getEmptyStateMessage(viewLevel, currentNodeId, currentServiceName)}
              action={
                viewLevel === 'services' || viewLevel === 'pods' ? (
                  <button
                    type="button"
                    onClick={handleBack}
                    className={cn(secondaryButtonClass, 'mt-4')}
                  >
                    Go Back
                  </button>
                ) : undefined
              }
            />
          </div>
        )}
      </div>
    </GraphShell>
  )
}

function createGraphTheme(resolvedTheme: 'light' | 'dark') {
  void resolvedTheme
  const rootStyles =
    typeof window !== 'undefined' ? window.getComputedStyle(document.documentElement) : null
  const getVar = (name: string, fallback: string) =>
    rootStyles?.getPropertyValue(name).trim() || fallback

  return {
    canvas: {
      background: getVar('--graph-canvas', '#0f172a'),
    },
    node: {
      fill: getVar('--graph-node-fill', '#64748b'),
      activeFill: getVar('--graph-node-active-fill', '#38bdf8'),
      opacity: 0.9,
      selectedOpacity: 1,
      inactiveOpacity: 0.4,
      label: {
        color: getVar('--graph-node-label', '#e2e8f0'),
        stroke: getVar('--graph-node-label-stroke', '#0f172a'),
        activeColor: getVar('--graph-edge-label-active', '#ffffff'),
      },
      subLabel: {
        color: getVar('--graph-node-sublabel', '#94a3b8'),
        stroke: 'transparent',
        activeColor: getVar('--graph-node-label', '#e2e8f0'),
      },
    },
    lasso: {
      border: `1px solid ${getVar('--graph-lasso-border', '#38bdf8')}`,
      background: getVar('--graph-lasso-bg', 'rgba(56, 189, 248, 0.1)'),
    },
    ring: {
      fill: getVar('--graph-ring-fill', '#334155'),
      activeFill: getVar('--graph-ring-active-fill', '#3b82f6'),
    },
    edge: {
      fill: getVar('--graph-edge-fill', '#475569'),
      activeFill: getVar('--graph-edge-active-fill', '#94a3b8'),
      opacity: 0.6,
      selectedOpacity: 1,
      inactiveOpacity: 0.1,
      label: {
        stroke: 'transparent',
        color: getVar('--graph-node-sublabel', '#94a3b8'),
        activeColor: getVar('--graph-edge-label', '#f8fafc'),
        fontSize: 6,
      },
    },
    arrow: {
      fill: getVar('--graph-arrow-fill', '#475569'),
      activeFill: getVar('--graph-arrow-active-fill', '#94a3b8'),
    },
  }
}
