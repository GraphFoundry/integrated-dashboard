import { useMemo, useState, useEffect } from 'react'
import { GraphCanvas, GraphNode as ReagraphNode, GraphEdge as ReagraphEdge } from 'reagraph'
import { GraphNode, GraphEdge } from '@/lib/types'
import EmptyState from '@/components/layout/EmptyState'
import { ModeButton } from './incidentExplorerUtils'
import { NodeDetailsDrawer } from './NodeDetailsDrawer'
import { getRiskColor } from './graphHelpers'
import { getDependencyGraphSnapshot } from '@/lib/api'
import {
  Activity,
  Server,
  TrendingUp,
  AlertTriangle,
  ArrowRightLeft,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react'

type GraphMode = 'impact' | 'suspect' | 'flow'

export default function IncidentExplorer() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nodes, setNodes] = useState<GraphNode[]>([])
  const [edges, setEdges] = useState<GraphEdge[]>([])
  const [metadata, setMetadata] = useState<
    | {
      stale?: boolean
      lastUpdatedSecondsAgo?: number | null
      windowMinutes?: number
      nodeCount?: number
      edgeCount?: number
      nodesWithMetrics?: number
      edgesWithMetrics?: number
      generatedAt?: string
    }
    | undefined
  >(undefined)
  const [mode, setMode] = useState<GraphMode>('impact')
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  const [selections, setSelections] = useState<string[]>([])
  const [actives, setActives] = useState<string[]>([])
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null)
  const [mousePosition, setMousePosition] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    let isMounted = true
    const fetchGraphData = async () => {
      // Only show global loading on first fetch
      if (nodes.length === 0) {
        setLoading(true)
      }
      setError(null)

      try {
        const snapshot = await getDependencyGraphSnapshot()
        if (isMounted) {
          setNodes(snapshot.nodes)
          setEdges(snapshot.edges)
          setMetadata(snapshot.metadata)
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to load graph data')
          // Don't clear nodes on transient error to prevent flash
        }
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    fetchGraphData()
    const interval = setInterval(fetchGraphData, 5000)

    return () => {
      isMounted = false
      clearInterval(interval)
    }
  }, []) // Empty dependency array as we want this to run once on mount

  // Convert to Reagraph format
  const reagraphNodes: ReagraphNode[] = useMemo(() => {
    return nodes.map((n) => ({
      id: n.id,
      label: n.name,
      fill: getRiskColor(n.riskLevel),
      data: n,
    }))
  }, [nodes])

  const reagraphEdges: ReagraphEdge[] = useMemo(() => {
    return edges.map((e) => ({
      source: e.source,
      target: e.target,
      id: e.id,
      data: e,
      label: e.reqRate ? `${e.reqRate} RPS` : undefined,
    }))
  }, [edges])

  // Helper mapping for fast lookup
  const nodeMap = useMemo(() => {
    const map = new Map<string, GraphNode>()
    nodes.forEach((n) => map.set(n.id, n))
    return map
  }, [nodes])

  // Recompute highlights when mode changes (if a node is selected)
  useEffect(() => {
    if (!selectedNode) return

    const nodeId = selectedNode.id

    if (mode === 'impact') {
      const downstreamNodes = getDownstreamNodes(nodeId, reagraphEdges, 5) // Deep traversal for blast radius
      setSelections([nodeId, ...downstreamNodes])
      const downstreamEdges = reagraphEdges
        .filter((e) => e.source === nodeId && downstreamNodes.includes(e.target))
        .map((e) => e.id)
      setActives(downstreamEdges)
    } else if (mode === 'suspect') {
      const upstreamNodes = getUpstreamNodes(nodeId, reagraphEdges, 5)
      setSelections([nodeId, ...upstreamNodes])
      const upstreamEdges = reagraphEdges
        .filter((e) => upstreamNodes.includes(e.source) && e.target === nodeId)
        .map((e) => e.id)
      setActives(upstreamEdges)
    } else if (mode === 'flow') {
      const connectedNodes: string[] = []
      const connectedEdges: string[] = []
      reagraphEdges.forEach((edge) => {
        if (edge.source === nodeId) {
          connectedNodes.push(edge.target)
          connectedEdges.push(edge.id)
        }
        if (edge.target === nodeId) {
          connectedNodes.push(edge.source)
          connectedEdges.push(edge.id)
        }
      })
      setSelections([nodeId, ...connectedNodes])
      setActives(connectedEdges)
    }
  }, [mode, selectedNode, reagraphEdges])

  const handleNodeClick = (node: ReagraphNode) => {
    const clickedNodeData = node.data as GraphNode
    setSelectedNode(clickedNodeData)
    setHoveredNode(null)
    setMousePosition(null)
  }

  const hasData = reagraphNodes.length > 0

  if (loading && nodes.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-700 rounded-lg overflow-hidden flex flex-col h-[600px]">
        <div className="p-4 border-b border-slate-700 bg-slate-800/50">
          <h3 className="text-lg font-medium text-white">Incident Explorer</h3>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-slate-400 animate-pulse">Scanning infrastructure topology...</div>
        </div>
      </div>
    )
  }

  if (error && nodes.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-700 rounded-lg overflow-hidden flex flex-col h-[600px]">
        <div className="p-4 border-b border-slate-700 bg-slate-800/50">
          <h3 className="text-lg font-medium text-white">Incident Explorer</h3>
        </div>
        <div className="flex-1 flex items-center justify-center p-8">
          <EmptyState
            icon="⚠️"
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

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg overflow-hidden flex flex-col h-[600px] relative">
      {/* Header with Mode Controls */}
      <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800/50">
        <h3 className="text-lg font-medium text-white">Incident Explorer</h3>
        <div className="flex gap-2">
          <ModeButton active={mode === 'impact'} onClick={() => setMode('impact')}>
            Impact Analysis
          </ModeButton>
          <ModeButton active={mode === 'suspect'} onClick={() => setMode('suspect')}>
            Suspect Search
          </ModeButton>
          <ModeButton active={mode === 'flow'} onClick={() => setMode('flow')}>
            Traffic Flow
          </ModeButton>
        </div>
      </div>

      {/* Mode Legend */}
      <div className="px-4 py-2 bg-slate-800/30 border-b border-slate-700">
        <div className="flex justify-between items-center">
          <div className="text-xs text-slate-400">
            {mode === 'impact' && (
              <span className="flex items-center gap-2">
                <AlertTriangle className="w-3 h-3 text-orange-400" />
                Select a service to see its <strong>Blast Radius</strong> (what breaks if it fails)
              </span>
            )}
            {mode === 'suspect' && (
              <span className="flex items-center gap-2">
                <ShieldAlert className="w-3 h-3 text-red-400" />
                Select a service to find <strong>Root Cause Candidates</strong> (upstream failures)
              </span>
            )}
            {mode === 'flow' && (
              <span className="flex items-center gap-2">
                <ArrowRightLeft className="w-3 h-3 text-blue-400" />
                Select a service to analyze <strong>Traffic Volume</strong> (inbound/outbound)
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs">
            <LegendItem color="CRITICAL" label="Critical" />
            <LegendItem color="HIGH" label="High" />
            <LegendItem color="MEDIUM" label="Medium" />
            <LegendItem color="LOW" label="Low" />
            <LegendItem color="UNKNOWN" label="Unknown" />
          </div>
        </div>
        {/* Metadata stats row */}
        {metadata && (
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-700/50 text-xs text-slate-500">
            <div className="flex items-center gap-4">
              {metadata.nodeCount !== undefined && <span>{metadata.nodeCount} services</span>}
              {metadata.edgeCount !== undefined && <span>{metadata.edgeCount} dependencies</span>}
            </div>
            <div className="flex items-center gap-2">
              {metadata.stale && <span className="text-yellow-400">⚠️ Stale data</span>}
              {metadata.lastUpdatedSecondsAgo !== undefined &&
                metadata.lastUpdatedSecondsAgo !== null && (
                  <span>Updated {metadata.lastUpdatedSecondsAgo}s ago</span>
                )}
            </div>
          </div>
        )}
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
              nodes={reagraphNodes}
              edges={reagraphEdges}
              selections={selections}
              actives={actives}
              layoutType="radialOut2d"
              labelType="all"
              theme={darkGraphTheme}
              onNodeClick={(node) => handleNodeClick(node)}
              onNodePointerOver={(node) => {
                setHoveredNode(node.data as GraphNode)

                // Highlight upstream/downstream on hover (if no node selected)
                if (!selectedNode) {
                  const nodeId = node.id
                  if (mode === 'impact') {
                    const downstreamNodes = getDownstreamNodes(nodeId, reagraphEdges, 5)
                    setSelections([nodeId, ...downstreamNodes])
                    const downstreamEdges = reagraphEdges
                      .filter((e) => e.source === nodeId && downstreamNodes.includes(e.target))
                      .map((e) => e.id)
                    setActives(downstreamEdges)
                  } else if (mode === 'suspect') {
                    const upstreamNodes = getUpstreamNodes(nodeId, reagraphEdges, 5)
                    setSelections([nodeId, ...upstreamNodes])
                    const upstreamEdges = reagraphEdges
                      .filter((e) => upstreamNodes.includes(e.source) && e.target === nodeId)
                      .map((e) => e.id)
                    setActives(upstreamEdges)
                  } else if (mode === 'flow') {
                    const connectedNodes: string[] = []
                    const connectedEdges: string[] = []
                    reagraphEdges.forEach((edge) => {
                      if (edge.source === nodeId) {
                        connectedNodes.push(edge.target)
                        connectedEdges.push(edge.id)
                      }
                      if (edge.target === nodeId) {
                        connectedNodes.push(edge.source)
                        connectedEdges.push(edge.id)
                      }
                    })
                    setSelections([nodeId, ...connectedNodes])
                    setActives(connectedEdges)
                  }
                }
              }}
              onNodePointerOut={() => {
                setHoveredNode(null)
                // Clear hover highlights if no node is selected
                if (!selectedNode) {
                  setSelections([])
                  setActives([])
                }
              }}
              onCanvasClick={() => {
                setSelections([])
                setActives([])
                setSelectedNode(null)
              }}
            />

            {/* Hover Tooltip */}
            {hoveredNode &&
              !selectedNode &&
              mousePosition && (
                <GraphTooltip
                  node={hoveredNode}
                  edges={edges}
                  nodeMap={nodeMap}
                  mode={mode}
                  position={mousePosition}
                />
              )}

            {/* Node Details Drawer */}
            {selectedNode && (
              <NodeDetailsDrawer
                node={selectedNode}
                nodes={nodes}
                edges={edges}
                onClose={() => {
                  setSelectedNode(null)
                  setSelections([])
                  setActives([])
                }}
              />
            )}
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center p-8 bg-[#0f172a]">
            <EmptyState
              icon="🕸️"
              message="No dependency graph data available"
              action={
                <span className="text-xs text-slate-500 mt-2 block max-w-xs text-center">
                  Traffic is required to discover service dependencies. Try running a load test or
                  waiting for traffic to flow.
                </span>
              }
            />
          </div>
        )}
      </div>
    </div>
  )
}

