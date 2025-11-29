import { useMemo, useState } from 'react'
import { GraphCanvas, GraphNode, GraphEdge } from 'reagraph'
import { ServiceRisk } from '@/lib/risk'
import { formatRiskLevel } from '@/lib/format'
import EmptyState from '@/components/layout/EmptyState'

interface TopRisksNetworkProps {
    risks: ServiceRisk[]
    edges?: { source: string; target: string }[]
}

// Modern neon palette (Subtle Glows)
const RISK_COLORS = {
    high: '#ef4444',   // Red-400 (Pastel Neon)
    medium: '#facc15', // Yellow-400
    low: '#4ade80'     // Green-400
}

const HOVER_COLOR = '#38bdf8' // Sky-400 for hover

export default function TopRisksNetwork({ risks, edges = [] }: TopRisksNetworkProps) {
    const [clickedNode, setClickedNode] = useState<ServiceRisk | null>(null)
    const [hoveredNode, setHoveredNode] = useState<ServiceRisk | null>(null)
    const [selections, setSelections] = useState<string[]>([])
    const [actives, setActives] = useState<string[]>([])

    // Convert risks to Graph Nodes with modern colors
    const nodes: GraphNode[] = useMemo(() => {
        return risks.map((r) => ({
            id: `${r.namespace}:${r.service}`,
            label: r.service,
            fill: r.riskLevel === 'high' ? RISK_COLORS.high : r.riskLevel === 'medium' ? RISK_COLORS.medium : RISK_COLORS.low,
            data: r,
            // Add a subtle glow/halo via size? Reagraph doesn't support glow natively on canvas
            // but we can use brighter colors.
        }))
    }, [risks])

    const graphEdges: GraphEdge[] = useMemo(() => {
        return edges.map(e => ({
            source: e.source,
            target: e.target,
            id: `${e.source}-${e.target}`
        }))
    }, [edges])

    const hasData = nodes.length > 0

    return (
        <div className="bg-slate-900 border border-slate-700 rounded-lg overflow-hidden flex flex-col h-[500px] relative">
            <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800/50">
                <h3 className="text-lg font-medium text-white">Dependency Network</h3>
            </div>

            <div className="flex-1 relative">
                {hasData ? (
                    <div className="absolute inset-0">
                        <GraphCanvas
                            nodes={nodes}
                            edges={graphEdges}
                            selections={selections}
                            actives={actives}
                            layoutType="forceDirected2d"
                            labelType="all"
                                theme={{
                                    canvas: {
                                        background: '#0f172a', // Slate-900
                                    },
                                    node: {
                                        fill: '#7c3aed',
                                        activeFill: HOVER_COLOR,
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
                                onNodeClick={(node) => {
                                const nodeId = node.id
                                // Find connected nodes and edges
                                const connectedNodeIds: string[] = []
                                const connectedEdgeIds: string[] = []
                                graphEdges.forEach(edge => {
                                    if (edge.source === nodeId) {
                                        connectedNodeIds.push(edge.target)
                                        connectedEdgeIds.push(edge.id)
                                    }
                                    if (edge.target === nodeId) {
                                        connectedNodeIds.push(edge.source)
                                        connectedEdgeIds.push(edge.id)
                                    }
                                })
                                // Set selections to highlight clicked node and connected nodes
                                setSelections([nodeId, ...connectedNodeIds])
                                // Set actives to highlight connected edges
                                setActives(connectedEdgeIds)
                                setClickedNode(node.data as ServiceRisk)
                            }}
                            onNodePointerOver={(node) => {
                                setHoveredNode(node.data as ServiceRisk)
                            }}
                            onNodePointerOut={() => {
                                setHoveredNode(null)
                            }}
                            onCanvasClick={() => {
                                setSelections([])
                                setActives([])
                                setClickedNode(null)
                            }}
                        />

                        {/* Hover Tooltip Overlay */}
                        {hoveredNode && !clickedNode && (
                            <div className="absolute top-4 left-4 z-20 pointer-events-none bg-slate-900/90 backdrop-blur border border-slate-700 p-3 rounded-lg shadow-xl max-w-xs animate-in fade-in zoom-in-95 duration-200">
                                <div className="flex items-center gap-2 mb-1">
                                    <div
                                        className="w-2 h-2 rounded-full"
                                        style={{ backgroundColor: hoveredNode.riskLevel === 'high' ? RISK_COLORS.high : hoveredNode.riskLevel === 'medium' ? RISK_COLORS.medium : RISK_COLORS.low }}
                                    />
                                    <span className="font-semibold text-white text-sm">{hoveredNode.service}</span>
                                </div>
                                <div className="text-xs text-slate-400 mb-1">{hoveredNode.namespace}</div>
                                {hoveredNode.reason && (
                                    <div className="text-xs text-slate-300 mt-2 border-t border-slate-700/50 pt-2">
                                        {hoveredNode.reason}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Clicked Node Tooltip with More Details */}
                        {clickedNode && (
                            <div className="absolute top-4 left-4 z-20 bg-slate-900/95 backdrop-blur border border-slate-700 p-4 rounded-lg shadow-xl max-w-sm animate-in fade-in zoom-in-95 duration-200">
                                <div className="flex justify-between items-start mb-3">
                                    <div className="flex items-center gap-2">
                                        <div
                                            className="w-3 h-3 rounded-full"
                                            style={{ backgroundColor: clickedNode.riskLevel === 'high' ? RISK_COLORS.high : clickedNode.riskLevel === 'medium' ? RISK_COLORS.medium : RISK_COLORS.low }}
                                        />
                                        <span className="font-bold text-white text-base">{clickedNode.service}</span>
                                    </div>
                                    <button
                                        onClick={() => {
                                            setClickedNode(null)
                                            setSelections([])
                                            setActives([])
                                        }}
                                        className="text-slate-400 hover:text-white transition-colors"
                                    >
                                        ✕
                                    </button>
                                </div>

                                <div className="space-y-2">
                                    <div>
                                        <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-0.5">Namespace</div>
                                        <div className="text-slate-300 font-mono text-sm">{clickedNode.namespace}</div>
                                    </div>

                                    <div>
                                        <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-0.5">Risk Level</div>
                                        <div className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
                                            clickedNode.riskLevel === 'high' ? 'bg-red-900/30 text-red-300 border-red-700' :
                                            clickedNode.riskLevel === 'medium' ? 'bg-yellow-900/30 text-yellow-300 border-yellow-700' :
                                            'bg-green-900/30 text-green-300 border-green-700'
                                        }`}>
                                            {formatRiskLevel(clickedNode.riskLevel)}
                                        </div>
                                    </div>

                                    {clickedNode.reason && (
                                        <div>
                                            <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-0.5">Risk Factor</div>
                                            <p className="text-sm text-slate-300 leading-relaxed">{clickedNode.reason}</p>
                                        </div>
                                    )}

                                    <div className="pt-2 mt-2 border-t border-slate-700/50">
                                        <div className="text-xs text-slate-400">
                                            Connected nodes are highlighted in the graph
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                    </div>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center p-8">
                        <EmptyState
                            icon="🕸️"
                            message="Dependency graph unavailable"
                            action={
                                <span className="text-xs text-slate-500 mt-2 block max-w-xs text-center">
                                    No edge data returned from API. Adjust backend to include edges data.
                                </span>
                            }
                        />
                    </div>
                )}
            </div>
        </div>
    )
}
