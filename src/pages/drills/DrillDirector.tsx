import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import toast from 'react-hot-toast'
import DrillCatalog from './components/DrillCatalog'
import RunPanel from './components/RunPanel'
import LiveMetricsStrip from './components/LiveMetricsStrip'
import TimelineReplay from './components/TimelineReplay'
import ValidationPanel from './components/ValidationPanel'
import type { DrillPrefillRequest, DrillRun } from '@/lib/api/drills'
import { getDrillRun, listDrillHistory } from '@/lib/api/drills'
import { useK8sHealth } from '@/lib/useK8sHealth'
import { History, PlayCircle, ShieldCheck, LayoutDashboard, Loader2, WifiOff, RefreshCw, CheckCircle2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, Tab, TabPanel } from '@/components/ui/Tabs'
import PageHeader from '@/components/layout/PageHeader'
import ClusterTopologyMap from '@/pages/overview/ClusterTopologyMap'
import {
  pageContainerClass,
  tableShellClass,
  tableHeadRowClass,
  tableHeaderCellClass,
  tableBodyRowClass,
  tableCellClass,
  tableActionLinkClass,
  cn,
} from '@/components/common/uiClassTokens'

type DirectorTab = 'director' | 'history'
type DrillDirectorLocationState = {
  prefillDrill?: DrillPrefillRequest
  scenarioBannerSeenAt?: string
}

function getRunStatusBadgeClass(status: string): string {
  switch (status) {
    case 'Planned':
      return 'border-slate-400/30 bg-slate-500/10 text-[var(--text-primary)]'
    case 'Running':
      return 'border-sky-400/30 bg-sky-500/10 text-[var(--text-primary)]'
    case 'Observing':
      return 'border-amber-400/30 bg-amber-500/10 text-[var(--text-primary)]'
    case 'AwaitingRecovery':
      return 'border-rose-400/30 bg-rose-500/10 text-[var(--text-primary)]'
    case 'Recovering':
      return 'border-violet-400/30 bg-violet-500/10 text-[var(--text-primary)]'
    case 'Completed':
      return 'border-emerald-400/30 bg-emerald-500/10 text-[var(--text-primary)]'
    case 'Accepted':
      return 'border-teal-400/30 bg-teal-500/10 text-[var(--text-primary)]'
    case 'Aborted':
      return 'border-orange-400/30 bg-orange-500/10 text-[var(--text-primary)]'
    case 'Failed':
      return 'border-rose-400/50 bg-rose-500/10 text-rose-400'
    default:
      return 'border-[var(--border)] bg-[var(--surface-soft)] text-[var(--text-secondary)]'
  }
}