// ----------------------------------------------------------------------
// Tooltip Component
// ----------------------------------------------------------------------

function GraphTooltip({
  node,
  edges,
  nodeMap,
  mode,
  position,
}: {
  node: GraphNode
  edges: GraphEdge[]
  nodeMap: Map<string, GraphNode>
  mode: GraphMode
  position: { x: number; y: number }
}) {
  const tooltipWidth = 280
  const tooltipHeight = 220
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight

  let left = position.x + 16
  let top = position.y + 16

  if (left + tooltipWidth > viewportWidth) left = position.x - tooltipWidth - 16
  if (top + tooltipHeight > viewportHeight) top = position.y - tooltipHeight - 16
  if (left < 16) left = 16
  if (top < 16) top = 16

  // Analysis Calculations
  const analysis = useMemo(() => {
    // 1. Blast Radius (Impact)
    const downstreamEdges = edges.filter((e) => e.source === node.id)
    const downstreamIds = downstreamEdges.map((e) => e.target)
    const blastRadiusCount = downstreamIds.length
    const totalImpactedRps = downstreamEdges.reduce((sum, e) => sum + (e.reqRate || 0), 0)

    // 2. Suspects (Upstream Risks)
    const upstreamEdges = edges.filter((e) => e.target === node.id)
    const suspects = upstreamEdges
      .map((e) => ({
        node: nodeMap.get(e.source),
        edge: e,
      }))
      .filter((item) => item.node && (item.node.riskLevel === 'CRITICAL' || item.node.riskLevel === 'HIGH'))
      .sort((_, b) => (b.node?.riskLevel === 'CRITICAL' ? 1 : -1)) // Critical first

    // 3. Flow (Traffic)
    const inboundRps = upstreamEdges.reduce((sum, e) => sum + (e.reqRate || 0), 0)
    const outboundRps = downstreamEdges.reduce((sum, e) => sum + (e.reqRate || 0), 0)

    return { blastRadiusCount, totalImpactedRps, suspects, inboundRps, outboundRps }
  }, [node, edges, nodeMap])

  return (
    <div
      className="fixed z-50 pointer-events-none bg-[#1e293b]/95 backdrop-blur-md border border-slate-600 rounded-lg shadow-2xl animate-in fade-in zoom-in-95 duration-75"
      style={{
        left: `${left}px`,
        top: `${top}px`,
        width: `${tooltipWidth}px`,
      }}
    >
      <div className="p-3">
        {/* Header */}
        <div className="flex items-center gap-2 mb-3 border-b border-slate-700/50 pb-2">
          <div
            className="w-3 h-3 rounded-full ring-2 ring-slate-700 shadow-sm"
            style={{ backgroundColor: getRiskColor(node.riskLevel) }}
          />
          <div className="overflow-hidden">
            <div className="font-bold text-white text-sm truncate" title={node.name}>
              {node.name}
            </div>
            <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
              {node.namespace}
            </div>
          </div>
          <div className="ml-auto flex items-center gap-1 bg-slate-800 rounded px-1.5 py-0.5">
            <Server className="w-3 h-3 text-slate-400" />
            <span className="text-xs font-mono text-slate-300">
              {node.podCount !== undefined ? node.podCount : '-'}
            </span>
          </div>
        </div>

        {/* Mode-Specific Insights */}
        <div className="space-y-3">
          {mode === 'impact' && (
            <div className="bg-orange-500/10 rounded p-2 border border-orange-500/20">
              <div className="text-[10px] text-orange-400 uppercase font-bold mb-1 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Blast Radius
              </div>
              <div className="grid grid-cols-2 gap-2 text-center">
                <div>
                  <div className="text-lg font-bold text-white">{analysis.blastRadiusCount}</div>
                  <div className="text-[10px] text-slate-400">Services at Risk</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-white">
                    {analysis.totalImpactedRps.toFixed(1)}
                  </div>
                  <div className="text-[10px] text-slate-400">Impacted RPS</div>
                </div>
              </div>
            </div>
          )}

          {mode === 'suspect' && (
            <div className="bg-red-500/10 rounded p-2 border border-red-500/20">
              <div className="text-[10px] text-red-400 uppercase font-bold mb-1 flex items-center gap-1">
                <ShieldAlert className="w-3 h-3" /> Potential Suspects
              </div>
              {analysis.suspects.length > 0 ? (
                <div className="space-y-1">
                  {analysis.suspects.slice(0, 2).map((s, i) => (
                    <div key={i} className="flex items-center justify-between text-xs text-slate-300">
                      <span className="truncate max-w-[120px]">{s.node?.name}</span>
                      <span className="text-red-400 font-bold text-[10px] px-1 bg-red-900/40 rounded">
                        {s.node?.riskLevel}
                      </span>
                    </div>
                  ))}
                  {analysis.suspects.length > 2 && (
                    <div className="text-[10px] text-slate-500 italic">
                      + {analysis.suspects.length - 2} more...
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-xs text-slate-400 italic">No risky upstream services found.</div>
              )}
            </div>
          )}

          {mode === 'flow' && (
            <div className="bg-blue-500/10 rounded p-2 border border-blue-500/20">
              <div className="text-[10px] text-blue-400 uppercase font-bold mb-1 flex items-center gap-1">
                <ArrowRightLeft className="w-3 h-3" /> Traffic Flow
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="text-center flex-1">
                  <div className="text-xs text-slate-400 mb-0.5">Inbound</div>
                  <div className="text-sm font-bold text-white font-mono">
                    {analysis.inboundRps.toFixed(1)}
                  </div>
                  <div className="text-[9px] text-slate-500">req/sec</div>
                </div>
                <div className="text-slate-600">
                  <ArrowRight className="w-4 h-4" />
                </div>
                <div className="text-center flex-1">
                  <div className="text-xs text-slate-400 mb-0.5">Outbound</div>
                  <div className="text-sm font-bold text-white font-mono">
                    {analysis.outboundRps.toFixed(1)}
                  </div>
                  <div className="text-[9px] text-slate-500">req/sec</div>
                </div>
              </div>
            </div>
          )}

          {/* Core Metrics */}
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-700/50">
            <div className="bg-slate-800/50 rounded p-1.5 px-2">
              <div className="text-[10px] text-slate-400 mb-0.5">Availability</div>
              <div className="flex items-center gap-1.5">
                <TrendingUp
                  className={`w-3 h-3 ${(node.availabilityPct ?? 100) > 99 ? 'text-green-400' : 'text-red-400'
                    }`}
                />
                <span className="font-mono text-xs font-semibold text-white">
                  {node.availabilityPct !== undefined ? node.availabilityPct.toFixed(1) : '-'}%
                </span>
              </div>
            </div>
            <div className="bg-slate-800/50 rounded p-1.5 px-2">
              <div className="text-[10px] text-slate-400 mb-0.5">Latency (P95)</div>
              <div className="flex items-center gap-1.5">
                <Activity className="w-3 h-3 text-sky-400" />
                <span className="font-mono text-xs font-semibold text-white">
                  {node.latencyP95Ms !== undefined ? Math.round(node.latencyP95Ms) : '-'}
                  <span className="text-[10px] text-slate-500 font-sans ml-0.5">ms</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ----------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1">
      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: getRiskColor(color) }} />
      <span className="text-slate-400">{label}</span>
    </div>
  )
}

