import { useState, useEffect, useMemo, useRef } from 'react'
import { toast } from 'react-hot-toast'
import { GraphCanvas, GraphNode as ReagraphNode } from 'reagraph'
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
} from 'lucide-react'
import EmptyState from '@/components/layout/EmptyState'
import { getServicesWithPlacement, getDependencyGraphSnapshot } from '@/lib/api'
import type { ServiceWithPlacement } from '@/lib/types'
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
  nodeMetricOverrides?: Record<string, {
    cpuUsed: number
    cpuTotal: number
    ramUsedMB: number
    ramTotalMB: number
  }> | null
}

export default function NodeResourceGraph({ simulatedService, nodeMetricOverrides }: NodeResourceGraphProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [services, setServices] = useState<ServiceWithPlacement[]>([])
  const [viewLevel, setViewLevel] = useState<ViewLevel>('nodes')
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([
    { label: 'Nodes', level: 'nodes' },
  ])
  const [currentNodeId, setCurrentNodeId] = useState<string | null>(null)
  const [currentServiceName, setCurrentServiceName] = useState<string | null>(null)
  const [hoveredNode, setHoveredNode] = useState<ReagraphNode | null>(null)
  const [mousePosition, setMousePosition] = useState<{ x: number; y: number } | null>(null)
  const [selections, setSelections] = useState<string[]>([])
  const [serviceDependencyEdges, setServiceDependencyEdges] = useState<
    { source: string; target: string }[]
  >([])

  const hasInitialDrillDown = useRef(false)

  // Fetch initial data with polling
  useEffect(() => {
    let isMounted = true

    const fetchData = async () => {
      // Don't set loading on poll, only on initial load or manual refresh if we wanted that
      if (services.length === 0) setLoading(true)
      setError(null)

      try {
        const [servicesData, graphSnapshot] = await Promise.all([
          getServicesWithPlacement(),
          getDependencyGraphSnapshot().catch(() => ({ nodes: [], edges: [] })),
        ])

        if (!isMounted) return

        let fetchedServices = servicesData.services || []

        // If we have a simulated service, merge it into the services list
        if (simulatedService) {
          const simServiceId = `${simulatedService.namespace}:${simulatedService.name}`

          // Check if it already exists (unlikely if new, but good practice)
          const exists = fetchedServices.find(s => `${s.namespace}:${s.name}` === simServiceId)

          if (!exists) {
            fetchedServices = [...fetchedServices, {
              name: simulatedService.name,
              namespace: simulatedService.namespace,
              podCount: simulatedService.replicas,
              availability: 1.0, // Assume perfect health for simulation visualization
              placement: {
                nodes: [{
                  node: simulatedService.nodeName,
                  resources: {
                    cpu: { usagePercent: 0, cores: 0 }, // Placeholder
                    ram: { usedMB: 0, totalMB: 0 } // Placeholder
                  },
                  pods: Array(simulatedService.replicas).fill(null).map((_, i) => ({
                    name: `${simulatedService.name}-sim-${i}`,
                    ramUsedMB: simulatedService.ramRequest,
                    cpuUsagePercent: (simulatedService.cpuRequest / 2) * 10, // Rough estimate
                    uptimeSeconds: 0 // New service
                  }))
                }]
              }
            }]
          }
        }

        setServices(fetchedServices)

        // Only drill down on initial load of simulation, not every poll
        // Use ref to ensure we only do this once per component mount/simulation run
        if (simulatedService && viewLevel === 'nodes' && !currentNodeId && !hasInitialDrillDown.current) {
          hasInitialDrillDown.current = true
          setViewLevel('services')
          setCurrentNodeId(simulatedService.nodeName)
          setBreadcrumbs([
            { label: 'Nodes', level: 'nodes' },
            { label: simulatedService.nodeName, level: 'services', nodeId: simulatedService.nodeName }
          ])
        }

        // Handle stale data notification
        if ((servicesData as any).stale) {
          toast('Displaying cached infrastructure data. Live updates may be delayed.', {
            id: 'stale-data-toast',
            duration: 4000,
            icon: '🕒',
          })
        }

        // Extract service dependency edges for Level 2
        let edges =
          graphSnapshot.edges?.map((e) => ({
            source: e.source.split(':')[1] || e.source, // extract service name from "namespace:name"
            target: e.target.split(':')[1] || e.target,
          })) || []

        // Inject simulated edges
        if (simulatedService && simulatedService.dependencies) {
          simulatedService.dependencies.forEach(dep => {
            const peerName = dep.serviceId.split(':')[1] || dep.serviceId
            if (dep.relation === 'calls') {
              edges.push({ source: simulatedService.name, target: peerName })
            } else {
              edges.push({ source: peerName, target: simulatedService.name })
            }
          })
        }

        setServiceDependencyEdges(edges)
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to load infrastructure data')
          // Don't clear services on error to prevent flickering
        }
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    fetchData() // Initial fetch

    const intervalId = setInterval(fetchData, 5000) // Poll every 5 seconds

    return () => {
      isMounted = false
      clearInterval(intervalId)
    }
  }, [simulatedService, services.length, viewLevel, currentNodeId])

  // Generate graph data based on current view level
  const graphData = useMemo(() => {
    if (viewLevel === 'nodes') {
      const nodeData = extractNodesFromServices(services)
      type NodeData = ReturnType<typeof extractNodesFromServices>[0]

      // Apply overrides if provided
      if (nodeMetricOverrides) {
        nodeData.forEach(n => {
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
        nodes: nodeData.map((n: NodeData) => ({
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
        const isSimulated = simulatedService &&
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
  }, [viewLevel, currentNodeId, currentServiceName, services, serviceDependencyEdges, nodeMetricOverrides])

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
      const previousLevel = newBreadcrumbs.at(-1)
      if (previousLevel) {
        handleBreadcrumbClick(previousLevel)
      }
    }
  }

  if (loading) {
    return (
      <div className="bg-slate-900 border border-slate-700 rounded-lg overflow-hidden flex flex-col h-[500px]">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-slate-400">Loading infrastructure data...</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-slate-900 border border-slate-700 rounded-lg overflow-hidden flex flex-col h-[500px]">
        <div className="flex-1 flex items-center justify-center p-8">
          <EmptyState
            icon={<AlertCircle className="w-12 h-12 text-red-500" />}
            message={error}
            action={
              <span className="text-xs text-slate-500 mt-2 block max-w-xs text-center">
                Check backend connectivity to Graph Engine
              </span>
            }
          />
        </div>
      </div>
    )
  }

  const hasData = graphData.nodes.length > 0

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg overflow-hidden flex flex-col h-[500px] relative">
      {/* Header with Breadcrumb and Back Button */}
      <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800/50">
        <div className="flex items-center gap-2">
          {breadcrumbs.length > 1 && (
            <button
              onClick={handleBack}
              className="p-1.5 rounded hover:bg-slate-700 transition-colors text-slate-400 hover:text-white"
              title="Go back"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <nav className="flex items-center gap-1 text-sm">
            {breadcrumbs.map((item, idx) => (
              <div key={`${item.level}-${item.label}-${idx}`} className="flex items-center gap-1">
                {idx > 0 && <ChevronRight className="w-4 h-4 text-slate-600" />}
                <button
                  onClick={() => handleBreadcrumbClick(item)}
                  className={`px-2 py-1 rounded transition-colors ${idx === breadcrumbs.length - 1
                    ? 'text-white font-medium bg-slate-700'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                    }`}
                >
                  {item.label}
                </button>
              </div>
            ))}
          </nav>
        </div>

        <div className="text-xs text-slate-500">
          {viewLevel === 'nodes' && `${graphData.nodes.length} nodes`}
          {viewLevel === 'services' && `${graphData.nodes.length} services on ${currentNodeId}`}
          {viewLevel === 'pods' && `${graphData.nodes.length} pods for ${currentServiceName}`}
        </div>
      </div>

      {/* Level indicator */}
      <div className="px-4 py-2 bg-slate-800/30 border-b border-slate-700">
        <div className="flex items-center gap-2 text-xs text-slate-400">
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
            className="absolute inset-0"
            onMouseMove={(e) => {
              setMousePosition({ x: e.clientX, y: e.clientY })
            }}
            role="presentation"
          >
            <GraphCanvas
              nodes={graphData.nodes}
              edges={graphData.edges}
              selections={selections}
              layoutType={viewLevel === 'nodes' ? 'circular2d' : 'forceDirected2d'}
              labelType="all"
              theme={{
                canvas: {
                  background: '#0f172a',
                },
                node: {
                  fill: '#64748b',
                  activeFill: '#38bdf8',
                  opacity: 0.9,
                  selectedOpacity: 1,
                  inactiveOpacity: 0.4,
                  label: {
                    color: '#e2e8f0',
                    stroke: '#0f172a',
                    activeColor: '#ffffff',
                  },
                  subLabel: {
                    color: '#94a3b8',
                    stroke: 'transparent',
                    activeColor: '#e2e8f0',
                  },
                },
                lasso: {
                  border: '1px solid #38bdf8',
                  background: 'rgba(56, 189, 248, 0.1)',
                },
                ring: {
                  fill: '#334155',
                  activeFill: '#3b82f6',
                },
                edge: {
                  fill: '#475569',
                  activeFill: '#94a3b8',
                  opacity: 0.6,
                  selectedOpacity: 1,
                  inactiveOpacity: 0.1,
                  label: {
                    stroke: 'transparent',
                    color: '#94a3b8',
                    activeColor: '#f8fafc',
                    fontSize: 6,
                  },
                },
                arrow: {
                  fill: '#475569',
                  activeFill: '#94a3b8',
                },
              }}
              onNodeClick={(node) => handleNodeClick(node)}
              onNodePointerOver={(node) => {
                setHoveredNode(node)
                setSelections([node.id])
              }}
              onNodePointerOut={() => {
                setHoveredNode(null)
                setSelections([])
              }}
              onCanvasClick={() => {
                setSelections([])
              }}
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
                    className="fixed z-50 pointer-events-none bg-slate-900/95 backdrop-blur-md border border-slate-600 rounded-lg shadow-2xl max-w-sm animate-in fade-in zoom-in-95 duration-150"
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
                            <span className="font-semibold text-white text-sm">
                              {hoveredNode.data.label}
                            </span>
                          </div>
                          <div className="space-y-2.5 text-xs">
                            <div className="flex items-center gap-2">
                              <Package className="w-3.5 h-3.5 text-purple-400" />
                              <span className="text-slate-400">Pods:</span>
                              <span className="font-mono font-semibold text-slate-200">
                                {hoveredNode.data.totalPods}
                              </span>
                            </div>
                            <div className="flex items-start gap-2">
                              <Cpu className="w-3.5 h-3.5 text-cyan-400 mt-0.5" />
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-slate-400">CPU:</span>
                                  <span className="font-mono font-semibold text-slate-200">
                                    {hoveredNode.data.cpuUsagePercent?.toFixed?.(1) ?? 'N/A'}%
                                  </span>
                                </div>
                                <div className="text-slate-500 mt-0.5">
                                  {hoveredNode.data.cpuUsed?.toFixed?.(1) ?? 'N/A'}/
                                  {hoveredNode.data.cpuTotal ?? 'N/A'} cores
                                </div>
                              </div>
                            </div>
                            <div className="flex items-start gap-2">
                              <HardDrive className="w-3.5 h-3.5 text-emerald-400 mt-0.5" />
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-slate-400">RAM:</span>
                                  <span className="font-mono font-semibold text-slate-200">
                                    {hoveredNode.data.ramUsageMB != null
                                      ? (hoveredNode.data.ramUsageMB / 1024).toFixed(2)
                                      : 'N/A'}
                                    GB
                                  </span>
                                </div>
                                <div className="text-slate-500 mt-0.5">
                                  {hoveredNode.data.ramTotalMB != null
                                    ? (hoveredNode.data.ramTotalMB / 1024).toFixed(2)
                                    : 'N/A'}
                                  GB total (
                                  {hoveredNode.data.ramUsagePercent?.toFixed?.(1) ?? 'N/A'}%)
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
                                  <div className="font-semibold text-white text-sm flex items-center gap-2">
                                    {hoveredNode.data.label}
                                    {hoveredNode.data.isSimulated && (
                                      <span className="text-[10px] bg-cyan-900 text-cyan-300 px-1.5 py-0.5 rounded border border-cyan-700">
                                        SIMULATED
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-xs text-slate-400">
                                    {hoveredNode.data.namespace}
                                  </div>
                                </div>
                              </div>
                              <div className="space-y-2 text-xs">
                                <div className="flex items-center gap-2">
                                  <Package className="w-3.5 h-3.5 text-purple-400" />
                                  <span className="text-slate-400">Pods:</span>
                                  <span className="font-mono font-semibold text-slate-200">
                                    {hoveredNode.data.podCount}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Server className={`w-3.5 h-3.5 ${availIconClass}`} />
                                  <span className="text-slate-400">Availability:</span>
                                  <span className={`font-mono font-semibold ${availColorClass}`}>
                                    {availPct !== null ? availPct.toFixed(1) : 'N/A'}%
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 pt-1 border-t border-slate-700/50 mt-1">
                                  <div className="w-3.5 h-3.5 flex items-center justify-center text-slate-400 text-[10px]">
                                    ⏱
                                  </div>
                                  <span className="text-slate-400">Avg Pod Age:</span>
                                  <span className="font-mono font-semibold text-slate-200">
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
                                <span className="font-semibold text-white text-sm">
                                  {hoveredNode.data.label}
                                </span>
                              </div>
                              <div className="space-y-2 text-xs">
                                <div className="flex items-center gap-2">
                                  <Server className="w-3.5 h-3.5 text-blue-400" />
                                  <span className="text-slate-400">Node:</span>
                                  <span className="font-mono font-semibold text-slate-200">
                                    {hoveredNode.data.nodeName}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                                  <span className="text-slate-400">CPU:</span>
                                  <span className="font-mono font-semibold text-slate-200">
                                    {hoveredNode.data.cpuUsagePercent?.toFixed?.(1) ?? 'N/A'}%
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
                                  <span className="text-slate-400">RAM:</span>
                                  <span className="font-mono font-semibold text-slate-200">
                                    {hoveredNode.data.ramUsedMB != null
                                      ? (hoveredNode.data.ramUsedMB / 1024).toFixed(2)
                                      : 'N/A'}
                                    GB
                                  </span>
                                </div>
                                {isServiceUnavailable && (
                                  <div className="flex items-center gap-2 pt-1 border-t border-slate-700">
                                    <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                                    <span className={`font-semibold ${availColorClass}`}>
                                      Service Not Available
                                    </span>
                                  </div>
                                )}
                                <div className="flex items-center gap-2 pt-1 border-t border-slate-700/50 mt-1">
                                  <div className="w-3.5 h-3.5 flex items-center justify-center text-slate-400 text-[10px]">
                                    ⏱
                                  </div>
                                  <span className="text-slate-400">Pod Age:</span>
                                  <span className="font-mono font-semibold text-slate-200">
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
              icon={<Database className="w-12 h-12 text-slate-600" />}
              message={getEmptyStateMessage(viewLevel, currentNodeId, currentServiceName)}
              action={
                viewLevel === 'services' || viewLevel === 'pods' ? (
                  <button
                    onClick={handleBack}
                    className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm transition-colors"
                  >
                    Go Back
                  </button>
                ) : undefined
              }
            />
          </div>
        )}
      </div>
    </div>
  )
}
