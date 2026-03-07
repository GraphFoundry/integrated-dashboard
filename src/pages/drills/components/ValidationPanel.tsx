import { useEffect, useMemo, useState } from 'react'
import { Activity, Clock3, Loader2, Monitor, ServerCog } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn, glassSurfaceClass } from '@/components/common/uiClassTokens'
import { getDrillRunSnapshot, type DrillRunSnapshot } from '@/lib/api/drills'

const POLLABLE_STATUSES = new Set(['Running', 'Observing', 'AwaitingRecovery', 'Recovering'])

function shouldPollSnapshot(runStatus: string): boolean {
  return POLLABLE_STATUSES.has(runStatus)
}

function getLayerStatusClass(status: string): string {
  switch (status) {
    case 'match':
      return 'border-emerald-400/25 bg-emerald-500/10 text-emerald-500'
    case 'mismatch':
      return 'border-rose-400/30 bg-rose-500/10 text-rose-500'
    case 'missing':
      return 'border-amber-400/30 bg-amber-500/10 text-amber-500'
    default:
      return 'border-[var(--border)] bg-[var(--surface-soft)] text-[var(--text-secondary)]'
  }
}

function getVerdictClass(verdict: string): string {
  switch (verdict) {
    case 'passed':
      return 'border-emerald-400/20 bg-emerald-500/10 text-emerald-500'
    case 'failed':
      return 'border-rose-400/25 bg-rose-500/10 text-rose-500'
    default:
      return 'border-[var(--border)] bg-[var(--surface-soft)] text-[var(--text-secondary)]'
  }
}

function formatTimestamp(timestamp?: string): string {
  if (!timestamp) return '--'
  const parsed = new Date(timestamp)
  if (Number.isNaN(parsed.getTime())) {
    return timestamp
  }
  return parsed.toLocaleString()
}

type ValidationPanelProps = {
  runId: string
  runStatus: string
}

export default function ValidationPanel({ runId, runStatus }: ValidationPanelProps) {
  const [snapshot, setSnapshot] = useState<DrillRunSnapshot | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true
    let pollInterval: number | null = null

    const fetchSnapshot = async (initialLoad: boolean) => {
      if (initialLoad) {
        setIsLoading(true)
      }

      try {
        const result = await getDrillRunSnapshot(runId)
        if (!isMounted) return
        setSnapshot(result)
        setErrorMessage(null)
      } catch (err) {
        if (!isMounted) return
        const message = err instanceof Error ? err.message : 'Failed to load validation snapshot'
        setErrorMessage(message)
      } finally {
        if (isMounted && initialLoad) {
          setIsLoading(false)
        }
      }
    }

    setSnapshot(null)
    setErrorMessage(null)
    void fetchSnapshot(true)

    if (shouldPollSnapshot(runStatus)) {
      pollInterval = window.setInterval(() => {
        void fetchSnapshot(false)
      }, 3000)
    }

    return () => {
      isMounted = false
      if (pollInterval !== null) {
        window.clearInterval(pollInterval)
      }
    }
  }, [runId, runStatus])

  const layerCards = useMemo(() => {
    if (!snapshot) return []

    return [
      {
        key: 'vm',
        label: 'VM',
        status: snapshot.comparison.vm.status,
        timestamp: snapshot.vmState.sourceTimestamp ?? snapshot.snapshotTimestamp,
        icon: <ServerCog className="h-4 w-4 text-sky-500" />,
      },
      {
        key: 'api',
        label: 'API',
        status: snapshot.comparison.api.status,
        timestamp: snapshot.backendMetrics.sourceTimestamp ?? snapshot.snapshotTimestamp,
        icon: <Activity className="h-4 w-4 text-sky-500" />,
      },
      {
        key: 'ui',
        label: 'UI Metrics',
        status: snapshot.comparison.uiMetrics.status,
        timestamp: snapshot.dashboardMetrics.sourceTimestamp ?? snapshot.snapshotTimestamp,
        icon: <Monitor className="h-4 w-4 text-sky-500" />,
      },
      {
        key: 'graph',
        label: 'Graph',
        status: snapshot.comparison.graph.status,
        timestamp: snapshot.graphSummary.sourceTimestamp ?? snapshot.snapshotTimestamp,
        icon: <ServerCog className="h-4 w-4 text-sky-500" />,
      },
    ]
  }, [snapshot])

  return (
    <Card
      className={cn(
        glassSurfaceClass,
        'relative overflow-hidden rounded-[var(--radius-lg)] bg-[var(--surface-contrast)]/30 backdrop-blur-xl'
      )}
    >
      <CardHeader className="border-b border-[var(--border)] bg-[var(--surface-soft)]/20 px-6 py-6 pb-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg border border-sky-500/20 bg-sky-500/10 p-2 shadow-sm">
              <Clock3 className="h-5 w-5 text-sky-400" />
            </div>
            <div>
              <CardTitle className="text-lg font-bold tracking-tight text-[var(--text-primary)]">
                Cross-layer Validation
              </CardTitle>
              <p className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
                VM, API, UI metrics, and graph states
              </p>
            </div>
          </div>

          <Badge
            variant="outline"
            className={cn(
              'px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
              getVerdictClass(snapshot?.comparison.scenarioVerdict ?? 'missing')
            )}
          >
            {snapshot?.comparison.scenarioVerdict ?? 'loading'}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 p-6">
        {isLoading && !snapshot ? (
          <div className="flex min-h-[140px] items-center justify-center gap-2 text-[var(--text-muted)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-xs font-medium">Loading validation layers…</span>
          </div>
        ) : (
          <>
            {errorMessage && (
              <div className="rounded-lg border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-[11px] font-medium text-amber-600">
                {errorMessage}
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {layerCards.map((layer) => (
                <article
                  key={layer.key}
                  className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)]/30 p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="rounded-md border border-[var(--border)] bg-[var(--surface-solid)] p-1.5">
                        {layer.icon}
                      </span>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                        {layer.label}
                      </span>
                    </div>

                    <Badge
                      variant="outline"
                      className={cn(
                        'px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                        getLayerStatusClass(layer.status)
                      )}
                    >
                      {layer.status}
                    </Badge>
                  </div>

                  <div className="mt-3 rounded-lg border border-[var(--border)]/80 bg-[var(--surface-solid)]/50 px-3 py-2">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
                      Source Timestamp
                    </p>
                    <p className="mt-1 font-mono text-[11px] font-semibold text-[var(--text-secondary)]">
                      {formatTimestamp(layer.timestamp)}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
