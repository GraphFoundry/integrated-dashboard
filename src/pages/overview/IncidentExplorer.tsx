import { useMemo, useState, useEffect, useRef } from 'react'
import { GraphCanvas, GraphNode as ReagraphNode, GraphEdge as ReagraphEdge, type GraphCanvasRef } from 'reagraph'
import { GraphNode, GraphEdge } from '@/lib/types'
import EmptyState from '@/components/layout/EmptyState'
import SkeletonBlock from '@/components/common/SkeletonBlock'
import { ModeButton } from './incidentExplorerUtils'
import { NodeDetailsDrawer } from './NodeDetailsDrawer'
import { getRiskColor } from './graphHelpers'
import { useDependencyGraphSnapshot } from '@/lib/useGraphStream'
import { useTheme } from '@/theme/useTheme'
import {
  Activity,
  Server,
  TrendingUp,
  AlertTriangle,
  ArrowRightLeft,
  ArrowRight,
  ShieldAlert,
  Network,
  GitCommit,
  Zap,
  AlertOctagon,
  ArrowDownToLine,
  ArrowUpFromLine,
  CircleAlert,
  Plus,
  Minus,
  LocateFixed,
} from 'lucide-react'

type GraphMode = 'impact' | 'suspect' | 'flow'

function ExplorerFrame({ children }: { readonly children: React.ReactNode }) {
  return (
    <div className="bg-[var(--surface-solid)] border border-[var(--border)] rounded-lg overflow-hidden flex flex-col h-[600px]">
      {children}
    </div>
  )
}

