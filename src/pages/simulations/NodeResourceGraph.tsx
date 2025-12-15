import { useState, useEffect, useMemo } from 'react'
import { GraphCanvas, GraphNode as ReagraphNode } from 'reagraph'
import { ChevronRight, ArrowLeft, Server, Package, Box, AlertCircle, Database } from 'lucide-react'
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
function getEmptyStateMessage(level: ViewLevel, nodeId: string | null, serviceName: string | null): string {
  if (level === 'nodes') return 'No node placement data available. Services are running but infrastructure metrics are not collected.'
  if (level === 'services') return `No services found on node ${nodeId}`
  return `No pods found for service ${serviceName}`
}

export default function NodeResourceGraph() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [services, setServices] = useState<ServiceWithPlacement[]>([])
  const [viewLevel, setViewLevel] = useState<ViewLevel>('nodes')
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([{ label: 'Nodes', level: 'nodes' }])
  const [currentNodeId, setCurrentNodeId] = useState<string | null>(null)
  const [currentServiceName, setCurrentServiceName] = useState<string | null>(null)
  const [hoveredNode, setHoveredNode] = useState<ReagraphNode | null>(null)
  const [serviceDependencyEdges, setServiceDependencyEdges] = useState<{ source: string; target: string }[]>([])

  // Fetch initial data
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      setError(null)

      try {
        const [servicesData, graphSnapshot] = await Promise.all([
          getServicesWithPlacement(),
          getDependencyGraphSnapshot().catch(() => ({ nodes: [], edges: [] })),
        ])

        setServices(servicesData.services || [])

        // Extract service dependency edges for Level 2
        const edges = graphSnapshot.edges?.map(e => ({
          source: e.source.split(':')[1] || e.source, // extract service name from "namespace:name"
          target: e.target.split(':')[1] || e.target,
        })) || []
        setServiceDependencyEdges(edges)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load infrastructure data')
        setServices([])
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  // Generate graph data based on current view level
  const graphData = useMemo(() => {
    if (viewLevel === 'nodes') {
      const nodeData = extractNodesFromServices(services)
      type NodeData = ReturnType<typeof extractNodesFromServices>[0]
      return {
        nodes: nodeData.map((n: NodeData) => ({
          id: n.id,
          label: n.label,
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
        let fill = '#ef4444' // red (low availability)
        if (s.availability >= 0.95) {
          fill = '#10b981' // green (high availability)
        } else if (s.availability >= 0.8) {
          fill = '#f59e0b' // yellow (medium availability)
        }
        return {
          id: s.id,
          label: s.label,
          fill,
          data: s,
        }
      })

      // Filter edges to only show connections between services on this node
      const serviceIds = new Set(servicesOnNode.map((s: ServiceData) => s.id))
      const edges = serviceDependencyEdges
        .filter(e => serviceIds.has(e.source) && serviceIds.has(e.target))
        .map((e, idx) => ({
          id: `edge-${idx}`,
          source: e.source,
          target: e.target,
        }))

      return { nodes, edges }
    }

    if (viewLevel === 'pods' && currentServiceName) {
      const service = services.find(s => s.name === currentServiceName)
      if (!service) return { nodes: [], edges: [] }

      const podData = extractPodsForService(service)
      type PodData = ReturnType<typeof extractPodsForService>[0]
      return {
        nodes: podData.map((p: PodData) => ({
          id: p.id,
          label: p.label,
          fill: getResourceColor(p.cpuUsagePercent),
          data: p,
        })),
        edges: [], // No edges at pod level
      }
    }

    return { nodes: [], edges: [] }
  }, [viewLevel, currentNodeId, currentServiceName, services, serviceDependencyEdges])

  // Handle node click based on current level
  const handleNodeClick = (node: ReagraphNode) => {
    if (viewLevel === 'nodes') {
      // Level 1 → Level 2: Show services on this node
      const nodeId = node.id
      setCurrentNodeId(nodeId)
      setViewLevel('services')
      setBreadcrumbs([
        { label: 'Nodes', level: 'nodes' },
        { label: nodeId, level: 'services', nodeId },
      ])
    } else if (viewLevel === 'services') {
      // Level 2 → Level 3: Show pods for this service
      const serviceName = node.id
      setCurrentServiceName(serviceName)
      setViewLevel('pods')
      setBreadcrumbs([
        { label: 'Nodes', level: 'nodes' },
        { label: currentNodeId || '', level: 'services', nodeId: currentNodeId || undefined },
        { label: serviceName, level: 'pods', serviceName },
      ])
    }
    // Level 3 (pods): No further drill-down
  }

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
                  className={`px-2 py-1 rounded transition-colors ${
                    idx === breadcrumbs.length - 1
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
          <div className="absolute inset-0">
            <GraphCanvas
              nodes={graphData.nodes}
              edges={graphData.edges}
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
              onNodePointerOver={(node) => setHoveredNode(node)}
              onNodePointerOut={() => setHoveredNode(null)}
            />

            {/* Hover Tooltip */}
            {hoveredNode && (
              <div className="absolute top-4 left-4 z-20 pointer-events-none bg-slate-900/90 backdrop-blur border border-slate-700 p-3 rounded-lg shadow-xl max-w-xs animate-in fade-in zoom-in-95 duration-200">
                {viewLevel === 'nodes' && hoveredNode.data && (
                  <>
                    <div className="font-semibold text-white mb-2">{hoveredNode.data.label}</div>
                    <div className="space-y-1 text-xs text-slate-300">
                      <div>Total Pods: <span className="font-medium">{hoveredNode.data.totalPods}</span></div>
                      <div>
                        CPU Usage: <span className="font-medium">{hoveredNode.data.cpuUsagePercent.toFixed(1)}%</span>
                        <span className="text-slate-500 ml-1">
                          ({hoveredNode.data.cpuUsed.toFixed(1)}/{hoveredNode.data.cpuTotal} cores)
                        </span>
                      </div>
                      <div>
                        RAM Usage: <span className="font-medium">{hoveredNode.data.ramUsageMB}MB / {hoveredNode.data.ramTotalMB}MB</span>
                        <span className="text-slate-500 ml-1">
                          ({hoveredNode.data.ramUsagePercent.toFixed(1)}%)
                        </span>
                      </div>
                    </div>
                  </>
                )}

                {viewLevel === 'services' && hoveredNode.data && (
                  <>
                    <div className="font-semibold text-white mb-2">{hoveredNode.data.label}</div>
                    <div className="space-y-1 text-xs text-slate-300">
                      <div>Namespace: <span className="font-medium">{hoveredNode.data.namespace}</span></div>
                      <div>Pods: <span className="font-medium">{hoveredNode.data.podCount}</span></div>
                      <div>Availability: <span className="font-medium">{(hoveredNode.data.availability * 100).toFixed(1)}%</span></div>
                    </div>
                  </>
                )}

                {viewLevel === 'pods' && hoveredNode.data && (
                  <>
                    <div className="font-semibold text-white mb-2">{hoveredNode.data.label}</div>
                    <div className="space-y-1 text-xs text-slate-300">
                      <div>Node: <span className="font-medium">{hoveredNode.data.nodeName}</span></div>
                      <div>CPU: <span className="font-medium">{hoveredNode.data.cpuUsagePercent.toFixed(1)}%</span></div>
                      <div>RAM: <span className="font-medium">{hoveredNode.data.ramUsedMB}MB</span></div>
                    </div>
                  </>
                )}
              </div>
            )}
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