export default function DrillDirector() {
  const location = useLocation()
  const navigate = useNavigate()
  const [selectedTab, setSelectedTab] = useState<DirectorTab>('director')
  const [activeRun, setActiveRun] = useState<DrillRun | null>(null)
  const [history, setHistory] = useState<DrillRun[]>([])
  const [isHistoryLoading, setIsHistoryLoading] = useState(false)
  const [reviewingRunId, setReviewingRunId] = useState<string | null>(null)
  const [prefillDrill, setPrefillDrill] = useState<DrillPrefillRequest | null>(null)
  const [prefillBannerSeenAt, setPrefillBannerSeenAt] = useState<string | null>(null)
  const { status: k8sHealth, isLoading: isK8sProbing, recheck: recheckK8s } = useK8sHealth()

  const isClusterOffline = !isK8sProbing && k8sHealth !== null && !k8sHealth.reachable

  useEffect(() => {
    const state = location.state as DrillDirectorLocationState | null
    if (!state?.prefillDrill) return

    setPrefillDrill(state.prefillDrill)
    setPrefillBannerSeenAt(state.scenarioBannerSeenAt ?? null)
    setSelectedTab('director')
    setActiveRun(null)

    navigate(location.pathname, { replace: true, state: null })
  }, [location.pathname, location.state, navigate])

  useEffect(() => {
    let isMounted = true

    const fetchHistory = async () => {
      setIsHistoryLoading(true)
      try {
        const data = await listDrillHistory()
        if (isMounted) {
          setHistory(data)
        }
      } catch (err) {
        console.error(err)
        toast.error('Failed to load drill history')
      } finally {
        if (isMounted) {
          setIsHistoryLoading(false)
        }
      }
    }

    void fetchHistory()

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    if (!activeRun || !['Completed', 'Aborted', 'Failed', 'Accepted'].includes(activeRun.status)) {
      return
    }

    let isMounted = true
    const refreshHistory = async () => {
      try {
        const data = await listDrillHistory()
        if (isMounted) {
          setHistory(data)
        }
      } catch (err) {
        console.error(err)
      }
    }

    void refreshHistory()
    return () => {
      isMounted = false
    }
  }, [activeRun?.id, activeRun?.status])

  const openRunReview = async (runId: string) => {
    setReviewingRunId(runId)
    try {
      const fullRun = await getDrillRun(runId)
      setActiveRun(fullRun)
      setSelectedTab('director')
    } catch (err) {
      console.error(err)
      toast.error(err instanceof Error ? err.message : 'Failed to load run details')
    } finally {
      setReviewingRunId((current) => (current === runId ? null : current))
    }
  }

  return (
    <div className={pageContainerClass}>
      <PageHeader
        title="Drill Director"
        description="Run safe drills and watch system impact live. Orchestrate chaos sequences with precision and operator-controlled recovery guardrails."
        icon={PlayCircle}
        actions={
          <div className="flex items-center gap-3">
            <Badge
              variant="outline"
              className="flex h-10 items-center gap-2 border-emerald-400/25 bg-emerald-500/8 px-3 py-1 text-[var(--text-primary)] shadow-sm"
            >
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-primary)]">
                Guardrails Active
              </span>
            </Badge>
          </div>
        }
      />

      {/* ── K8s Connectivity Banner ── */}
      {isK8sProbing && (
        <div className="mb-6 flex items-center gap-3 rounded-[var(--radius-md)] border border-sky-400/25 bg-sky-500/8 px-5 py-4">
          <Loader2 className="h-5 w-5 animate-spin text-sky-400" />
          <p className="text-sm font-medium text-[var(--text-secondary)]">
            Checking Kubernetes cluster connectivity…
          </p>
        </div>
      )}

      {isClusterOffline && (
        <div
          className="mb-6 rounded-[var(--radius-md)] border border-amber-400/30 bg-amber-500/8 px-5 py-4"
          role="alert"
          aria-live="assertive"
        >
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 rounded-lg border border-amber-400/20 bg-amber-500/15 p-2">
              <WifiOff className="h-5 w-5 text-amber-400" />
            </div>
            <div className="min-w-0 flex-1 space-y-1.5">
              <h4 className="text-sm font-bold tracking-tight text-amber-300">
                Kubernetes Cluster Unreachable
              </h4>
              <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
                {k8sHealth?.hint ||
                  'The Analysis Engine cannot connect to the Kubernetes API server. All drill operations require a live cluster connection.'}
              </p>
              {k8sHealth?.host && (
                <p className="text-[10px] font-mono text-[var(--text-muted)]">
                  Target: {k8sHealth.host}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-amber-400/70">
                  Drill operations disabled until connection is restored
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onPress={recheckK8s}
                  className="inline-flex h-7 items-center gap-1.5 rounded-md border border-amber-400/25 bg-amber-500/10 px-3 text-[10px] font-bold uppercase tracking-widest text-amber-300 hover:bg-amber-500/20"
                >
                  <RefreshCw className="h-3 w-3" /> Re-check
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {!isK8sProbing && k8sHealth?.reachable && (
        <div className="mb-6 flex items-center gap-3 rounded-[var(--radius-md)] border border-emerald-400/20 bg-emerald-500/6 px-5 py-3">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          <p className="text-xs font-medium text-[var(--text-secondary)]">
            Cluster connected
            {k8sHealth.version && <span className="text-[var(--text-muted)]"> · {k8sHealth.version}</span>}
            {k8sHealth.host && <span className="text-[var(--text-muted)]"> · {k8sHealth.host}</span>}
          </p>
        </div>
      )}

      {/* Cluster Topology — Nodes / Services / Pods */}
      <div className="w-full mb-6">
        <ClusterTopologyMap />
      </div>

      <Tabs
        aria-label="Drill Director Control Panel"
        className="w-full"
        selectedKey={selectedTab}
        onSelectionChange={(key) => setSelectedTab(String(key) as DirectorTab)}
      >
        <TabsList className="mb-8 max-w-fit overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-soft)] shadow-sm">
          <Tab
            id="director"
            className={({ isSelected }) =>
              cn(
                'min-w-[160px] cursor-pointer outline-none transition-all flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-semibold',
                isSelected
                  ? 'bg-[var(--surface-elevated)] text-[var(--text-primary)] shadow-sm'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              )
            }
          >
            <LayoutDashboard className="h-4 w-4" /> Control Room
          </Tab>
          <Tab
            id="history"
            className={({ isSelected }) =>
              cn(
                'min-w-[160px] cursor-pointer outline-none transition-all flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-semibold',
                isSelected
                  ? 'bg-[var(--surface-elevated)] text-[var(--text-primary)] shadow-sm'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              )
            }
          >
            <History className="h-4 w-4" /> Run History
          </Tab>
        </TabsList>

        <TabPanel id="director">
          {activeRun ? (
            <div className="grid animate-in fade-in duration-500 grid-cols-1 gap-6 xl:grid-cols-12">
              <div className="xl:col-span-4">
                <RunPanel run={activeRun} onUpdate={setActiveRun} onClear={() => setActiveRun(null)} />
              </div>
              <div className="space-y-6 xl:col-span-8">
                <ValidationPanel runId={activeRun.id} runStatus={activeRun.status} />
                <LiveMetricsStrip run={activeRun} />
                <TimelineReplay run={activeRun} />
              </div>
            </div>
          ) : (
            <div className="animate-in fade-in duration-500 space-y-6">
              <div className="flex items-center gap-3 px-1">
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-2">
                  <LayoutDashboard className="h-5 w-5 text-emerald-500" />
                </div>
                <div>
                  <h3 className="text-lg font-bold tracking-tight text-[var(--text-primary)]">
                    Scenario Catalog
                  </h3>
                  <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
                    Select a drill sequence to engage
                  </p>
                </div>
              </div>
              <DrillCatalog
                onDrillSelect={setActiveRun}
                disabled={isClusterOffline}
                prefill={prefillDrill}
                prefillBannerSeenAt={prefillBannerSeenAt}
                onPrefillConsumed={() => {
                  setPrefillDrill(null)
                  setPrefillBannerSeenAt(null)
                }}
              />
            </div>
          )}
        </TabPanel>

        <TabPanel id="history">
          <div className={tableShellClass}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className={tableHeadRowClass}>
                  <tr>
                    <th className={tableHeaderCellClass}>Sequence ID</th>
                    <th className={tableHeaderCellClass}>Drill Type</th>
                    <th className={tableHeaderCellClass}>Target Component</th>
                    <th className={tableHeaderCellClass}>Status</th>
                    <th className={tableHeaderCellClass}>Verdict</th>
                    <th className={tableHeaderCellClass}>Engagement Date</th>
                    <th className={cn(tableHeaderCellClass, 'text-right')}>Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {!history || history.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="bg-[var(--surface-soft)]/20 p-12 text-center italic text-[var(--text-muted)]"
                      >
                        <div className="flex flex-col items-center gap-2 opacity-50">
                          {isHistoryLoading ? (
                            <Loader2 className="h-8 w-8 animate-spin" />
                          ) : (
                            <History className="h-8 w-8" />
                          )}
                          <span className="text-xs font-bold uppercase tracking-widest">
                            {isHistoryLoading ? 'Loading drill history' : 'No historical drills found'}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    history.map((run) => {
                      const isReviewing = reviewingRunId === run.id
                      const isSuccessVerdict = run.verdict === 'Success'
                      const isFailureVerdict = /fail|error/i.test(run.verdict)
                      const isAbortedVerdict = /abort/i.test(run.verdict)
                      const historyChipBaseClass = 'px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider'
                      return (
                        <tr
                          key={run.id}
                          className={cn(
                            tableBodyRowClass,
                            'cursor-pointer transition-colors hover:bg-sky-500/5 focus-within:bg-sky-500/5'
                          )}
                          tabIndex={0}
                          onClick={() => void openRunReview(run.id)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault()
                              void openRunReview(run.id)
                            }
                          }}
                          aria-label={`Open drill run ${run.id}`}
                        >
                          <td className={cn(tableCellClass, 'font-mono text-xs font-bold text-sky-500')}>
                            {run.id.split('-')[0].toUpperCase()}
                          </td>
                          <td className={cn(tableCellClass, 'font-semibold')}>{run.type}</td>
                          <td className={tableCellClass}>
                            <code className="rounded-md border border-[var(--border)] bg-[var(--surface-solid)] px-2 py-1 font-mono text-[10px] font-bold text-[var(--text-secondary)]">
                              {run.target}
                            </code>
                          </td>
                          <td className={tableCellClass}>
                            <Badge
                              variant="outline"
                              className={cn(
                                historyChipBaseClass,
                                getRunStatusBadgeClass(run.status)
                              )}
                            >
                              {run.status}
                            </Badge>
                          </td>
                          <td className={tableCellClass}>
                            <Badge
                              variant="outline"
                              className={cn(
                                historyChipBaseClass,
                                isSuccessVerdict && 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700',
                                isFailureVerdict && 'border-rose-400/50 bg-rose-500/10 text-rose-400',
                                isAbortedVerdict && 'border-orange-500/20 bg-orange-500/10 text-orange-700',
                                !isSuccessVerdict &&
                                  !isFailureVerdict &&
                                  !isAbortedVerdict &&
                                  'border-[var(--border)] bg-[var(--surface-soft)] text-[var(--text-primary)]'
                              )}
                            >
                              {run.verdict}
                            </Badge>
                          </td>
                          <td className={cn(tableCellClass, 'text-xs font-medium text-[var(--text-muted)]')}>
                            {new Date(run.startTime).toLocaleString()}
                          </td>
                          <td className={cn(tableCellClass, 'text-right')}>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(event) => event.stopPropagation()}
                              onPress={() => void openRunReview(run.id)}
                              className={cn(
                                tableActionLinkClass,
                                'border-sky-500/25 bg-sky-500/6 text-[10px] font-bold uppercase tracking-widest text-sky-700 hover:bg-sky-500/12 hover:text-sky-800'
                              )}
                              isDisabled={isReviewing}
                            >
                              {isReviewing ? (
                                <span className="inline-flex items-center gap-2">
                                  <Loader2 className="h-3 w-3 animate-spin" /> Loading
                                </span>
                              ) : (
                                'Review Pack'
                              )}
                            </Button>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabPanel>
      </Tabs>
    </div>
  )
}
