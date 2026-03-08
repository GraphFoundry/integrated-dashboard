import { useState, useEffect } from 'react'
import { RefreshCw, Calendar, Filter, Server, X, Play, CheckCircle, AlertTriangle, ArrowRightLeft, Star, StarOff } from 'lucide-react'
import toast from 'react-hot-toast'
import PageHeader from '@/components/layout/PageHeader'
import Section from '@/components/layout/Section'
import EmptyState from '@/components/layout/EmptyState'
import SkeletonBlock from '@/components/common/SkeletonBlock'
import {
  cn,
  controlInputPanelClass,
  controlLabelClass,
  glassInteractiveCardClass,
  loadingCardClass,
  modalPanelClass,
  pageContainerClass,
  secondaryButtonClass,
  subtleIconButtonClass,
  successButtonClass,
} from '@/components/common/uiClassTokens'
import { Select } from '@/components/ui'
import { schedulerApi } from '@/lib/schedulerApiClient'
import { createApiClient } from '@/lib/httpClient'
import { env } from '@/lib/env'

const bffApi = createApiClient(env.BFF_URL)

interface SchedulerDecision {
  namespace: string
  service: string
  status: string
  currentNodes: string[]
  bestNode: string
  preferredNode?: string
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

interface ChangeNodeResponse {
  success: boolean
  message: string
  previousNode?: string
  targetNode?: string
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
      <Select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(controlInputPanelClass, 'appearance-none pr-11')}
      >
        <option value="">{allLabel}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </Select>
    </div>
  )
}

interface DecisionMetricCardProps {
  readonly label: string
  readonly className?: string
  readonly children: React.ReactNode
}

