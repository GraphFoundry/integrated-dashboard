import { useState } from 'react'
import { GraphNode, GraphEdge } from '@/lib/types'
import { MetricTooltip } from './incidentExplorerUtils'
import { getRiskBadgeClass, formatMetric } from './graphHelpers'
import { formatPercent, formatRps } from '@/lib/format'

type TabType = 'summary' | 'blastRadius' | 'suspects' | 'flows'

interface NodeDetailsDrawerProps {
  readonly node: GraphNode
  readonly nodes: GraphNode[]
  readonly edges: GraphEdge[]
  readonly onClose: () => void
}

export function NodeDetailsDrawer({ node, nodes, edges, onClose }: Readonly<NodeDetailsDrawerProps>) {
    const [activeTab, setActiveTab] = useState<TabType>('summary')
    const [showAdvanced, setShowAdvanced] = useState(false)

    // Calculate blast radius (downstream hops)
    const blastRadius = calculateBlastRadius(node.id, edges)

    // Calculate suspects (upstream services with issues)
    const suspects = calculateSuspects(node.id, edges, nodes)

    // Calculate flows (incoming/outgoing edges)
    const flows = calculateFlows(node.id, edges, nodes)

    return (
        <div className="absolute top-4 right-4 z-20 w-96 bg-slate-900/95 backdrop-blur border border-slate-700 rounded-lg shadow-xl max-h-[calc(100%-2rem)] overflow-hidden flex flex-col animate-in fade-in slide-in-from-right duration-200">
            {/* Header */}
            <div className="p-4 border-b border-slate-700 flex justify-between items-start">
                <div className="flex items-center gap-2">
                    <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: getNodeColor(node.riskLevel) }}
                    />
                    <span className="font-bold text-white text-base">{node.name}</span>
                </div>
                <button
                    onClick={onClose}
                    className="text-slate-400 hover:text-white transition-colors"
                >
                    ✕
                </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-700 bg-slate-800/30">
                <Tab label="Summary" active={activeTab === 'summary'} onClick={() => setActiveTab('summary')} />
                <Tab label="Blast Radius" active={activeTab === 'blastRadius'} onClick={() => setActiveTab('blastRadius')} />
                <Tab label="Suspects" active={activeTab === 'suspects'} onClick={() => setActiveTab('suspects')} />
                <Tab label="Flows" active={activeTab === 'flows'} onClick={() => setActiveTab('flows')} />
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {activeTab === 'summary' && (
                    <SummaryTab
                        node={node}
                        showAdvanced={showAdvanced}
                        onToggleAdvanced={() => setShowAdvanced(!showAdvanced)}
                    />
                )}

                {activeTab === 'blastRadius' && (
                    <BlastRadiusTab blastRadius={blastRadius} nodes={nodes} />
                )}

                {activeTab === 'suspects' && (
                    <SuspectsTab suspects={suspects} showAdvanced={showAdvanced} />
                )}

                {activeTab === 'flows' && (
                    <FlowsTab flows={flows} showAdvanced={showAdvanced} />
                )}
            </div>
        </div>
    )
}

// Tab Component
function Tab({ label, active, onClick }: { readonly label: string; readonly active: boolean; readonly onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                active
                    ? 'text-white bg-slate-800 border-b-2 border-sky-500'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
        >
            {label}
        </button>
    )
}

