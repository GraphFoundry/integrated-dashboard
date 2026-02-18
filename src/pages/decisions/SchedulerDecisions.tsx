import { useState, useEffect } from 'react'
import { RefreshCw, Calendar, Filter, Server, X, Play, CheckCircle, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'
import PageHeader from '@/components/layout/PageHeader'
import Section from '@/components/layout/Section'
import LoadingSpinner from '@/components/common/LoadingSpinner'
import {
  cn,
  controlInputPanelClass,
  controlLabelClass,
  iconActionButtonClass,
  secondaryButtonClass,
} from '@/components/common/uiClassTokens'
import { getServicesWithPlacement } from '@/lib/api'
import { schedulerApi } from '@/lib/schedulerApiClient'

interface SchedulerDecision {
  namespace: string
  service: string
  status: string
  currentNodes: string[]
  bestNode: string
  scores: Record<string, number>
  evaluatedAt: string
  windowSeconds: number
  podName?: string
}


interface RestartResponse {
  success: boolean
  message: string
  error?: string
}

interface FilterSelectProps {
  readonly id: string
  readonly label: string
  readonly value: string
  readonly allLabel: string
  readonly options: string[]
  readonly onChange: (value: string) => void
}

function FilterSelect({
  id,
  label,
  value,
  allLabel,
  options,
  onChange,
}: FilterSelectProps) {
  return (
    <div className="flex-1 w-full">
      <label htmlFor={id} className={controlLabelClass}>
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={controlInputPanelClass}
      >
        <option value="">{allLabel}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  )
}

export default function SchedulerDecisions() {
  const [decisions, setDecisions] = useState<SchedulerDecision[]>([])
  const [services, setServices] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(true)

  const [namespaceFilter, setNamespaceFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const [applyModalOpen, setApplyModalOpen] = useState(false)
  const [selectedDecision, setSelectedDecision] = useState<SchedulerDecision | null>(null)
  const [selectedPod, setSelectedPod] = useState('')
  const [availablePods, setAvailablePods] = useState<string[]>([])
  const [applying, setApplying] = useState(false)
  const [applyResult, setApplyResult] = useState<RestartResponse | null>(null)

  const loadData = async () => {
    setLoading(true)
    try {
      const [decisionsRes, servicesRes] = await Promise.all([
        schedulerApi.get<SchedulerDecision[]>('/decisions'),
        getServicesWithPlacement().catch(() => ({ services: [] }))
      ])

      const decisionsData = decisionsRes.data
      const servicesData = servicesRes.services || []

      const svcMap: Record<string, string[]> = {}
      servicesData.forEach(s => {
        if (s.placement?.nodes) {
          s.placement.nodes.forEach(n => {
            if (n.pods) {
              n.pods.forEach(p => {
                if (!svcMap[s.name]) svcMap[s.name] = []
                svcMap[s.name].push(p.name)
              })
            }
          })
        }
      })
      setServices(svcMap)

      if (Array.isArray(decisionsData)) {
        setDecisions(decisionsData)
      } else {
        setDecisions([])
      }

    } catch (err) {
      console.error('Error loading data:', err)
      toast.error(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleApplyClick = (decision: SchedulerDecision) => {
    setSelectedDecision(decision)
    const pods = services[decision.service] || []
    setAvailablePods(pods.sort())
    // Default select first pod if available
    setSelectedPod(pods.length > 0 ? pods[0] : '')
    setApplyResult(null)
    setApplyModalOpen(true)
  }

  const closeApplyModal = () => {
    setApplyModalOpen(false)
    setSelectedDecision(null)
    setSelectedPod('')
    setAvailablePods([])
    setApplyResult(null)
  }

  const confirmApply = async () => {
    if (!selectedDecision || !selectedPod) return

    setApplying(true)
    setApplyResult(null)

    try {
      const { data } = await schedulerApi.post<RestartResponse>('/restart', {
        namespace: selectedDecision.namespace,
        podName: selectedPod,
        force: true,
      })

      setApplyResult({
        success: true,
        message: data.message || 'Placement applied successfully (Pod restarted)',
      })
      toast.success(data.message || 'Placement applied successfully')

      setTimeout(() => loadData(), 2000)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to apply decision'
      setApplyResult({
        success: false,
        message: errorMessage,
      })
      toast.error(errorMessage)
    } finally {
      setApplying(false)
    }
  }

  const formatTimestamp = (ts: string) => {
    return new Date(ts).toLocaleString()
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Scheduled':
        return 'bg-green-900/30 text-green-300 border-green-700/50'
      case 'NoPeers':
        return 'bg-yellow-900/30 text-yellow-300 border-yellow-700/50'
      case 'NoMetrics':
        return 'bg-orange-900/30 text-orange-300 border-orange-700/50'
      case 'StaleMetrics':
        return 'bg-red-900/30 text-red-300 border-red-700/50'
      default:
        return 'bg-slate-900/30 text-slate-300 border-slate-700/50'
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

  // Get unique values for filters
  const uniqueNamespaces = Array.from(new Set(decisions.map((d) => d.namespace))).sort()
  const uniqueStatuses = Array.from(new Set(decisions.map((d) => d.status))).sort()

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20">
      <PageHeader
        title="Scheduler Decisions"
        description="Real-time Kubernetes scheduling decisions. Apply recommendations to optimize placement."
        icon={Server}
        actions={
          <div className="flex items-center gap-3">
            <button type="button"
              onClick={loadData}
              disabled={loading}
              className={cn(
                iconActionButtonClass,
                'cursor-pointer p-2 shadow-lg shadow-blue-900/20'
              )}
              title="Refresh data"
              aria-label="Refresh scheduler decisions"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        }
      />

      {/* Filters */}
      <Section icon={Filter}>
        <div className="flex flex-col md:flex-row gap-4 items-end">
          <FilterSelect
            id="namespace-filter"
            label="Filter by Namespace"
            value={namespaceFilter}
            allLabel="All Namespaces"
            options={uniqueNamespaces}
            onChange={setNamespaceFilter}
          />
          <FilterSelect
            id="status-filter"
            label="Filter by Status"
            value={statusFilter}
            allLabel="All Statuses"
            options={uniqueStatuses}
            onChange={setStatusFilter}
          />
          <button type="button"
            onClick={() => {
              setNamespaceFilter('')
              setStatusFilter('')
            }}
            className={cn(
              secondaryButtonClass,
              'h-[42px] whitespace-nowrap border border-slate-600 px-6'
            )}
          >
            Clear Filters
          </button>
        </div>
      </Section>

      {/* Loading State */}
      {loading && decisions.length === 0 && (
        <div className="rounded-xl border border-firebase-border bg-firebase-card p-12">
          <LoadingSpinner fullHeight={false} message="Loading live decisions..." />
        </div>
      )}

      {/* Empty State */}
      {!loading && filteredDecisions.length === 0 && (
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-12 text-center">
          <Server className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-300">No decisions found</h3>
          <p className="text-slate-500">Try adjusting your filters or wait for new scheduling events.</p>
        </div>
      )}

      {/* Decisions Grid */}
      <div className="grid grid-cols-1 gap-6">
        {filteredDecisions.map((decision, idx) => {
          // Disable Apply if the best node is already one of the current nodes
          const isOptimized = decision.currentNodes?.includes(decision.bestNode)

          return (
            <div
              key={`${decision.namespace}-${decision.service}-${decision.evaluatedAt}-${idx}`}
              className="group relative overflow-hidden bg-slate-800/40 backdrop-blur-sm rounded-xl border border-slate-700/50 hover:border-slate-600 transition-all duration-300 hover:shadow-lg hover:shadow-black/20"
            >
              {/* Action Bar (Top Right) */}
              <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
                <button type="button"
                  onClick={() => handleApplyClick(decision)}
                  disabled={isOptimized}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors border font-medium ${isOptimized
                    ? 'bg-slate-800/50 text-slate-500 border-slate-700/50 cursor-not-allowed'
                    : 'bg-green-500/10 hover:bg-green-500/20 text-green-400 border-green-500/30'
                    }`}
                >
                  {isOptimized ? <CheckCircle className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  {isOptimized ? 'Optimized' : 'Apply'}
                </button>
              </div>

              <div className="p-6 space-y-5">
                {/* Header Row */}
                <div className="flex items-start gap-4 pr-32">
                  <div className="p-3 bg-blue-500/10 rounded-xl border border-blue-500/20">
                    <Server className="w-6 h-6 text-blue-400" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white mb-1.5">{decision.service}</h3>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs px-2 py-0.5 bg-slate-700 text-slate-300 rounded border border-slate-600">
                        {decision.namespace}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded border ${getStatusColor(decision.status)}`}>
                        {decision.status}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Metrics Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">

                  {/* Timestamp */}
                  <div className="bg-slate-900/30 rounded-lg p-3 border border-slate-700/30">
                    <p className="text-xs text-slate-500 mb-1">Evaluated At</p>
                    <div className="flex items-center gap-2 text-sm text-slate-300">
                      <Calendar className="w-3.5 h-3.5" />
                      {formatTimestamp(decision.evaluatedAt)}
                    </div>
                  </div>

                  {/* Best Node */}
                  <div className="bg-slate-900/30 rounded-lg p-3 border border-slate-700/30">
                    <p className="text-xs text-slate-500 mb-1">Best Node</p>
                    <div className="text-sm font-semibold text-green-400 font-mono">
                      {decision.bestNode || 'N/A'}
                    </div>
                  </div>

                  {/* Current Nodes */}
                  <div className="bg-slate-900/30 rounded-lg p-3 border border-slate-700/30 col-span-1 md:col-span-2">
                    <p className="text-xs text-slate-500 mb-1">Current Nodes</p>
                    <div className="flex flex-wrap gap-1.5">
                      {decision.currentNodes?.length > 0 ? (
                        decision.currentNodes.map(node => (
                          <span key={node} className="text-xs font-mono bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded border border-slate-700">
                            {node}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-slate-600 italic">None</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Scores List */}
                <div className="border-t border-slate-700/50 pt-4">
                  <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-3">Node Scores</p>
                  <div className="flex flex-wrap gap-3">
                    {Object.entries(decision.scores || {})
                      .sort(([, a], [, b]) => b - a)
                      .map(([node, score]) => (
                        <div key={node} className="flex items-center gap-2 bg-slate-900/40 rounded px-2.5 py-1.5 border border-slate-700/40">
                          <span className="text-sm text-slate-400 font-mono">{node}</span>
                          <div className="h-4 w-px bg-slate-700"></div>
                          <span className={`text-sm font-bold ${getScoreColor(score)}`}>{score}</span>
                        </div>
                      ))}
                  </div>
                </div>

              </div>
            </div>
          )
        })}
      </div>

      {/* Apply/Restart Confirm Modal */}
      {applyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-md w-full shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-green-500/10 rounded-lg">
                    <Play className="w-5 h-5 text-green-500" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white">Apply Decision</h3>
                    <p className="text-sm text-slate-400">Apply placement for <b>{selectedDecision?.service}</b></p>
                  </div>
                </div>
                <button type="button"
                  onClick={closeApplyModal}
                  className="text-slate-500 hover:text-white transition-colors"
                  aria-label="Close apply decision modal"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                {!applyResult ? (
                  <>
                    <div className="bg-blue-900/20 border border-blue-900/40 rounded-lg p-3 text-sm text-blue-200/80">
                      <p>This action will restart the pod to allow it to be rescheduled onto the best node (<b>{selectedDecision?.bestNode}</b>).</p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1.5">Select Pod to Restart</label>
                      {availablePods.length > 0 ? (
                        <select
                          value={selectedPod}
                          onChange={(e) => setSelectedPod(e.target.value)}
                          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:border-green-500 focus:ring-1 focus:ring-green-500 focus-visible:outline-2 focus-visible:outline-green-500 focus-visible:outline-offset-2"
                        >
                          {availablePods.map(pod => (
                            <option key={pod} value={pod}>{pod}</option>
                          ))}
                        </select>
                      ) : (
                        <div className="p-3 bg-yellow-900/10 border border-yellow-700/30 rounded-lg text-sm text-yellow-300">
                          No active pods found for this service.
                        </div>
                      )}

                      {availablePods.length > 0 && (
                        <p className="text-xs text-slate-500 mt-1.5">
                          Select the specific pod instance to migrate to the best node.
                        </p>
                      )}
                    </div>

                    <div className="flex gap-3 pt-2">
                      <button type="button"
                        onClick={closeApplyModal}
                        className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors font-medium border border-slate-700"
                      >
                        Cancel
                      </button>
                      <button type="button"
                        onClick={confirmApply}
                        disabled={!selectedPod || applying}
                        className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-900/50 disabled:text-green-300/50 text-white rounded-lg transition-colors font-medium flex items-center justify-center gap-2"
                      >
                        {applying ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            Applying...
                          </>
                        ) : (
                          'Confirm Apply'
                        )}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className={`text-center py-4 ${applyResult.success ? 'text-green-400' : 'text-red-400'}`}>
                    {applyResult.success ? (
                      <div className="flex flex-col items-center gap-2">
                        <div className="p-2 bg-green-900/20 rounded-full border border-green-900/50 mb-2">
                          <CheckCircle className="w-6 h-6" />
                        </div>
                        <h4 className="font-semibold text-lg">Applied Successfully</h4>
                        <p className="text-sm text-slate-400 px-4">{applyResult.message}</p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2">
                        <AlertTriangle className="w-8 h-8 mb-2" />
                        <h4 className="font-semibold text-lg">Apply Failed</h4>
                        <p className="text-sm text-slate-400 px-4">{applyResult.message}</p>
                      </div>
                    )}
                    <button type="button"
                      onClick={closeApplyModal}
                      className="mt-6 px-6 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors"
                    >
                      Close
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
