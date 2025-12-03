import { useMemo, useState, useEffect } from 'react'
import { GraphCanvas, GraphNode as ReagraphNode, GraphEdge as ReagraphEdge } from 'reagraph'
import { GraphNode, GraphEdge } from '@/lib/types'
import EmptyState from '@/components/layout/EmptyState'
import { ModeButton } from './incidentExplorerUtils'
import { NodeDetailsDrawer } from './NodeDetailsDrawer'
import { getRiskColor } from './graphHelpers'
import { getDependencyGraphSnapshot } from '@/lib/api'

type GraphMode = 'impact' | 'suspect' | 'flow'

export default function IncidentExplorer() {
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [nodes, setNodes] = useState<GraphNode[]>([])
    const [edges, setEdges] = useState<GraphEdge[]>([])
    const [mode, setMode] = useState<GraphMode>('impact')
    const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
    const [selections, setSelections] = useState<string[]>([])
    const [actives, setActives] = useState<string[]>([])
    const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null)

    useEffect(() => {
        const fetchGraphData = async () => {
            setLoading(true)
            setError(null)

            try {
                const snapshot = await getDependencyGraphSnapshot()
                setNodes(snapshot.nodes)
                setEdges(snapshot.edges)
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load graph data')
                setNodes([])
                setEdges([])
            } finally {
                setLoading(false)
            }
        }

        fetchGraphData()
    }, [])

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
        return edges.map(e => ({
            source: e.source,
            target: e.target,
            id: e.id,
            data: e,
        }))
    }, [edges])

    // Recompute highlights when mode changes (if a node is selected)
    useEffect(() => {
        if (!selectedNode) return

        const nodeId = selectedNode.id

        if (mode === 'impact') {
            const downstreamNodes = getDownstreamNodes(nodeId, reagraphEdges, 3)
            setSelections([nodeId, ...downstreamNodes])
            const downstreamEdges = reagraphEdges
                .filter(e => downstreamNodes.includes(e.target) || e.source === nodeId)
                .map(e => e.id)
            setActives(downstreamEdges)
        } else if (mode === 'suspect') {
            const upstreamNodes = getUpstreamNodes(nodeId, reagraphEdges, 3)
            setSelections([nodeId, ...upstreamNodes])
            const upstreamEdges = reagraphEdges
                .filter(e => upstreamNodes.includes(e.source) || e.target === nodeId)
                .map(e => e.id)
            setActives(upstreamEdges)
        } else if (mode === 'flow') {
            const connectedNodes: string[] = []
            const connectedEdges: string[] = []
            reagraphEdges.forEach(edge => {
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

    // Mode-specific highlighting logic
    const handleNodeClick = (node: ReagraphNode) => {
        const nodeId = node.id
        const clickedNodeData = node.data as GraphNode

        setSelectedNode(clickedNodeData)

        if (mode === 'impact') {
            // Impact mode: highlight downstream (targets)
            const downstreamNodes = getDownstreamNodes(nodeId, reagraphEdges, 3)
            setSelections([nodeId, ...downstreamNodes])

            const downstreamEdges = reagraphEdges
                .filter(e => downstreamNodes.includes(e.target) || e.source === nodeId)
                .map(e => e.id)
            setActives(downstreamEdges)
        } else if (mode === 'suspect') {
            // Suspect mode: highlight upstream (sources)
            const upstreamNodes = getUpstreamNodes(nodeId, reagraphEdges, 3)
            setSelections([nodeId, ...upstreamNodes])

            const upstreamEdges = reagraphEdges
                .filter(e => upstreamNodes.includes(e.source) || e.target === nodeId)
                .map(e => e.id)
            setActives(upstreamEdges)
        } else if (mode === 'flow') {
            // Flow mode: highlight all connected nodes
            const connectedNodes: string[] = []
            const connectedEdges: string[] = []
            reagraphEdges.forEach(edge => {
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

    const hasData = reagraphNodes.length > 0

    if (loading) {
        return (
            <div className="bg-slate-900 border border-slate-700 rounded-lg overflow-hidden flex flex-col h-[600px]">
                <div className="p-4 border-b border-slate-700 bg-slate-800/50">
                    <h3 className="text-lg font-medium text-white">Incident Explorer</h3>
                </div>
                <div className="flex-1 flex items-center justify-center">
                    <div className="text-slate-400">Loading graph data...</div>
                </div>
            </div>
        )
    }

    if (error) {
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
                        Impact
                    </ModeButton>
                    <ModeButton active={mode === 'suspect'} onClick={() => setMode('suspect')}>
                        Suspect
                    </ModeButton>
                    <ModeButton active={mode === 'flow'} onClick={() => setMode('flow')}>
                        Flow
                    </ModeButton>
                </div>
            </div>

            {/* Mode Legend */}
            <div className="px-4 py-2 bg-slate-800/30 border-b border-slate-700">
                <div className="flex justify-between items-center">
                    <div className="text-xs text-slate-400">
                        {mode === 'impact' && '📊 Click a node to see downstream blast radius (what breaks if this degrades)'}
                        {mode === 'suspect' && '🔍 Click a node to see upstream suspects (probable root causes)'}
                        {mode === 'flow' && '🌊 Click a node to see traffic flows and critical paths'}
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                        <div className="flex items-center gap-1">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: getRiskColor('CRITICAL') }} />
                            <span className="text-slate-400">Critical</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: getRiskColor('HIGH') }} />
                            <span className="text-slate-400">High</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: getRiskColor('MEDIUM') }} />
                            <span className="text-slate-400">Medium</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: getRiskColor('LOW') }} />
                            <span className="text-slate-400">Low</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: getRiskColor('UNKNOWN') }} />
                            <span className="text-slate-400">Unknown</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex-1 relative">
                {hasData ? (
                    <div className="absolute inset-0">
                        <GraphCanvas
                            nodes={reagraphNodes}
                            edges={reagraphEdges}
                            selections={selections}
                            actives={actives}
                            layoutType="forceDirected2d"
                            labelType="all"
                            theme={{
                                canvas: {
                                    background: '#0f172a',
                                },
                                node: {
                                    fill: '#64748b', // neutral default, overridden by per-node fill
                                    activeFill: '#38bdf8',
                                    opacity: 0.9,
                                    selectedOpacity: 1,
                                    inactiveOpacity: 0.4,
                                    label: {
                                        color: '#e2e8f0',
                                        stroke: '#0f172a',
                                        activeColor: '#ffffff'
                                    },
                                    subLabel: {
                                        color: '#94a3b8',
                                        stroke: 'transparent',
                                        activeColor: '#e2e8f0'
                                    }
                                },
                                lasso: {
                                    border: '1px solid #38bdf8',
                                    background: 'rgba(56, 189, 248, 0.1)'
                                },
                                ring: {
                                    fill: '#334155',
                                    activeFill: '#3b82f6'
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
                                        fontSize: 6
                                    }
                                },
                                arrow: {
                                    fill: '#475569',
                                    activeFill: '#94a3b8'
                                }
                            }}
                            onNodeClick={(node) => handleNodeClick(node)}
                            onNodePointerOver={(node) => {
                                setHoveredNode(node.data as GraphNode)

                                // Highlight upstream/downstream on hover (if no node selected)
                                if (!selectedNode) {
                                    const nodeId = node.id

                                    if (mode === 'impact') {
                                        const downstreamNodes = getDownstreamNodes(nodeId, reagraphEdges, 3)
                                        setSelections([nodeId, ...downstreamNodes])
                                        const downstreamEdges = reagraphEdges
                                            .filter(e => downstreamNodes.includes(e.target) || e.source === nodeId)
                                            .map(e => e.id)
                                        setActives(downstreamEdges)
                                    } else if (mode === 'suspect') {
                                        const upstreamNodes = getUpstreamNodes(nodeId, reagraphEdges, 3)
                                        setSelections([nodeId, ...upstreamNodes])
                                        const upstreamEdges = reagraphEdges
                                            .filter(e => upstreamNodes.includes(e.source) || e.target === nodeId)
                                            .map(e => e.id)
                                        setActives(upstreamEdges)
                                    } else if (mode === 'flow') {
                                        const connectedNodes: string[] = []
                                        const connectedEdges: string[] = []
                                        reagraphEdges.forEach(edge => {
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
                        {hoveredNode && !selectedNode && (
                            <div className="absolute top-4 left-4 z-20 pointer-events-none bg-slate-900/90 backdrop-blur border border-slate-700 p-3 rounded-lg shadow-xl max-w-xs animate-in fade-in zoom-in-95 duration-200">
                                <div className="flex items-center gap-2 mb-1">
                                    <div
                                        className="w-2 h-2 rounded-full"
                                        style={{ backgroundColor: getRiskColor(hoveredNode.riskLevel) }}
                                    />
                                    <span className="font-semibold text-white text-sm">{hoveredNode.name}</span>
                                </div>
                                <div className="text-xs text-slate-400 mb-1">{hoveredNode.namespace}</div>
                                {hoveredNode.riskReason && (
                                    <div className="text-xs text-slate-300 mt-2 border-t border-slate-700/50 pt-2">
                                        {hoveredNode.riskReason}
                                    </div>
                                )}
                            </div>
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
                    <div className="h-full flex flex-col items-center justify-center p-8">
                        <EmptyState
                            icon="🕸️"
                            message="No dependency graph data available"
                            action={
                                <span className="text-xs text-slate-500 mt-2 block max-w-xs text-center">
                                    Ensure Graph Engine has discovered services
                                </span>
                            }
                        />
                    </div>
                )}
            </div>
        </div>
    )
}

// Helper functions for graph traversal

function getDownstreamNodes(nodeId: string, edges: ReagraphEdge[], maxHops: number): string[] {
    const visited = new Set<string>()
    const queue: Array<{ id: string; hop: number }> = [{ id: nodeId, hop: 0 }]

    while (queue.length > 0) {
        const current = queue.shift()!
        if (current.hop >= maxHops) continue

        edges.forEach(edge => {
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

        edges.forEach(edge => {
            if (edge.target === current.id && !visited.has(edge.source)) {
                visited.add(edge.source)
                queue.push({ id: edge.source, hop: current.hop + 1 })
            }
        })
    }

    return Array.from(visited)
}