// Summary Tab
function SummaryTab({ node, showAdvanced, onToggleAdvanced }: { readonly node: GraphNode; readonly showAdvanced: boolean; readonly onToggleAdvanced: () => void }) {
    return (
        <>
            <div>
                <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-0.5">Namespace</div>
                <div className="text-slate-300 font-mono text-sm">{node.namespace}</div>
            </div>

            {/* Show pod count and availability if available from Graph Engine */}
            {(node.podCount !== undefined || node.availability !== undefined) && (
                <div className="grid grid-cols-2 gap-3">
                    {node.podCount !== undefined && (
                        <div>
                            <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-0.5">
                                Pods Running
                            </div>
                            <div className="text-slate-300 font-mono text-sm">
                                {node.podCount}
                            </div>
                        </div>
                    )}
                    {node.availability !== undefined && (
                        <div>
                            <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-0.5">
                                Availability
                            </div>
                            <div className="text-slate-300 font-mono text-sm">
                                {(node.availability * 100).toFixed(1)}%
                            </div>
                        </div>
                    )}
                </div>
            )}

            <div>
                <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-0.5">Risk Level</div>
                <div className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${getRiskBadgeClass(node.riskLevel)}`}>
                    {node.riskLevel}
                </div>
            </div>

            {node.riskReason && (
                <div>
                    <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-0.5">Risk Reason</div>
                    <p className="text-sm text-slate-300 leading-relaxed">{node.riskReason}</p>
                </div>
            )}

            <div className="border-t border-slate-700 pt-4 space-y-3">
                <div className="flex justify-between items-center mb-2">
                    <h4 className="text-sm font-semibold text-white">Key Metrics</h4>
                    <button
                        onClick={onToggleAdvanced}
                        className="text-xs text-sky-400 hover:text-sky-300"
                    >
                        {showAdvanced ? 'Hide' : 'Show'} advanced
                    </button>
                </div>

                <MetricTooltip
                    label={showAdvanced ? 'Request Rate (RPS)' : 'Traffic'}
                    tooltip="Number of requests per second this service is receiving"
                >
                    <div className="text-sm text-slate-200 font-mono">
                        {formatMetric(node.reqRate, formatRps)}
                    </div>
                </MetricTooltip>

                <MetricTooltip
                    label={showAdvanced ? 'Error Rate (%)' : 'Failed Requests'}
                    tooltip="Percentage of requests that resulted in errors (5xx responses)"
                >
                    <div className="text-sm text-slate-200 font-mono">
                        {formatMetric(node.errorRatePct, formatPercent)}
                    </div>
                </MetricTooltip>

                <MetricTooltip
                    label={showAdvanced ? 'P95 Latency (ms)' : 'Slow Responses'}
                    tooltip="95% of requests complete faster than this. This shows how slow it gets for the slowest 5% of requests."
                >
                    <div className="text-sm text-slate-200 font-mono">
                        {formatMetric(node.latencyP95Ms, (v) => `${v.toFixed(0)}ms`)}
                    </div>
                </MetricTooltip>

                <MetricTooltip
                    label={showAdvanced ? 'Availability (%)' : 'Uptime'}
                    tooltip="Percentage of time the service was responsive and healthy"
                >
                    <div className="text-sm text-slate-200 font-mono">
                        {formatMetric(node.availabilityPct, formatPercent)}
                    </div>
                </MetricTooltip>
            </div>
        </>
    )
}

// Blast Radius Tab
function BlastRadiusTab({ blastRadius, nodes }: { readonly blastRadius: BlastRadius; readonly nodes: GraphNode[] }) {
    const topRiskyDownstream = blastRadius.downstreamServices
        .map(id => nodes.find(n => n.id === id))
        .filter((n): n is GraphNode => n !== undefined)
        .sort((a, b) => {
            const riskOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, UNKNOWN: 4 }
            return riskOrder[a.riskLevel] - riskOrder[b.riskLevel]
        })
        .slice(0, 5)

    return (
        <>
            <div className="bg-slate-800/50 p-3 rounded-lg space-y-2">
                <div className="flex justify-between">
                    <span className="text-xs text-slate-400">Directly affected (1 hop)</span>
                    <span className="text-sm font-semibold text-white">{blastRadius.hop1Count}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-xs text-slate-400">Indirectly affected (2 hops)</span>
                    <span className="text-sm font-semibold text-white">{blastRadius.hop2Count}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-xs text-slate-400">Extended impact (3 hops)</span>
                    <span className="text-sm font-semibold text-white">{blastRadius.hop3Count}</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-slate-700">
                    <span className="text-xs font-semibold text-slate-300">Total potentially impacted</span>
                    <span className="text-base font-bold text-sky-400">{blastRadius.totalCount}</span>
                </div>
            </div>

            {topRiskyDownstream.length > 0 && (
                <div>
                    <h4 className="text-sm font-semibold text-white mb-2">Top Downstream Dependencies</h4>
                    <div className="space-y-2">
                        {topRiskyDownstream.map(node => (
                            <div key={node.id} className="flex items-center gap-2 p-2 bg-slate-800/30 rounded">
                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: getNodeColor(node.riskLevel) }} />
                                <div className="flex-1">
                                    <div className="text-sm text-white">{node.name}</div>
                                    <div className="text-xs text-slate-400">{node.namespace}</div>
                                </div>
                                <div className={`text-xs px-2 py-0.5 rounded ${getRiskBadgeClass(node.riskLevel)}`}>
                                    {node.riskLevel}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {blastRadius.totalCount === 0 && (
                <div className="text-sm text-slate-400 text-center py-4">
                    No downstream dependencies found
                </div>
            )}
        </>
    )
}

// Suspects Tab
function SuspectsTab({ suspects, showAdvanced }: { readonly suspects: Suspect[]; readonly showAdvanced: boolean }) {
    if (suspects.length === 0) {
        return (
            <div className="text-sm text-slate-400 text-center py-4">
                Not enough telemetry to rank suspects
            </div>
        )
    }

    return (
        <>
            <div className="text-xs text-slate-400 mb-3">
                Upstream services ranked by issues (highest risk first)
            </div>
            <div className="space-y-2">
                {suspects.map((suspect, idx) => (
                    <div key={suspect.nodeId} className="p-3 bg-slate-800/30 rounded-lg">
                        <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center gap-2">
                                <div className="text-xs font-semibold text-slate-500">#{idx + 1}</div>
                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: getNodeColor(suspect.riskLevel) }} />
                                <div>
                                    <div className="text-sm font-medium text-white">{suspect.name}</div>
                                    <div className="text-xs text-slate-400">{suspect.namespace}</div>
                                </div>
                            </div>
                            <div className={`text-xs px-2 py-0.5 rounded ${getRiskBadgeClass(suspect.riskLevel)}`}>
                                {suspect.riskLevel}
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs mt-2">
                            {suspect.errorRate !== undefined && (
                                <div>
                                    <div className="text-slate-500">Error Rate</div>
                                    <div className="text-slate-200 font-mono">{formatPercent(suspect.errorRate)}</div>
                                </div>
                            )}
                            {suspect.latency !== undefined && (
                                <div>
                                    <div className="text-slate-500">{showAdvanced ? 'P95' : 'Latency'}</div>
                                    <div className="text-slate-200 font-mono">{suspect.latency.toFixed(0)}ms</div>
                                </div>
                            )}
                        </div>
                        {suspect.reason && (
                            <div className="text-xs text-slate-400 mt-2 pt-2 border-t border-slate-700">
                                {suspect.reason}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </>
    )
}

// Flows Tab
function FlowsTab({ flows, showAdvanced }: { readonly flows: Flows; readonly showAdvanced: boolean }) {
    return (
        <>
            {flows.incoming.length > 0 && (
                <div>
                    <h4 className="text-sm font-semibold text-white mb-2">Incoming Edges</h4>
                    <div className="space-y-2">
                        {flows.incoming.map(flow => (
                            <FlowItem key={flow.edgeId} flow={flow} showAdvanced={showAdvanced} />
                        ))}
                    </div>
                </div>
            )}

            {flows.outgoing.length > 0 && (
                <div>
                    <h4 className="text-sm font-semibold text-white mb-2">Outgoing Edges</h4>
                    <div className="space-y-2">
                        {flows.outgoing.map(flow => (
                            <FlowItem key={flow.edgeId} flow={flow} showAdvanced={showAdvanced} />
                        ))}
                    </div>
                </div>
            )}

            {flows.incoming.length === 0 && flows.outgoing.length === 0 && (
                <div className="text-sm text-slate-400 text-center py-4">
                    No edge flow data available
                </div>
            )}
        </>
    )
}

function FlowItem({ flow, showAdvanced }: { readonly flow: FlowData; readonly showAdvanced: boolean }) {
    return (
        <div className="p-3 bg-slate-800/30 rounded-lg">
            <div className="text-sm text-white mb-2 font-mono">
                {flow.from} → {flow.to}
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                    <div className="text-slate-500">Traffic</div>
                    {flow.reqRate === undefined ? (
                        <div className="text-slate-400">N/A</div>
                    ) : (
                        <div className="text-slate-200 font-mono">{formatRps(flow.reqRate)}</div>
                    )}
                </div>
                <div>
                    <div className="text-slate-500">Errors</div>
                    {flow.errorRate === undefined ? (
                        <div className="text-slate-400">N/A</div>
                    ) : (
                        <div className="text-slate-200 font-mono">{formatPercent(flow.errorRate)}</div>
                    )}
                </div>
                <div>
                    <div className="text-slate-500">{showAdvanced ? 'P95' : 'Latency'}</div>
                    {flow.latency === undefined ? (
                        <div className="text-slate-400">N/A</div>
                    ) : (
                        <div className="text-slate-200 font-mono">{flow.latency.toFixed(0)}ms</div>
                    )}
                </div>
            </div>
        </div>
    )
}

// Helper functions

function getNodeColor(riskLevel: string): string {
    switch (riskLevel) {
        case 'CRITICAL':
            return '#dc2626'
        case 'HIGH':
            return '#ef4444'
        case 'MEDIUM':
            return '#facc15'
        case 'LOW':
            return '#4ade80'
        default:
            return '#94a3b8'
    }
}

interface BlastRadius {
    downstreamServices: string[]
    hop1Count: number
    hop2Count: number
    hop3Count: number
    totalCount: number
}

function calculateBlastRadius(nodeId: string, edges: GraphEdge[]): BlastRadius {
    const hop1 = new Set<string>()
    const hop2 = new Set<string>()
    const hop3 = new Set<string>()

    // 1-hop downstream
    edges.forEach(e => {
        if (e.source === nodeId) hop1.add(e.target)
    })

    // 2-hop downstream
    hop1.forEach(h1 => {
        edges.forEach(e => {
            if (e.source === h1 && !hop1.has(e.target)) hop2.add(e.target)
        })
    })

    // 3-hop downstream
    hop2.forEach(h2 => {
        edges.forEach(e => {
            if (e.source === h2 && !hop1.has(e.target) && !hop2.has(e.target)) hop3.add(e.target)
        })
    })

    const allDownstream = new Set([...hop1, ...hop2, ...hop3])

    return {
        downstreamServices: Array.from(allDownstream),
        hop1Count: hop1.size,
        hop2Count: hop2.size,
        hop3Count: hop3.size,
        totalCount: allDownstream.size
    }
}

interface Suspect {
    nodeId: string
    name: string
    namespace: string
    riskLevel: string
    errorRate?: number
    latency?: number
    reason?: string
}

function calculateSuspects(nodeId: string, edges: GraphEdge[], nodes: GraphNode[]): Suspect[] {
    // Find all upstream nodes (callers)
    const upstreamIds = new Set<string>()
    edges.forEach(e => {
        if (e.target === nodeId) upstreamIds.add(e.source)
    })

    // Rank by risk level and error metrics
    const suspects = Array.from(upstreamIds)
        .map(id => nodes.find(n => n.id === id))
        .filter((n): n is GraphNode => n !== undefined)
        .map(n => ({
            nodeId: n.id,
            name: n.name,
            namespace: n.namespace,
            riskLevel: n.riskLevel,
            errorRate: n.errorRatePct,
            latency: n.latencyP95Ms,
            reason: n.riskReason
        }))
        .sort((a, b) => {
            const riskOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, UNKNOWN: 4 }
            return riskOrder[a.riskLevel as keyof typeof riskOrder] - riskOrder[b.riskLevel as keyof typeof riskOrder]
        })

    return suspects.slice(0, 5)
}

interface FlowData {
    edgeId: string
    from: string
    to: string
    reqRate?: number
    errorRate?: number
    latency?: number
}

interface Flows {
    incoming: FlowData[]
    outgoing: FlowData[]
}

function calculateFlows(nodeId: string, edges: GraphEdge[], nodes: GraphNode[]): Flows {
    const incoming: FlowData[] = []
    const outgoing: FlowData[] = []

    edges.forEach(e => {
        if (e.target === nodeId) {
            const sourceNode = nodes.find(n => n.id === e.source)
            incoming.push({
                edgeId: e.id,
                from: sourceNode?.name || e.source,
                to: nodes.find(n => n.id === nodeId)?.name || nodeId,
                reqRate: e.reqRate,
                errorRate: e.errorRatePct,
                latency: e.latencyP95Ms
            })
        }
        if (e.source === nodeId) {
            const targetNode = nodes.find(n => n.id === e.target)
            outgoing.push({
                edgeId: e.id,
                from: nodes.find(n => n.id === nodeId)?.name || nodeId,
                to: targetNode?.name || e.target,
                reqRate: e.reqRate,
                errorRate: e.errorRatePct,
                latency: e.latencyP95Ms
            })
        }
    })

    return { incoming, outgoing }
}