function DecisionMetricCard({ label, className = '', children }: DecisionMetricCardProps) {
  return (
    <div className={`surface-glass rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] p-3 ${className}`}>
      <p className="mb-1 text-xs text-[var(--text-dim)]">{label}</p>
      {children}
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

  // Change Node modal state
  const [changeNodeModalOpen, setChangeNodeModalOpen] = useState(false)
  const [changeNodeDecision, setChangeNodeDecision] = useState<SchedulerDecision | null>(null)
  const [changeNodeTarget, setChangeNodeTarget] = useState('')
  const [changeNodePod, setChangeNodePod] = useState('')
  const [changeNodePods, setChangeNodePods] = useState<string[]>([])
  const [changeNodeConfirmed, setChangeNodeConfirmed] = useState(false)
  const [changingNode, setChangingNode] = useState(false)
  const [changeNodeResult, setChangeNodeResult] = useState<ChangeNodeResponse | null>(null)

  // Preference state
  const [settingPreference, setSettingPreference] = useState<string | null>(null) // service key while saving

  const loadData = async () => {
    setLoading(true)
    try {
      const [decisionsRes, podsRes] = await Promise.all([
        schedulerApi.get<SchedulerDecision[]>('/decisions'),
        bffApi.get<{ podsByService: Record<string, Array<{ name: string; namespace: string; node: string; phase: string; ready: boolean }>> }>('/api/k8s/pods').catch(() => ({ data: { podsByService: {} } }))
      ])

      const decisionsData = decisionsRes.data
      const podsByService = podsRes.data.podsByService || {}

      // Map service name → pod names (only Running pods)
      const svcMap: Record<string, string[]> = {}
      for (const [svc, pods] of Object.entries(podsByService)) {
        const activePods = pods
          .filter(p => p.phase === 'Running')
          .map(p => p.name)
        if (activePods.length > 0) {
          svcMap[svc] = activePods
        }
      }
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

  const handleChangeNodeClick = (decision: SchedulerDecision) => {
    setChangeNodeDecision(decision)
    const pods = services[decision.service] || []
    setChangeNodePods(pods.sort())
    setChangeNodePod(pods.length > 0 ? pods[0] : '')
    setChangeNodeTarget('')
    setChangeNodeConfirmed(false)
    setChangeNodeResult(null)
    setChangeNodeModalOpen(true)
  }

  const closeChangeNodeModal = () => {
    setChangeNodeModalOpen(false)
    setChangeNodeDecision(null)
    setChangeNodeTarget('')
    setChangeNodePod('')
    setChangeNodePods([])
    setChangeNodeConfirmed(false)
    setChangeNodeResult(null)
  }

  const confirmChangeNode = async () => {
    if (!changeNodeDecision || !changeNodePod || !changeNodeTarget) return

    setChangingNode(true)
    setChangeNodeResult(null)

    try {
      const { data } = await schedulerApi.post<ChangeNodeResponse>('/change-node', {
        namespace: changeNodeDecision.namespace,
        podName: changeNodePod,
        targetNode: changeNodeTarget,
      })

      setChangeNodeResult({
        success: true,
        message: data.message || `Pod rescheduled to ${changeNodeTarget}`,
        previousNode: data.previousNode,
        targetNode: data.targetNode,
      })
      toast.success(data.message || `Pod rescheduled to ${changeNodeTarget}`)

      setTimeout(() => loadData(), 2000)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to change node'
      setChangeNodeResult({
        success: false,
        message: errorMessage,
      })
      toast.error(errorMessage)
    } finally {
      setChangingNode(false)
    }
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

  const handleSetPreference = async (decision: SchedulerDecision, node: string) => {
    const key = `${decision.namespace}/${decision.service}`
    setSettingPreference(key)
    try {
      await schedulerApi.post('/preference', {
        namespace: decision.namespace,
        service: decision.service,
        node,
      })
      toast.success(`Preference set: ${decision.service} → ${node}`)
      await loadData()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to set preference')
    } finally {
      setSettingPreference(null)
    }
  }

  const handleResetPreference = async (decision: SchedulerDecision) => {
    const key = `${decision.namespace}/${decision.service}`
    setSettingPreference(key)
    try {
      await schedulerApi.delete('/preference', {
        params: { namespace: decision.namespace, service: decision.service },
      })
      toast.success(`Preference reset for ${decision.service}`)
      await loadData()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reset preference')
    } finally {
      setSettingPreference(null)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Scheduled':
        return 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-400 border-emerald-500/40 dark:bg-emerald-500/20 dark:border-emerald-500/30'
      case 'NoPeers':
        return 'bg-amber-500/15 text-amber-800 dark:text-amber-400 border-amber-500/40 dark:bg-amber-500/20 dark:border-amber-500/30'
      case 'NoMetrics':
        return 'bg-orange-500/15 text-orange-800 dark:text-orange-400 border-orange-500/40 dark:bg-orange-500/20 dark:border-orange-500/30'
      case 'StaleMetrics':
        return 'bg-rose-500/15 text-rose-800 dark:text-rose-400 border-rose-500/40 dark:bg-rose-500/20 dark:border-rose-500/30'
      default:
        return 'bg-[var(--surface-subtle)] text-[var(--text-secondary)] border-[var(--border)]'
    }
  }

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-emerald-600 dark:text-emerald-400'
    if (score >= 50) return 'text-amber-600 dark:text-amber-400'
    return 'text-rose-600 dark:text-rose-400'
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
    <div className={`${pageContainerClass} pb-20`}>
      <PageHeader
        title="Scheduler Decisions"
        description="Real-time Kubernetes scheduling decisions. Apply recommendations to optimize placement."
        icon={Server}
        actions={
          <div className="flex items-center gap-3">
            <button type="button"
              onClick={loadData}
              disabled={loading}
              className={cn(subtleIconButtonClass)}
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
              'h-11 whitespace-nowrap px-6'
            )}
          >
            Clear Filters
          </button>
        </div>
      </Section>

      {/* Loading State */}
      {loading && decisions.length === 0 && (
        <div className={cn(loadingCardClass, 'space-y-4 p-6 text-left')} aria-label="Loading scheduler decisions">
          <SkeletonBlock variant="title" className="w-1/3" />
          <SkeletonBlock variant="line" className="w-1/2" />
          {Array.from({ length: 3 }).map((_, index) => (
            <SkeletonBlock key={`scheduler-skeleton-${index}`} variant="card" className="h-28" />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && filteredDecisions.length === 0 && (
        <EmptyState
          icon={<Server className="h-12 w-12 text-[var(--text-dim)]" />}
          title="No decisions found"
          message="Try adjusting your filters."
          description="No scheduling events currently match the selected criteria."
        />
      )}

      {/* Decisions Grid */}
      <div className="grid grid-cols-1 gap-6">
        {filteredDecisions.map((decision, idx) => {
          // Disable Apply if the best node is already one of the current nodes
          const isOptimized = decision.currentNodes?.includes(decision.bestNode)

          return (
            <div
              key={`${decision.namespace}-${decision.service}-${decision.evaluatedAt}-${idx}`}
              className={cn(
                glassInteractiveCardClass,
                'group relative border-[var(--border)] bg-[var(--surface-subtle)] hover:border-cyan-300/25 hover:shadow-[0_18px_34px_rgba(2,6,23,0.4)]'
              )}
            >
              {/* Action Bar (Top Right) */}
              <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
                {decision.preferredNode && (
                  <button type="button"
                    onClick={() => handleResetPreference(decision)}
                    disabled={settingPreference === `${decision.namespace}/${decision.service}`}
                    className="neon-focus-ring interactive-soft flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium border-amber-500/50 bg-amber-600/15 text-amber-800 dark:text-amber-200 hover:bg-amber-500/20"
                    title="Remove node preference and let the scheduler decide"
                  >
                    <StarOff className="w-3.5 h-3.5" />
                    Clear Preference
                  </button>
                )}
                <button type="button"
                  onClick={() => handleChangeNodeClick(decision)}
                  className="neon-focus-ring interactive-soft flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium border-blue-500/50 bg-blue-600/15 text-blue-800 dark:text-blue-200 hover:bg-blue-600/25"
                >
                  <ArrowRightLeft className="w-3.5 h-3.5" />
                  Change Node
                </button>
                <button type="button"
                  onClick={() => handleApplyClick(decision)}
                  disabled={isOptimized}
                  className={`neon-focus-ring interactive-soft flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium ${isOptimized
                    ? 'cursor-not-allowed border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--text-dim)]'
                    : 'border-emerald-500/50 bg-emerald-600/15 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-600/25'
                    }`}
                >
                  {isOptimized ? <CheckCircle className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  {isOptimized ? 'Optimized' : 'Apply'}
                </button>
              </div>

              <div className="p-6 space-y-5">
                {/* Preference Banner */}
                {decision.preferredNode && (
                  <div className="flex items-center justify-between rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                      <span className="text-sm font-medium text-amber-700 dark:text-amber-300">
                        Manual preference active — pinned to <span className="font-mono font-bold">{decision.preferredNode}</span>
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleResetPreference(decision)}
                      disabled={settingPreference === `${decision.namespace}/${decision.service}`}
                      className="flex items-center gap-1.5 rounded-md border border-amber-500/50 bg-amber-600/15 px-2.5 py-1 text-xs font-medium text-amber-800 dark:text-amber-300 hover:bg-amber-500/20 transition-colors"
                    >
                      <StarOff className="w-3.5 h-3.5" />
                      Clear &amp; let scheduler decide
                    </button>
                  </div>
                )}

                {/* Header Row */}
                <div className="flex items-start gap-4 pr-32">
                  <div className="p-3 bg-blue-500/10 rounded-xl border border-blue-500/20">
                    <Server className="w-6 h-6 text-blue-400" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-[var(--text-primary)] mb-1.5">{decision.service}</h3>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs px-2 py-0.5 bg-[var(--surface-soft)] text-[var(--text-secondary)] rounded border border-[var(--border-strong)]">
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
                  <DecisionMetricCard label="Evaluated At">
                    <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                      <Calendar className="w-3.5 h-3.5" />
                      {formatTimestamp(decision.evaluatedAt)}
                    </div>
                  </DecisionMetricCard>

                  {/* Best Node */}
                  <DecisionMetricCard label="Best Node">
                    <div className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 font-mono">
                      {decision.bestNode || 'N/A'}
                    </div>
                  </DecisionMetricCard>

                  {/* Preferred Node */}
                  {decision.preferredNode && (
                    <DecisionMetricCard label="Preferred Node (User)">
                      <div className="flex items-center gap-1.5 text-sm font-semibold text-amber-500 dark:text-amber-400 font-mono">
                        <Star className="w-3.5 h-3.5 fill-amber-400" />
                        {decision.preferredNode}
                      </div>
                    </DecisionMetricCard>
                  )}

                  {/* Current Nodes */}
                  <DecisionMetricCard label="Current Nodes" className="col-span-1 md:col-span-2">
                    <div className="flex flex-wrap gap-1.5">
                      {decision.currentNodes?.length > 0 ? (
                        decision.currentNodes.map(node => (
                          <span key={node} className="text-xs font-mono bg-[var(--surface-solid)] text-[var(--text-secondary)] px-1.5 py-0.5 rounded border border-[var(--border)]">
                            {node}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-[var(--text-dim)] italic">None</span>
                      )}
                    </div>
                  </DecisionMetricCard>
                </div>

                {/* Scores List */}
                <div className="border-t border-[var(--border)] pt-4">
                  <p className="text-xs uppercase tracking-wider text-[var(--text-dim)] font-semibold mb-3">Node Scores</p>
                  <div className="flex flex-wrap gap-3">
                    {Object.entries(decision.scores || {})
                      .sort(([, a], [, b]) => b - a)
                      .map(([node, score]) => (
                        <div key={node} className="flex items-center gap-2 bg-[var(--surface-subtle)] rounded px-2.5 py-1.5 border border-[var(--border)]">
                          <span className="text-sm text-[var(--text-muted)] font-mono">{node}</span>
                          <div className="h-4 w-px bg-[var(--surface-soft)]"></div>
                          <span className={`text-sm font-bold ${getScoreColor(score)}`}>{score}</span>
                          <button
                            type="button"
                            onClick={() => handleSetPreference(decision, node)}
                            disabled={settingPreference === `${decision.namespace}/${decision.service}`}
                            className={`ml-1 p-0.5 rounded transition-colors ${decision.preferredNode === node
                              ? 'text-amber-400'
                              : 'text-[var(--text-dim)] hover:text-amber-400'
                              }`}
                            title={decision.preferredNode === node ? `${node} is preferred` : `Set ${node} as preferred`}
                          >
                            <Star className={`w-3.5 h-3.5 ${decision.preferredNode === node ? 'fill-amber-400' : ''}`} />
                          </button>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--overlay-backdrop)] backdrop-blur-sm animate-in fade-in duration-200">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="apply-decision-title"
            className={cn(modalPanelClass, 'max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200')}
          >
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-green-500/10 rounded-lg">
                    <Play className="w-5 h-5 text-green-500" />
                  </div>
                  <div>
                    <h3 id="apply-decision-title" className="text-lg font-semibold text-[var(--text-primary)]">
                      Apply Decision
                    </h3>
                    <p className="text-sm text-[var(--text-muted)]">Apply placement for <b>{selectedDecision?.service}</b></p>
                  </div>
                </div>
                <button type="button"
                  onClick={closeApplyModal}
                  className={cn(subtleIconButtonClass, 'h-9 w-9 bg-[var(--surface-subtle)] text-[var(--text-muted)]')}
                  aria-label="Close apply decision modal"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                {!applyResult ? (
                  <>
                    <div className="surface-glass rounded-lg border border-cyan-300/24 bg-cyan-400/10 p-3 text-sm text-[var(--text-secondary)]">
                      <p>This action will restart the pod to allow it to be rescheduled onto the best node (<b>{selectedDecision?.bestNode}</b>).</p>
                    </div>

                    <div>
                      <label htmlFor="pod-select" className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
                        Select Pod to Restart
                      </label>
                      {availablePods.length > 0 ? (
                        <Select
                          id="pod-select"
                          value={selectedPod}
                          onChange={(e) => setSelectedPod(e.target.value)}
                          className={cn(controlInputPanelClass, 'appearance-none pr-11')}
                        >
                          {availablePods.map(pod => (
                            <option key={pod} value={pod}>{pod}</option>
                          ))}
                        </Select>
                      ) : (
                        <div className="p-3 bg-amber-100/50 dark:bg-yellow-900/10 border border-amber-500/30 dark:border-yellow-700/30 rounded-lg text-sm text-amber-800 dark:text-yellow-300">
                          No active pods found for this service.
                        </div>
                      )}

                      {availablePods.length > 0 && (
                        <p className="text-xs text-[var(--text-dim)] mt-1.5">
                          Select the specific pod instance to migrate to the best node.
                        </p>
                      )}
                    </div>

                    <div className="flex gap-3 pt-2">
                      <button type="button"
                        onClick={closeApplyModal}
                        className={cn(secondaryButtonClass, 'flex-1')}
                      >
                        Cancel
                      </button>
                      <button type="button"
                        onClick={confirmApply}
                        disabled={!selectedPod || applying}
                        className={cn(successButtonClass, 'flex-1 justify-center gap-2')}
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
                        <p className="text-sm text-[var(--text-muted)] px-4">{applyResult.message}</p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2">
                        <AlertTriangle className="w-8 h-8 mb-2" />
                        <h4 className="font-semibold text-lg">Apply Failed</h4>
                        <p className="text-sm text-[var(--text-muted)] px-4">{applyResult.message}</p>
                      </div>
                    )}
                    <button type="button"
                      onClick={closeApplyModal}
                      className={cn(secondaryButtonClass, 'mt-6 px-6')}
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

      {/* Change Node Modal */}
      {changeNodeModalOpen && changeNodeDecision && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--overlay-backdrop)] backdrop-blur-sm animate-in fade-in duration-200">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="change-node-title"
            className={cn(modalPanelClass, 'max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200')}
          >
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-blue-500/10 rounded-lg">
                    <ArrowRightLeft className="w-5 h-5 text-blue-500" />
                  </div>
                  <div>
                    <h3 id="change-node-title" className="text-lg font-semibold text-[var(--text-primary)]">
                      Change Node
                    </h3>
                    <p className="text-sm text-[var(--text-muted)]">Move pod for <b>{changeNodeDecision.service}</b></p>
                  </div>
                </div>
                <button type="button"
                  onClick={closeChangeNodeModal}
                  className={cn(subtleIconButtonClass, 'h-9 w-9 bg-[var(--surface-subtle)] text-[var(--text-muted)]')}
                  aria-label="Close change node modal"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                {!changeNodeResult ? (
                  <>
                    {/* Pod Selection */}
                    <div>
                      <label htmlFor="change-pod-select" className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
                        Select Pod
                      </label>
                      {changeNodePods.length > 0 ? (
                        <Select
                          id="change-pod-select"
                          value={changeNodePod}
                          onChange={(e) => setChangeNodePod(e.target.value)}
                          className={cn(controlInputPanelClass, 'appearance-none pr-11')}
                        >
                          {changeNodePods.map(pod => (
                            <option key={pod} value={pod}>{pod}</option>
                          ))}
                        </Select>
                      ) : (
                        <div className="p-3 bg-amber-100/50 dark:bg-yellow-900/10 border border-amber-500/30 dark:border-yellow-700/30 rounded-lg text-sm text-amber-800 dark:text-yellow-300">
                          No active pods found for this service.
                        </div>
                      )}
                    </div>

                    {/* Target Node Selection */}
                    <div>
                      <label htmlFor="target-node-select" className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
                        Target Node
                      </label>
                      <Select
                        id="target-node-select"
                        value={changeNodeTarget}
                        onChange={(e) => {
                          setChangeNodeTarget(e.target.value)
                          setChangeNodeConfirmed(false)
                        }}
                        className={cn(controlInputPanelClass, 'appearance-none pr-11')}
                      >
                        <option value="">Select a node...</option>
                        {Object.entries(changeNodeDecision.scores || {})
                          .sort(([, a], [, b]) => b - a)
                          .map(([node, score]) => (
                            <option key={node} value={node}>
                              {node} (score: {score}){changeNodeDecision.currentNodes?.includes(node) ? ' — current' : ''}{node === changeNodeDecision.bestNode ? ' — recommended' : ''}
                            </option>
                          ))}
                      </Select>
                    </div>

                    {/* Confirmation Checkbox */}
                    {changeNodeTarget && changeNodePod && (
                      <div className="surface-glass rounded-lg border border-amber-300/24 bg-amber-400/10 p-3">
                        <label className="flex items-start gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={changeNodeConfirmed}
                            onChange={(e) => setChangeNodeConfirmed(e.target.checked)}
                            className="mt-0.5 h-4 w-4 rounded border-[var(--border)] bg-[var(--surface-subtle)] text-blue-500 focus:ring-blue-500/30"
                          />
                          <span className="text-sm text-[var(--text-secondary)]">
                            I confirm that I want to move pod <b className="font-mono text-xs">{changeNodePod}</b> to node <b className="font-mono text-xs">{changeNodeTarget}</b>. This will delete the pod and the controller will recreate it.
                          </span>
                        </label>
                      </div>
                    )}

                    <div className="flex gap-3 pt-2">
                      <button type="button"
                        onClick={closeChangeNodeModal}
                        className={cn(secondaryButtonClass, 'flex-1')}
                      >
                        Cancel
                      </button>
                      <button type="button"
                        onClick={confirmChangeNode}
                        disabled={!changeNodePod || !changeNodeTarget || !changeNodeConfirmed || changingNode}
                        className={cn(successButtonClass, 'flex-1 justify-center gap-2')}
                      >
                        {changingNode ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            Moving...
                          </>
                        ) : (
                          'Confirm Change'
                        )}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className={`text-center py-4 ${changeNodeResult.success ? 'text-green-400' : 'text-red-400'}`}>
                    {changeNodeResult.success ? (
                      <div className="flex flex-col items-center gap-2">
                        <div className="p-2 bg-green-900/20 rounded-full border border-green-900/50 mb-2">
                          <CheckCircle className="w-6 h-6" />
                        </div>
                        <h4 className="font-semibold text-lg">Node Changed</h4>
                        <p className="text-sm text-[var(--text-muted)] px-4">{changeNodeResult.message}</p>
                        {changeNodeResult.previousNode && (
                          <p className="text-xs text-[var(--text-dim)]">
                            {changeNodeResult.previousNode} → {changeNodeResult.targetNode}
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2">
                        <AlertTriangle className="w-8 h-8 mb-2" />
                        <h4 className="font-semibold text-lg">Change Failed</h4>
                        <p className="text-sm text-[var(--text-muted)] px-4">{changeNodeResult.message}</p>
                      </div>
                    )}
                    <button type="button"
                      onClick={closeChangeNodeModal}
                      className={cn(secondaryButtonClass, 'mt-6 px-6')}
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
