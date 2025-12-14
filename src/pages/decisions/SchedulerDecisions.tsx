import { useState, useEffect } from 'react'
import { RefreshCw, Calendar, Filter, Server } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import Section from '@/components/layout/Section'
import schedulerDecisionsData from '@/mocks/schedulerDecisions.json'

interface SchedulerDecision {
  namespace: string
  service: string
  status: string
  currentNodes: string[]
  bestNode: string
  scores: Record<string, number>
  evaluatedAt: string
  windowSeconds: number
}

export default function SchedulerDecisions() {
  const [decisions, setDecisions] = useState<SchedulerDecision[]>([])
  const [loading, setLoading] = useState(true)
  const [namespaceFilter, setNamespaceFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const loadData = async () => {
    setLoading(true)
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 300))
    setDecisions(schedulerDecisionsData as SchedulerDecision[])
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  const formatTimestamp = (ts: string) => {
    return new Date(ts).toLocaleString()
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Scheduled':
        return 'bg-green-900/30 text-green-300'
      case 'NoPeers':
        return 'bg-yellow-900/30 text-yellow-300'
      case 'NoMetrics':
        return 'bg-orange-900/30 text-orange-300'
      case 'StaleMetrics':
        return 'bg-red-900/30 text-red-300'
      default:
        return 'bg-slate-900/30 text-slate-300'
    }
  }

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-400'
    if (score >= 50) return 'text-yellow-400'
    return 'text-red-400'
  }

  const filteredDecisions = decisions.filter((d) => {
    if (namespaceFilter && d.namespace !== namespaceFilter) return false
    if (statusFilter && d.status !== statusFilter) return false
    return true
  })

  const uniqueNamespaces = Array.from(new Set(decisions.map((d) => d.namespace)))
  const uniqueStatuses = Array.from(new Set(decisions.map((d) => d.status)))

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="Scheduler Decisions"
        description="Kubernetes scheduling decisions from the predictive scheduler extender"
        icon={Server}
        actions={
          <button
            onClick={loadData}
            disabled={loading}
            className="p-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 disabled:opacity-50 text-white rounded-lg transition-colors cursor-pointer"
            title="Refresh data"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        }
      />

      {/* Filters */}
      <Section icon={Filter}>
        <div className="flex gap-4 items-end">
          <div className="flex-1">
            <label htmlFor="namespace-filter" className="block text-sm font-medium text-gray-300 mb-2">
              Filter by Namespace
            </label>
            <select
              id="namespace-filter"
              value={namespaceFilter}
              onChange={(e) => setNamespaceFilter(e.target.value)}
              className="w-full bg-gray-700/70 text-white border border-gray-600/50 rounded-lg px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
            >
              <option value="">All Namespaces</option>
              {uniqueNamespaces.map((ns) => (
                <option key={ns} value={ns}>
                  {ns}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label htmlFor="status-filter" className="block text-sm font-medium text-gray-300 mb-2">
              Filter by Status
            </label>
            <select
              id="status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full bg-gray-700/70 text-white border border-gray-600/50 rounded-lg px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
            >
              <option value="">All Statuses</option>
              {uniqueStatuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={() => {
              setNamespaceFilter('')
              setStatusFilter('')
            }}
            className="px-6 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded-lg font-medium transition-colors whitespace-nowrap h-[42px]"
          >
            Clear Filters
          </button>
        </div>
      </Section>

      {/* Loading State */}
      {loading && (
        <Section>
          <div className="text-center py-8">
            <p className="text-slate-400">Loading scheduler decisions...</p>
          </div>
        </Section>
      )}

      {/* Empty State */}
      {!loading && filteredDecisions.length === 0 && (
        <Section>
          <div className="text-center py-8">
            <p className="text-slate-400">No scheduler decisions found</p>
          </div>
        </Section>
      )}

      {/* Decisions Grid */}
      {!loading && filteredDecisions.length > 0 && (
        <div className="space-y-4">
          {filteredDecisions.map((decision) => (
            <div
              key={`${decision.namespace}-${decision.service}-${decision.evaluatedAt}`}
              className="group relative overflow-hidden bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm rounded-xl border border-slate-700 hover:border-slate-600 transition-all duration-300 hover:shadow-lg hover:shadow-blue-500/10"
            >
              <div className="p-6 space-y-4">
                {/* Header Row with gradient */}
                <div className="relative overflow-hidden bg-gradient-to-r from-blue-600/10 via-purple-600/10 to-cyan-600/10 rounded-lg border border-gray-700/50 p-4">
                  <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-2">
                      <Server className="w-5 h-5 text-blue-400" />
                      <h3 className="text-xl font-semibold text-white">{decision.service}</h3>
                      <span className="text-sm px-2.5 py-1 bg-slate-700/80 text-slate-300 rounded-md border border-slate-600">
                        {decision.namespace}
                      </span>
                      <span className={`text-sm px-2.5 py-1 rounded-md border ${getStatusColor(decision.status)}`}>
                        {decision.status}
                      </span>
                    </div>
                    <p className="text-sm text-slate-400 flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      {formatTimestamp(decision.evaluatedAt)} • Window: {decision.windowSeconds}s
                    </p>
                  </div>
                  <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-2xl"></div>
                </div>

                {/* Details Grid with gradient cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Current Nodes */}
                  <div className="group relative overflow-hidden bg-gradient-to-br from-indigo-500/10 to-indigo-500/5 backdrop-blur-sm rounded-lg border border-indigo-500/30 p-4 hover:border-indigo-500/50 transition-all duration-300">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="p-1.5 bg-indigo-500/20 rounded">
                        <Server className="w-4 h-4 text-indigo-400" />
                      </div>
                      <h4 className="text-sm font-semibold text-white">Current Nodes</h4>
                    </div>
                    <div className="space-y-1">
                      {decision.currentNodes.map((node) => (
                        <div key={node} className="text-sm text-slate-300 font-mono bg-slate-900/50 px-2 py-1 rounded border border-slate-700/50">
                          {node}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Best Node */}
                  <div className="group relative overflow-hidden bg-gradient-to-br from-green-500/10 to-emerald-500/10 backdrop-blur-sm rounded-lg border border-green-500/30 p-4 hover:border-green-500/50 transition-all duration-300">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="p-1.5 bg-green-500/20 rounded">
                        <Server className="w-4 h-4 text-green-400" />
                      </div>
                      <h4 className="text-sm font-semibold text-white">Best Node</h4>
                    </div>
                    <div className="text-lg font-semibold text-green-400 font-mono">
                      {decision.bestNode}
                    </div>
                    <div className="text-xs text-slate-400 mt-2 flex items-center gap-1">
                      <span>Score:</span>
                      <span className="text-green-400 font-semibold">{decision.scores[decision.bestNode]}</span>
                    </div>
                  </div>

                  {/* Node Scores */}
                  <div className="group relative overflow-hidden bg-gradient-to-br from-purple-500/10 to-pink-500/10 backdrop-blur-sm rounded-lg border border-purple-500/30 p-4 hover:border-purple-500/50 transition-all duration-300">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="p-1.5 bg-purple-500/20 rounded">
                        <Server className="w-4 h-4 text-purple-400" />
                      </div>
                      <h4 className="text-sm font-semibold text-white">All Node Scores</h4>
                    </div>
                    <div className="space-y-1.5">
                      {Object.entries(decision.scores)
                        .sort(([, a], [, b]) => b - a)
                        .map(([node, score]) => (
                          <div key={node} className="flex justify-between items-center bg-slate-900/50 px-2 py-1 rounded border border-slate-700/50">
                            <span className="text-sm text-slate-300 font-mono truncate">{node}</span>
                            <span className={`text-sm font-semibold ml-2 ${getScoreColor(score)}`}>
                              {score}
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Stats Footer */}
      {!loading && filteredDecisions.length > 0 && (
        <Section>
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-400">
              Showing {filteredDecisions.length} of {decisions.length} decisions
            </span>
            <span className="text-slate-500">
              Mock data — real-time integration coming soon
            </span>
          </div>
        </Section>
      )}
    </div>
  )
}