function getDownstreamNodes(nodeId: string, edges: ReagraphEdge[], maxHops: number): string[] {
  const visited = new Set<string>()
  const queue: Array<{ id: string; hop: number }> = [{ id: nodeId, hop: 0 }]

  while (queue.length > 0) {
    const current = queue.shift()!
    if (current.hop >= maxHops) continue

    edges.forEach((edge) => {
      if (edge.source === current.id && !visited.has(edge.target)) {
        visited.add(edge.target)
        queue.push({ id: edge.target, hop: current.hop + 1 })
      }
    })
  }
  return Array.from(visited)
}

function getUpstreamNodes(nodeId: string, edges: ReagraphEdge[], maxHops: number): string[] {
  const visited = new Set<string>()
  const queue: Array<{ id: string; hop: number }> = [{ id: nodeId, hop: 0 }]

  while (queue.length > 0) {
    const current = queue.shift()!
    if (current.hop >= maxHops) continue

    edges.forEach((edge) => {
      if (edge.target === current.id && !visited.has(edge.source)) {
        visited.add(edge.source)
        queue.push({ id: edge.source, hop: current.hop + 1 })
      }
    })
  }

  return Array.from(visited)
}

const darkGraphTheme = {
  canvas: {
    background: '#0f172a',
  },
  node: {
    fill: '#64748b',
    activeFill: '#38bdf8',
    opacity: 0.9,
    selectedOpacity: 1,
    inactiveOpacity: 0.2,
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
      fill: '#ffffffff',
      color: '#ffffffff',
      activeColor: '#ffffffff',
      fontSize: 6,
    },
  },
  arrow: {
    fill: '#475569',
    activeFill: '#94a3b8',
  },
}