export default function IncidentExplorer() {
  const { snapshot } = useDependencyGraphSnapshot()
  const { resolvedTheme } = useTheme()
  const [loading, setLoading] = useState(true)
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
  const [isNodeHovered, setIsNodeHovered] = useState(false)
  const graphRef = useRef<GraphCanvasRef | null>(null)

  // Update state when WebSocket data arrives (replaces polling)
  useEffect(() => {
    if (snapshot) {
      setNodes(snapshot.nodes)
      setEdges(snapshot.edges)
      setMetadata(snapshot.metadata)
      setLoading(false)
    }
  }, [snapshot])

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

  const graphTheme = useMemo(() => createGraphTheme(resolvedTheme), [resolvedTheme])

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
      <ExplorerFrame>
        <div className="p-4 border-b border-[var(--border)] flex justify-between items-center bg-[var(--surface-soft)]" aria-busy="true">
          <SkeletonBlock variant="line" className="h-7 w-40" />
          <div className="flex gap-2">
            <SkeletonBlock variant="line" className="h-8 w-28 rounded-md" />
            <SkeletonBlock variant="line" className="h-8 w-28 rounded-md" />
            <SkeletonBlock variant="line" className="h-8 w-28 rounded-md" />
          </div>
        </div>
        <div className="px-4 py-2 bg-[var(--surface-subtle)] border-b border-[var(--border)]">
          <SkeletonBlock variant="line" className="h-4 w-2/3" />
        </div>
        <div className="flex-1 p-4">
          <SkeletonBlock variant="card" className="h-full w-full rounded-lg" />
        </div>
      </ExplorerFrame>
    )
  }

  return (
    <ExplorerFrame>
      <div className="relative flex h-full flex-col">
      {/* Header with Mode Controls */}
      <div className="p-4 border-b border-[var(--border)] flex justify-between items-center bg-[var(--surface-soft)]">
        <h3 className="text-lg font-medium text-[var(--text-primary)]">Incident Explorer</h3>
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
      <div className="px-4 py-2 bg-[var(--surface-subtle)] border-b border-[var(--border)]">
        <div className="flex justify-between items-center">
          <div className="text-xs text-[var(--text-muted)]">
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
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-[var(--border)] text-xs text-[var(--text-dim)]">
            <div className="flex items-center gap-4">
              {metadata.nodeCount !== undefined && <span>{metadata.nodeCount} services</span>}
              {metadata.edgeCount !== undefined && <span>{metadata.edgeCount} dependencies</span>}
            </div>
            <div className="flex items-center gap-2">
              {metadata.stale && (
                <span className="inline-flex items-center gap-1 text-yellow-400">
                  <CircleAlert className="h-3.5 w-3.5" />
                  Stale data
                </span>
              )}
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
              nodes={reagraphNodes}
              edges={reagraphEdges}
              selections={selections}
              actives={actives}
              layoutType="radialOut2d"
              labelType="all"
              theme={graphTheme}
              onNodeClick={(node) => handleNodeClick(node)}
              onNodePointerOver={(node) => {
                setHoveredNode(node.data as GraphNode)
                setIsNodeHovered(true)

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
                setIsNodeHovered(false)
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
                setIsNodeHovered(false)
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
          <div className="h-full flex flex-col items-center justify-center p-8 bg-[var(--graph-canvas)]">
            <EmptyState
              icon={<Network className="h-12 w-12 text-[var(--color-emerald-300)]" />}
              message="No dependency graph data available"
              action={
                <span className="text-xs text-[var(--text-dim)] mt-2 block max-w-xs text-center">
                  Traffic is required to discover service dependencies. Try running a load test or
                  waiting for traffic to flow.
                </span>
              }
            />
          </div>
        )}
      </div>
      </div>
    </ExplorerFrame>
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
  const tooltipHeight = 420
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

    const inDegree = upstreamEdges.length
    const outDegree = downstreamEdges.length

    return { blastRadiusCount, totalImpactedRps, suspects, inboundRps, outboundRps, inDegree, outDegree }
  }, [node, edges, nodeMap])

  return (
    <div
      className="fixed z-50 pointer-events-none bg-[var(--surface-contrast)] backdrop-blur-md border border-[var(--border-strong)] rounded-lg shadow-2xl animate-in fade-in zoom-in-95 duration-75"
      style={{
        left: `${left}px`,
        top: `${top}px`,
        width: `${tooltipWidth}px`,
      }}
    >
      <div className="p-3">
        {/* Header */}
        <div className="flex items-center gap-2 mb-3 border-b border-[var(--border)] pb-2">
          <div
            className="w-3 h-3 rounded-full ring-2 ring-[var(--border)] shadow-sm"
            style={{ backgroundColor: getRiskColor(node.riskLevel) }}
          />
          <div className="overflow-hidden">
            <div className="font-bold text-[var(--text-primary)] text-sm truncate" title={node.name}>
              {node.name}
            </div>
            <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-semibold">
              {node.namespace}
            </div>
          </div>
          <div className="ml-auto flex items-center gap-1 bg-[var(--surface-solid)] rounded px-1.5 py-0.5">
            <Server className="w-3 h-3 text-[var(--text-muted)]" />
            <span className="text-xs font-mono text-[var(--text-secondary)]">
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
                  <div className="text-lg font-bold text-[var(--text-primary)]">{analysis.blastRadiusCount}</div>
                  <div className="text-[10px] text-[var(--text-muted)]">Services at Risk</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-[var(--text-primary)]">
                    {analysis.totalImpactedRps.toFixed(1)}
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)]">Impacted RPS</div>
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
                    <div key={i} className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
                      <span className="truncate max-w-[120px]">{s.node?.name}</span>
                      <span className="text-red-400 font-bold text-[10px] px-1 bg-red-900/40 rounded">
                        {s.node?.riskLevel}
                      </span>
                    </div>
                  ))}
                  {analysis.suspects.length > 2 && (
                    <div className="text-[10px] text-[var(--text-dim)] italic">
                      + {analysis.suspects.length - 2} more...
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-xs text-[var(--text-muted)] italic">No risky upstream services found.</div>
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
                  <div className="text-xs text-[var(--text-muted)] mb-0.5">Inbound</div>
                  <div className="text-sm font-bold text-[var(--text-primary)] font-mono">
                    {analysis.inboundRps.toFixed(1)}
                  </div>
                  <div className="text-[9px] text-[var(--text-dim)]">req/sec</div>
                </div>
                <div className="text-[var(--text-dim)]">
                  <ArrowRight className="w-4 h-4" />
                </div>
                <div className="text-center flex-1">
                  <div className="text-xs text-[var(--text-muted)] mb-0.5">Outbound</div>
                  <div className="text-sm font-bold text-[var(--text-primary)] font-mono">
                    {analysis.outboundRps.toFixed(1)}
                  </div>
                  <div className="text-[9px] text-[var(--text-dim)]">req/sec</div>
                </div>
              </div>
            </div>
          )}

          {/* Core Metrics */}
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[var(--border)]">
            <div className="bg-[var(--surface-soft)] rounded p-1.5 px-2">
              <div className="text-[10px] text-[var(--text-muted)] mb-0.5">Availability</div>
              <div className="flex items-center gap-1.5">
                <TrendingUp
                  className={`w-3 h-3 ${(node.availabilityPct ?? 100) > 99 ? 'text-green-400' : 'text-red-400'
                    }`}
                />
                <span className="font-mono text-xs font-semibold text-[var(--text-primary)]">
                  {node.availabilityPct !== undefined ? node.availabilityPct.toFixed(1) : '-'}%
                </span>
              </div>
            </div>
            <div className="bg-[var(--surface-soft)] rounded p-1.5 px-2">
              <div className="text-[10px] text-[var(--text-muted)] mb-0.5">Error Rate</div>
              <div className="flex items-center gap-1.5">
                <AlertOctagon className={`w-3 h-3 ${(node.errorRatePct ?? 0) > 1 ? 'text-red-400' : 'text-green-400'}`} />
                <span className="font-mono text-xs font-semibold text-[var(--text-primary)]">
                  {node.errorRatePct !== undefined ? node.errorRatePct.toFixed(2) : '-'}%
                </span>
              </div>
            </div>
            <div className="bg-[var(--surface-soft)] rounded p-1.5 px-2">
              <div className="text-[10px] text-[var(--text-muted)] mb-0.5">RPS</div>
              <div className="flex items-center gap-1.5">
                <Zap className="w-3 h-3 text-yellow-400" />
                <span className="font-mono text-xs font-semibold text-[var(--text-primary)]">
                  {node.reqRate !== undefined ? node.reqRate.toFixed(1) : '-'}
                </span>
              </div>
            </div>
            <div className="bg-[var(--surface-soft)] rounded p-1.5 px-2">
              <div className="text-[10px] text-[var(--text-muted)] mb-0.5">Latency (P95)</div>
              <div className="flex items-center gap-1.5">
                <Activity className="w-3 h-3 text-sky-400" />
                <span className="font-mono text-xs font-semibold text-[var(--text-primary)]">
                  {node.latencyP95Ms !== undefined ? Math.round(node.latencyP95Ms) : '-'}
                  <span className="text-[10px] text-[var(--text-dim)] font-sans ml-0.5">ms</span>
                </span>
              </div>
            </div>
          </div>

          {/* Topology Metrics */}
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[var(--border)]">
            <div className="bg-[var(--surface-soft)] rounded p-1.5 px-2">
              <div className="text-[10px] text-[var(--text-muted)] mb-0.5">Page Rank</div>
              <div className="flex items-center gap-1.5">
                <Network className="w-3 h-3 text-purple-400" />
                <span className="font-mono text-xs font-semibold text-[var(--text-primary)]">
                  {node.pageRank !== undefined ? node.pageRank.toFixed(4) : '-'}
                </span>
              </div>
            </div>
            <div className="bg-[var(--surface-soft)] rounded p-1.5 px-2">
              <div className="text-[10px] text-[var(--text-muted)] mb-0.5">Betweenness</div>
              <div className="flex items-center gap-1.5">
                <GitCommit className="w-3 h-3 text-pink-400" />
                <span className="font-mono text-xs font-semibold text-[var(--text-primary)]">
                  {node.betweenness !== undefined ? node.betweenness.toFixed(4) : '-'}
                </span>
              </div>
            </div>
            <div className="bg-[var(--surface-soft)] rounded p-1.5 px-2">
              <div className="text-[10px] text-[var(--text-muted)] mb-0.5">In-Degree</div>
              <div className="flex items-center gap-1.5">
                <ArrowDownToLine className="w-3 h-3 text-emerald-400" />
                <span className="font-mono text-xs font-semibold text-[var(--text-primary)]">
                  {analysis.inDegree}
                </span>
              </div>
            </div>
            <div className="bg-[var(--surface-soft)] rounded p-1.5 px-2">
              <div className="text-[10px] text-[var(--text-muted)] mb-0.5">Out-Degree</div>
              <div className="flex items-center gap-1.5">
                <ArrowUpFromLine className="w-3 h-3 text-indigo-400" />
                <span className="font-mono text-xs font-semibold text-[var(--text-primary)]">
                  {analysis.outDegree}
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
      <span className="text-[var(--text-muted)]">{label}</span>
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

function createGraphTheme(resolvedTheme: 'light' | 'dark') {
  void resolvedTheme
  const rootStyles = typeof window !== 'undefined'
    ? window.getComputedStyle(document.documentElement)
    : null
  const getVar = (name: string, fallback: string) => rootStyles?.getPropertyValue(name).trim() || fallback

  return {
    canvas: {
      background: getVar('--graph-canvas', '#0f172a'),
    },
    node: {
      fill: getVar('--graph-node-fill', '#64748b'),
      activeFill: getVar('--graph-node-active-fill', '#38bdf8'),
      opacity: 0.9,
      selectedOpacity: 1,
      inactiveOpacity: 0.2,
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
        fill: getVar('--graph-edge-label', '#f8fafc'),
        color: getVar('--graph-edge-label', '#f8fafc'),
        activeColor: getVar('--graph-edge-label-active', '#ffffff'),
        fontSize: 6,
      },
    },
    arrow: {
      fill: getVar('--graph-arrow-fill', '#475569'),
      activeFill: getVar('--graph-arrow-active-fill', '#94a3b8'),
    },
  }
}
