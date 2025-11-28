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
    const [viewMode, setViewMode] = useState<'graph' | 'list'>('graph')
    const [selectedNode, setSelectedNode] = useState<ServiceRisk | null>(null)
    const [hoveredNode, setHoveredNode] = useState<ServiceRisk | null>(null)

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
                <div className="flex bg-slate-800 rounded-lg p-1 border border-slate-600">
                    <button
                        onClick={() => setViewMode('graph')}
                        className={`px-3 py-1 rounded text-sm font-medium transition-colors ${viewMode === 'graph' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                            }`}
                    >
                        Graph
                    </button>
                    <button
                        onClick={() => setViewMode('list')}
                        className={`px-3 py-1 rounded text-sm font-medium transition-colors ${viewMode === 'list' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                            }`}
                    >
                        List
                    </button>
                </div>
            </div>

            <div className="flex-1 relative">
                {viewMode === 'graph' ? (
                    hasData ? (
                        <div className="absolute inset-0">
                            <GraphCanvas
                                nodes={nodes}
                                edges={graphEdges}
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
                                    setSelectedNode(node.data as ServiceRisk)
                                }}
                                onNodePointerOver={(node) => {
                                    setHoveredNode(node.data as ServiceRisk)
                                }}
                                onNodePointerOut={() => {
                                    setHoveredNode(null)
                                }}
                            />

                            {/* Hover Tooltip Overlay */}
                            {hoveredNode && !selectedNode && (
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
                    )
                ) : (
                    <div className="overflow-y-auto h-full p-4 space-y-2">
                        {risks.length === 0 ? (
                            <div className="text-center text-slate-500 py-8">No services found.</div>
                        ) : (
                            risks.map((risk) => (
                                <div
                                    key={`${risk.namespace}:${risk.service}`}
                                    className="flex items-center justify-between p-3 bg-slate-800 rounded border border-slate-700 hover:bg-slate-700/80 transition-colors cursor-pointer group"
                                    onClick={() => setSelectedNode(risk)}
                                >
                                    <div className="flex items-center gap-3">
                                        <div
                                            className="w-2.5 h-2.5 rounded-full transition-shadow duration-300 group-hover:shadow-[0_0_8px_rgba(255,255,255,0.4)]"
                                            style={{ backgroundColor: risk.riskLevel === 'high' ? RISK_COLORS.high : risk.riskLevel === 'medium' ? RISK_COLORS.medium : RISK_COLORS.low }}
                                        />
                                        <div>
                                            <div className="font-medium text-white">{risk.service}</div>
                                            <div className="text-xs text-slate-400">{risk.namespace}</div>
                                        </div>
                                    </div>
                                    <span className="text-xs font-mono text-slate-500">
                                        {formatRiskLevel(risk.riskLevel)}
                                    </span>
                                </div>
                            ))
                        )}
                    </div>
                )}

                {/* Selected Node Details Panel (Right Side) */}
                <div
                    className={`absolute top-0 right-0 bottom-0 w-80 bg-slate-900/95 backdrop-blur border-l border-slate-700 shadow-2xl p-6 overflow-y-auto z-30 transition-transform duration-300 ease-in-out ${selectedNode ? 'translate-x-0' : 'translate-x-full'}`}
                >
                    {selectedNode && (
                        <>
                            <div className="flex justify-between items-start mb-6">
                                <h4 className="text-xl font-semibold text-white truncate max-w-[200px]" title={selectedNode.service}>
                                    {selectedNode.service}
                                </h4>
                                <button
                                    onClick={() => setSelectedNode(null)}
                                    className="text-slate-400 hover:text-white"
                                >
                                    ✕
                                </button>
                            </div>

                            <div className="space-y-6">
                                <div>
                                    <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-1">Status</div>
                                    <div className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${selectedNode.riskLevel === 'high' ? 'bg-red-900/30 text-red-300 border-red-700' :
                                        selectedNode.riskLevel === 'medium' ? 'bg-yellow-900/30 text-yellow-300 border-yellow-700' :
                                            'bg-green-900/30 text-green-300 border-green-700'
                                        }`}>
                                        {formatRiskLevel(selectedNode.riskLevel)}
                                    </div>
                                </div>

                                <div>
                                    <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-1">Namespace</div>
                                    <div className="text-slate-300 font-mono text-sm">{selectedNode.namespace}</div>
                                </div>

                                {selectedNode.reason && (
                                    <div>
                                        <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-1">Risk Factor</div>
                                        <p className="text-sm text-slate-400 leading-relaxed">{selectedNode.reason}</p>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}
