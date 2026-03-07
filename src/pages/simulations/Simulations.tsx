import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { Activity, AlertTriangle, Clock3, Network, Settings, ShieldCheck, Sparkles, TrendingUp, Zap } from 'lucide-react'
import toast from 'react-hot-toast'
import PageHeader from '@/components/layout/PageHeader'
import KPIStatCard from '@/components/layout/KPIStatCard'
import Section from '@/components/layout/Section'
import EmptyState from '@/components/layout/EmptyState'
import LoadingSpinner from '@/components/common/LoadingSpinner'
import {
  loadingCardClass,
  pageContainerClass,
  tableBodyRowClass,
  tableCellClass,
  tableHeadRowClass,
  tableHeaderCellClass,
  tableShellClass,
} from '@/components/common/uiClassTokens'
import ScenarioForm from '@/pages/simulations/ScenarioForm'
import ClusterTopologyMap from '@/pages/overview/ClusterTopologyMap'
import {
  getCurrentPredictiveAction,
  getSimulationCapabilities,
  getSimulationContext,
  simulateFailure,
  simulateScale,
  simulateServiceAddition,
} from '@/lib/api'
import { formatMs, formatPercent, formatRps } from '@/lib/format'
import type {
  FailureResponse,
  ScaleResponse,
  Scenario,
  ScenarioType,
  ServiceAdditionResponse,
  SimulationCapabilitiesResponse,
  SimulationContextResponse,
  PredictiveCurrentActionResponse,
} from '@/lib/types'

type SimulationResult = FailureResponse | ScaleResponse | ServiceAdditionResponse

function statusBadge(status?: string) {
  const styles: Record<string, string> = {
    target_failed: 'border-rose-500/50 bg-rose-500/12 text-[var(--text-primary)]',
    broken: 'border-amber-500/50 bg-amber-500/12 text-[var(--text-primary)]',
    unreachable: 'border-red-500/50 bg-red-500/12 text-[var(--text-primary)]',
    normal: 'border-emerald-500/45 bg-emerald-500/12 text-[var(--text-primary)]',
  }
  const labels: Record<string, string> = {
    target_failed: 'Target failed',
    broken: 'Broken path',
    unreachable: 'Unreachable',
    normal: 'Healthy',
  }
  const className = styles[status ?? 'normal'] ?? styles.normal
  const label = labels[status ?? 'normal'] ?? labels.normal
  return <span className={`rounded border px-2 py-0.5 text-xs font-medium ${className}`}>{label}</span>
}

function isServiceAdditionResult(result: SimulationResult): result is ServiceAdditionResponse {
  return 'targetServiceName' in result
}

function isScaleResult(result: SimulationResult): result is ScaleResponse {
  return !isServiceAdditionResult(result) && 'latencyEstimate' in result
}

function getScaleCallers(result: ScaleResponse) {
  if (Array.isArray(result.affectedCallers)) {
    return result.affectedCallers
  }
  return result.affectedCallers?.items ?? []
}

const CONTEXT_REFRESH_MS = 8000
const NETWORK_PRESSURE_P95_MS = 250

type AggregatedContextEdge = {
  source: string
  target: string
  avgRate: number
  peakRate: number
  avgP95: number
  peakP95: number
  maxErrorRate: number
  sampleCount: number
}

function shortServiceName(serviceId?: string): string {
  if (!serviceId) return 'unknown'
  const parts = serviceId.split(':')
  return parts.length === 2 ? parts[1] : serviceId
}

function aggregateContextEdges(context: SimulationContextResponse): AggregatedContextEdge[] {
  const byLink = new Map<string, AggregatedContextEdge>()
  for (const edge of context.edges) {
    const source = edge.source
    const target = edge.target
    const key = `${source}=>${target}`
    const existing = byLink.get(key)
    if (!existing) {
      byLink.set(key, {
        source,
        target,
        avgRate: edge.rate ?? 0,
        peakRate: edge.rate ?? 0,
        avgP95: edge.p95 ?? 0,
        peakP95: edge.p95 ?? 0,
        maxErrorRate: edge.errorRate ?? 0,
        sampleCount: 1,
      })
      continue
    }

    const nextCount = existing.sampleCount + 1
    existing.avgRate = (existing.avgRate * existing.sampleCount + (edge.rate ?? 0)) / nextCount
    existing.avgP95 = (existing.avgP95 * existing.sampleCount + (edge.p95 ?? 0)) / nextCount
    existing.peakRate = Math.max(existing.peakRate, edge.rate ?? 0)
    existing.peakP95 = Math.max(existing.peakP95, edge.p95 ?? 0)
    existing.maxErrorRate = Math.max(existing.maxErrorRate, edge.errorRate ?? 0)
    existing.sampleCount = nextCount
  }

  return Array.from(byLink.values()).sort((a, b) => {
    const leftPressure = a.peakRate * (1 + a.maxErrorRate * 8) + a.peakP95 / 30
    const rightPressure = b.peakRate * (1 + b.maxErrorRate * 8) + b.peakP95 / 30
    return rightPressure - leftPressure
  })
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function deriveHealthScore(
  context: SimulationContextResponse,
  hottestEdge: AggregatedContextEdge | null
): number {
  if (context.nodes.length === 0) return 100

  const availabilityPct =
    context.nodes.reduce((acc, node) => acc + (node.availability ?? 1) * 100, 0) / context.nodes.length

  const maxEdgeErrorPct = hottestEdge ? hottestEdge.maxErrorRate * 100 : 0
  const worstP95 = hottestEdge?.peakP95 ?? 0
  const latencyPenalty = Math.min(28, worstP95 / 45)
  const errorPenalty = Math.min(26, maxEdgeErrorPct * 2.5)
  const availabilityPenalty = Math.max(0, 100 - availabilityPct) * 0.7

  return Math.round(clamp(100 - latencyPenalty - errorPenalty - availabilityPenalty, 0, 100))
}

function formatPredictiveBottleneck(payload: PredictiveCurrentActionResponse | null): string | null {
  const bottleneck = payload?.primaryBottleneck
  if (!bottleneck) return null

  if (bottleneck.type === 'capacity') {
    if (bottleneck.service && bottleneck.node) {
      return `${bottleneck.service} on ${bottleneck.node}`
    }
    return bottleneck.service || bottleneck.node || null
  }

  const source = [bottleneck.sourceService, bottleneck.sourceNode].filter(Boolean).join('@')
  const target = [bottleneck.targetService, bottleneck.targetNode].filter(Boolean).join('@')
  if (source && target) return `${source} -> ${target}`
  return source || target || null
}

function deriveTimeToImpact(
  payload: PredictiveCurrentActionResponse | null,
  hottestEdge: AggregatedContextEdge | null
): string {
  if (payload?.timeToImpactSec != null) {
    return `~${payload.timeToImpactSec}s`
  }

  if (!hottestEdge) return 'Stable'

  if (hottestEdge.peakP95 >= 2000 || hottestEdge.maxErrorRate >= 0.02) {
    return '< 2 min'
  }
  if (hottestEdge.peakP95 >= 1000 || hottestEdge.peakRate >= 150) {
    return '< 5 min'
  }
  if (hottestEdge.peakP95 >= NETWORK_PRESSURE_P95_MS || hottestEdge.peakRate >= 60) {
    return '< 10 min'
  }

  return 'Stable'
}

export default function Simulations() {
  const [searchParams] = useSearchParams()
  const [scenarioType, setScenarioType] = useState<ScenarioType>('failure')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<SimulationResult | null>(null)
  const [lastScenario, setLastScenario] = useState<Scenario | null>(null)

  const [capabilities, setCapabilities] = useState<SimulationCapabilitiesResponse>({
    enabled: ['failure', 'scale'],
    experimental: [],
  })

  const [selectedServiceId, setSelectedServiceId] = useState('')
  const [selectedDepth, setSelectedDepth] = useState(1)
  const [contextData, setContextData] = useState<SimulationContextResponse | null>(null)
  const [contextPrediction, setContextPrediction] = useState<PredictiveCurrentActionResponse | null>(null)
  const [contextLoading, setContextLoading] = useState(false)
  const [contextError, setContextError] = useState<string | null>(null)

  const prefillType = searchParams.get('type') as ScenarioType | null

  useEffect(() => {
    if (prefillType && (prefillType === 'failure' || prefillType === 'scale')) {
      setScenarioType(prefillType)
    }
  }, [prefillType])

  useEffect(() => {
    const fetchBootstrap = async () => {
      try {
        const caps = await getSimulationCapabilities()
        setCapabilities(caps)
      } catch (error) {
        console.error('Failed to load simulation bootstrap data', error)
      }
    }
    fetchBootstrap()
  }, [])

  useEffect(() => {
    if (!selectedServiceId || scenarioType === 'add-service') {
      setContextData(null)
      setContextPrediction(null)
      setContextError(null)
      return
    }

    const controller = new AbortController()
    let refreshTimer: ReturnType<typeof setInterval> | null = null

    const fetchContext = async () => {
      setContextLoading(true)
      try {
        const contextRequest = getSimulationContext({
          serviceId: selectedServiceId,
          k: selectedDepth,
          direction: scenarioType === 'scale' ? 'in' : 'both',
          mode: 'live',
        })
        const predictiveRequest = getCurrentPredictiveAction(controller.signal)
        const [contextResult, predictiveResult] = await Promise.allSettled([
          contextRequest,
          predictiveRequest,
        ])

        if (contextResult.status === 'rejected') {
          throw contextResult.reason
        }

        if (!controller.signal.aborted) {
          setContextData(contextResult.value)
          setContextError(null)
          if (predictiveResult.status === 'fulfilled') {
            setContextPrediction(predictiveResult.value)
          }
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setContextError(
            error instanceof Error
              ? error.message
              : 'Could not load service neighborhood right now. Please retry in a moment.'
          )
        }
      } finally {
        if (!controller.signal.aborted) {
          setContextLoading(false)
        }
      }
    }

    void fetchContext()
    refreshTimer = setInterval(() => {
      void fetchContext()
    }, CONTEXT_REFRESH_MS)

    return () => {
      controller.abort()
      if (refreshTimer) {
        clearInterval(refreshTimer)
      }
    }
  }, [scenarioType, selectedDepth, selectedServiceId])

  const runOptions = { mode: 'live' as const }

  const handleRun = async (scenario: Scenario) => {
    setLoading(true)
    setResult(null)
    setLastScenario(scenario)

    try {
      let response: SimulationResult
      if (scenario.type === 'failure') {
        response = await simulateFailure(
          {
            serviceId: scenario.serviceId,
            maxDepth: scenario.maxDepth,
            timeWindow: scenario.timeWindow,
          },
          runOptions
        )
      } else if (scenario.type === 'scale') {
        response = await simulateScale(
          {
            serviceId: scenario.serviceId,
            currentPods: scenario.currentPods,
            newPods: scenario.newPods,
            latencyMetric: scenario.latencyMetric,
            maxDepth: scenario.maxDepth,
            topPaths: scenario.topPaths,
            timeWindow: scenario.timeWindow,
          },
          runOptions
        )
      } else {
        response = await simulateServiceAddition({
          serviceName: scenario.serviceName,
          minCpuCores: scenario.minCpuCores,
          minRamMB: scenario.minRamMB,
          replicas: scenario.replicas,
          dependencies: scenario.dependencies,
          maxDepth: scenario.maxDepth,
          timeWindow: scenario.timeWindow,
        })
      }
      setResult(response)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to run simulation')
    } finally {
      setLoading(false)
    }
  }

  const renderRunMeta = (runResult: FailureResponse | ScaleResponse) => {
    const normalized = runResult.requestNormalized
    return (
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-solid)] p-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {runResult.dataFreshness?.stale && (
            <span className="rounded border border-amber-500/60 bg-amber-500/15 px-2 py-0.5 text-xs text-[var(--text-primary)]">
              Data may be stale
            </span>
          )}
          {runResult.confidence && (
            <span className="rounded border border-[var(--border)] bg-[var(--surface-soft)] px-2 py-0.5 text-xs text-[var(--text-secondary)]">
              Confidence: {runResult.confidence}
            </span>
          )}
        </div>
        <div className="text-xs text-[var(--text-muted)]">
          {normalized ? (
            <>
              Interpreted request: <span className="font-mono">{normalized.serviceId}</span> (lookup key:{' '}
              <span className="font-mono">{normalized.graphLookupKey}</span>, depth {normalized.depthUsed})
            </>
          ) : (
            'Run metadata unavailable'
          )}
        </div>
      </div>
    )
  }

  const renderContextPreview = () => {
    if (scenarioType === 'add-service') {
      return (
        <EmptyState
          icon={<Network className="h-10 w-10 text-[var(--text-dim)]" />}
          message="Context preview is available for failure and scaling simulations"
        />
      )
    }

    if (!selectedServiceId) {
      return (
        <EmptyState
          icon={<Network className="h-10 w-10 text-[var(--text-dim)]" />}
          message="Select a target service to preview its neighborhood context"
          className="flex h-full min-h-0 flex-col justify-center p-6 md:p-8"
        />
      )
    }

    if (contextLoading && !contextData) {
      return <LoadingSpinner fullHeight={false} message="Loading neighborhood context..." />
    }

    if (contextError && !contextData) {
      return (
        <p className="rounded border border-rose-500/45 bg-rose-500/10 p-3 text-sm text-[var(--text-primary)]">
          {contextError}
        </p>
      )
    }

    if (!contextData) {
      return <p className="text-sm text-[var(--text-muted)]">No context available.</p>
    }

    const aggregatedEdges = aggregateContextEdges(contextData)
    const hottestEdge = aggregatedEdges[0] ?? null
    const healthScore = Math.round(contextPrediction?.healthScore ?? deriveHealthScore(contextData, hottestEdge))
    const healthLabel = healthScore >= 85 ? 'Stable' : healthScore >= 70 ? 'Watch closely' : 'Immediate action required'
    const healthTone =
      healthScore >= 85
        ? 'border-emerald-400/45 bg-emerald-500/20 text-[var(--text-primary)]'
        : healthScore >= 70
          ? 'border-amber-400/45 bg-amber-500/20 text-[var(--text-primary)]'
          : 'border-rose-400/50 bg-rose-500/20 text-[var(--text-primary)]'

    const bottleneckLocation =
      formatPredictiveBottleneck(contextPrediction) ??
      (hottestEdge ? `${shortServiceName(hottestEdge.source)} -> ${shortServiceName(hottestEdge.target)}` : 'No active hotspot')

    const timeToImpactLabel = deriveTimeToImpact(contextPrediction, hottestEdge)
    const recommendationTitle =
      contextPrediction?.recommendation?.title ??
      (hottestEdge ? 'Watch the busiest service path' : 'No urgent recommendation')
    const recommendationMessage =
      contextPrediction?.recommendation?.message ??
      (hottestEdge
        ? `${shortServiceName(hottestEdge.source)} -> ${shortServiceName(hottestEdge.target)} is carrying most of the load right now.`
        : 'Live signals are stable. Keep observing before executing a drill.')

    return (
      <div className="h-full min-h-0 space-y-4 overflow-y-auto pr-1">
        {contextError && (
          <p className="rounded border border-amber-500/45 bg-amber-500/10 p-3 text-xs text-[var(--text-primary)]">
            Live refresh warning: {contextError}
          </p>
        )}

        <div className="relative overflow-hidden rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-panel)] p-5">
          <div className="pointer-events-none absolute inset-0 opacity-70">
            <div className="absolute -left-8 top-0 h-24 w-24 rounded-full bg-white/10 blur-2xl" />
            <div className="absolute right-0 top-0 h-24 w-24 rounded-full bg-black/20 blur-2xl" />
          </div>

          <div className="relative space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--text-secondary)]">
              <span className="inline-flex items-center gap-1.5 font-semibold uppercase tracking-widest">
                <TrendingUp className="h-3.5 w-3.5" />
                Live Scenario Pulse
              </span>
              <span className="rounded border border-[var(--border)] bg-[var(--surface-soft)] px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                Refresh every {Math.round(CONTEXT_REFRESH_MS / 1000)}s
              </span>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className={`rounded-xl border px-4 py-3 ${healthTone}`}>
                <div className="text-[11px] font-semibold uppercase tracking-wider">Health Score</div>
                <div className="mt-1 flex items-end gap-1">
                  <span className="text-3xl font-black leading-none">{healthScore}</span>
                  <span className="pb-0.5 text-sm font-semibold">/100</span>
                </div>
                <p className="mt-1 text-xs">{healthLabel}</p>
              </div>

              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-4 py-3 text-[var(--text-primary)]">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  Primary Bottleneck
                </div>
                <div className="mt-1 flex items-center gap-2 text-sm font-semibold">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  <span className="truncate">{bottleneckLocation}</span>
                </div>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  Based on latest service-graph and predictive analysis signals.
                </p>
              </div>

              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-4 py-3 text-[var(--text-primary)]">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  Time To Impact
                </div>
                <div className="mt-1 flex items-center gap-2 text-2xl font-black">
                  <Clock3 className="h-5 w-5 text-cyan-600" />
                  <span>{timeToImpactLabel}</span>
                </div>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">Estimated time before user-facing instability.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-solid)] p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Services In Scope</div>
            <div className="mt-1 text-2xl font-black text-[var(--text-primary)]">{contextData.nodes.length}</div>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">Neighborhood around {contextData.target.name ?? shortServiceName(contextData.target.serviceId)}.</p>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-solid)] p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Busiest Link</div>
            <div className="mt-1 text-2xl font-black text-[var(--text-primary)]">
              {hottestEdge ? formatRps(hottestEdge.peakRate) : formatRps(0)}
            </div>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              {hottestEdge
                ? `${shortServiceName(hottestEdge.source)} -> ${shortServiceName(hottestEdge.target)}`
                : 'No active path detected'}
            </p>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-solid)] p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Worst Slow-End Latency
            </div>
            <div className="mt-1 text-2xl font-black text-[var(--text-primary)]">
              {hottestEdge ? formatMs(hottestEdge.peakP95) : formatMs(0)}
            </div>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              Derived from {contextData.edges.length} recent time-series samples.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-solid)] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-[var(--text-secondary)]">Recommended Operator Action</h3>
              <p className="mt-1 text-base font-bold text-[var(--text-primary)]">{recommendationTitle}</p>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">{recommendationMessage}</p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full border border-cyan-500/50 bg-cyan-500/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-700">
              <Zap className="h-3 w-3" />
              Live
            </span>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-[var(--text-secondary)]">
            <span className="inline-flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              Target health:{' '}
              {formatPercent(
                ((contextData.nodes.find((node) => node.serviceId === contextData.target.serviceId)?.availability ??
                  1) as number) * 100
              )}
            </span>
            {hottestEdge && (
              <span className="inline-flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                Peak error exposure: {formatPercent(hottestEdge.maxErrorRate * 100)}
              </span>
            )}
            {contextLoading && (
              <span className="inline-flex items-center gap-1 text-cyan-600">
                <Clock3 className="h-3.5 w-3.5" />
                Refreshing...
              </span>
            )}
          </div>
        </div>

        {contextData.truncated && (
          <p className="rounded border border-amber-500/60 bg-amber-500/10 p-2 text-xs text-[var(--text-primary)]">
            Context is condensed from a larger graph to keep the panel fast and readable.
          </p>
        )}
      </div>
    )
  }

  const renderFailureResults = (failureResult: FailureResponse) => {
    const affectedCallersCount = failureResult.affectedCallers?.length ?? 0
    const affectedDownstreamCount = failureResult.affectedDownstream?.length ?? 0
    const unreachableCount = failureResult.unreachableServices?.length ?? 0
    const impactNodes = failureResult.impactGraph?.nodes ?? []
    const impactEdges = failureResult.impactGraph?.edges ?? []
    const criticalPaths = failureResult.criticalPathsToTarget ?? []

    return (
      <div className="space-y-6">
        <Section title="Failure Impact Summary" icon={Activity}>
          <div className="mb-4 rounded-lg border border-[var(--border)] bg-[var(--surface-solid)] p-4">
            <p className="text-sm text-[var(--text-secondary)]">{failureResult.explanation}</p>
            <div className="mt-2 text-xs text-[var(--text-muted)]">
              Lost traffic estimate: <span className="font-semibold text-[var(--text-primary)]">{formatRps(failureResult.totalLostTrafficRps ?? 0)}</span>
            </div>
          </div>
          {renderRunMeta(failureResult)}
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
            <KPIStatCard
              label="Affected Callers"
              value={affectedCallersCount}
              variant={affectedCallersCount > 0 ? 'warning' : 'success'}
              tooltip="Number of services that directly call the selected target. These are usually the first services to feel impact when the target fails."
            />
            <KPIStatCard
              label="Affected Dependencies"
              value={affectedDownstreamCount}
              variant={affectedDownstreamCount > 0 ? 'danger' : 'success'}
              tooltip="Number of downstream services that rely on this path. If this count is high, the blast radius can spread wider."
            />
            <KPIStatCard
              label="No Longer Reachable"
              value={unreachableCount}
              variant={unreachableCount > 0 ? 'danger' : 'success'}
              tooltip="Number of services that become completely unreachable in this simulation. These services would effectively be down from the user perspective."
            />
          </div>
        </Section>

        <Section
          title="Impact Graph"
          description="Graph view of affected services and connections after the selected failure."
          icon={Network}
        >
          <div className="mb-3 text-xs text-[var(--text-muted)]">
            Status legend: {statusBadge('target_failed')} {statusBadge('broken')} {statusBadge('unreachable')} {statusBadge('normal')}
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded border border-[var(--border)] bg-[var(--surface-solid)] p-3">
              <h3 className="mb-2 text-sm font-semibold text-[var(--text-secondary)]">Services</h3>
              <div className="max-h-72 space-y-2 overflow-auto pr-1">
                {impactNodes.map((node) => (
                  <div key={node.serviceId} className="rounded border border-[var(--border)] bg-[var(--surface-soft)] p-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-[var(--text-primary)]">{node.name}</span>
                      {statusBadge(node.status)}
                    </div>
                    <div className="text-xs text-[var(--text-muted)]">{node.serviceId}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded border border-[var(--border)] bg-[var(--surface-solid)] p-3">
              <h3 className="mb-2 text-sm font-semibold text-[var(--text-secondary)]">Impacted Edges</h3>
              <div className="max-h-72 space-y-2 overflow-auto pr-1">
                {impactEdges.map((edge, index) => (
                  <div key={`${edge.source}-${edge.target}-${index}`} className="rounded border border-[var(--border)] bg-[var(--surface-soft)] p-2 text-xs">
                    <div className="mb-1 font-mono text-[var(--text-primary)]">
                      {edge.source} → {edge.target}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[var(--text-secondary)]">
                        {formatRps(edge.rate ?? 0)} req/s | slow-end response time {formatMs(edge.p95 ?? 0)}
                      </span>
                      {statusBadge(edge.status)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Section>

        <Section title="Critical Paths At Risk" icon={Activity}>
          {criticalPaths.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">No critical paths returned for this run.</p>
          ) : (
            <div className={tableShellClass}>
              <table className="w-full">
                <thead className={tableHeadRowClass}>
                  <tr>
                    <th className={tableHeaderCellClass}>Path</th>
                    <th className={tableHeaderCellClass}>Traffic (req/s)</th>
                  </tr>
                </thead>
                <tbody>
                  {criticalPaths.map((path, index) => (
                    <tr key={`critical-path-${index}`} className={tableBodyRowClass}>
                      <td className={tableCellClass}>{(path.path ?? []).join(' → ')}</td>
                      <td className={tableCellClass}>{formatRps(path.pathRps ?? 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      </div>
    )
  }

  const renderScaleResults = (scaleResult: ScaleResponse) => {
    const latency = scaleResult.latencyEstimate
    const affectedCallers = getScaleCallers(scaleResult)
    const affectedPaths = scaleResult.affectedPaths ?? []

    return (
      <div className="space-y-6">
        <Section title="Scaling Impact Summary" icon={Activity}>
          <div className="mb-4 rounded-lg border border-[var(--border)] bg-[var(--surface-solid)] p-4">
            <p className="text-sm text-[var(--text-secondary)]">{scaleResult.explanation}</p>
          </div>
          {renderRunMeta(scaleResult)}
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-4">
            <KPIStatCard
              label="Current slow-end response time"
              value={formatMs(latency?.baselineMs ?? 0)}
              variant="default"
              tooltip="Current slow-end response time before scaling. This is your baseline and acts as the reference for the projected result."
            />
            <KPIStatCard
              label="Projected slow-end response time"
              value={formatMs(latency?.projectedMs ?? 0)}
              variant="default"
              tooltip="Estimated slow-end response time after scaling is applied. Compare this with baseline to understand expected improvement or regression."
            />
            <KPIStatCard
              label="Expected change"
              value={`${(latency?.deltaMs ?? 0) >= 0 ? '+' : ''}${formatMs(latency?.deltaMs ?? 0)}`}
              variant={(latency?.deltaMs ?? 0) < 0 ? 'success' : 'warning'}
              tooltip="Difference between before and after scaling. Negative means faster responses; positive means slower responses."
            />
            <KPIStatCard
              label="Affected workflows"
              value={affectedPaths.length}
              variant="default"
              tooltip="How many request paths show a clear response-time shift. More affected paths means the scaling effect is broader."
            />
          </div>

          {scaleResult.warnings && scaleResult.warnings.length > 0 && (
            <div className="mt-4 space-y-2">
              {scaleResult.warnings.map((warning, index) => (
                <p key={`scale-warning-${index}`} className="rounded border border-amber-500/50 bg-amber-500/10 p-2 text-xs text-[var(--text-primary)]">
                  {warning}
                </p>
              ))}
            </div>
          )}
        </Section>

        <Section
          title="Path Latency Delta"
          description="Path-level response-time changes before and after scaling."
          icon={Network}
        >
          {affectedPaths.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">No path-level deltas were returned.</p>
          ) : (
            <div className={tableShellClass}>
              <table className="w-full">
                <thead className={tableHeadRowClass}>
                  <tr>
                    <th className={tableHeaderCellClass}>Workflow Path</th>
                    <th className={tableHeaderCellClass}>Before</th>
                    <th className={tableHeaderCellClass}>After</th>
                    <th className={tableHeaderCellClass}>Change</th>
                    <th className={tableHeaderCellClass}>Traffic (req/s)</th>
                    <th className={tableHeaderCellClass}>Data</th>
                  </tr>
                </thead>
                <tbody>
                  {affectedPaths.map((path, index) => (
                    <tr key={`affected-path-${index}`} className={tableBodyRowClass}>
                      <td className={tableCellClass}>{(path.path ?? []).join(' → ')}</td>
                      <td className={tableCellClass}>{formatMs(path.beforeMs ?? 0)}</td>
                      <td className={tableCellClass}>{formatMs(path.afterMs ?? 0)}</td>
                      <td className={tableCellClass}>
                        <span className={(path.deltaMs ?? 0) < 0 ? 'text-emerald-700' : 'text-rose-700'}>
                          {(path.deltaMs ?? 0) >= 0 ? '+' : ''}
                          {formatMs(path.deltaMs ?? 0)}
                        </span>
                      </td>
                      <td className={tableCellClass}>{formatRps(path.pathRps ?? 0)}</td>
                      <td className={tableCellClass}>
                        {path.incompleteData ? (
                          <span className="rounded border border-amber-500/60 bg-amber-500/15 px-2 py-0.5 text-xs text-[var(--text-primary)]">
                            Incomplete
                          </span>
                        ) : (
                          <span className="rounded border border-emerald-500/60 bg-emerald-500/15 px-2 py-0.5 text-xs text-[var(--text-primary)]">
                            Complete
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        <Section title="Affected Callers" icon={Activity}>
          <div className={tableShellClass}>
            <table className="w-full">
              <thead className={tableHeadRowClass}>
                <tr>
                  <th className={tableHeaderCellClass}>Service</th>
                  <th className={tableHeaderCellClass}>Hop Distance</th>
                  <th className={tableHeaderCellClass}>Edge Delta</th>
                  <th className={tableHeaderCellClass}>Path Delta</th>
                </tr>
              </thead>
              <tbody>
                {affectedCallers.map((caller, index) => (
                  <tr key={`${caller.serviceId ?? 'caller'}-${index}`} className={tableBodyRowClass}>
                    <td className={tableCellClass}>{caller.serviceId ?? caller.name ?? 'unknown'}</td>
                    <td className={tableCellClass}>{caller.hopDistance ?? 'n/a'}</td>
                    <td className={tableCellClass}>{formatMs(caller.deltaMs ?? 0)}</td>
                    <td className={tableCellClass}>{formatMs(caller.endToEndDeltaMs ?? 0)}</td>
                  </tr>
                ))}
                {affectedCallers.length === 0 && (
                  <tr className={tableBodyRowClass}>
                    <td className={tableCellClass} colSpan={4}>
                      No caller impact rows returned.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Section>
      </div>
    )
  }

  const renderServiceAdditionResults = (additionResult: ServiceAdditionResponse) => {
    return (
      <Section title="Add-Service Simulation (Experimental)" icon={Activity}>
        <div className="rounded border border-[var(--border)] bg-[var(--surface-solid)] p-4">
          <p className="mb-2 text-sm text-[var(--text-secondary)]">
            Target service: <span className="font-semibold text-[var(--text-primary)]">{additionResult.targetServiceName}</span>
          </p>
          <p className="mb-4 text-xs text-[var(--text-muted)]">
            This flow is marked experimental and is outside the core panel narrative.
          </p>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {additionResult.suitableNodes.map((node) => (
              <div key={node.nodeName} className="rounded border border-[var(--border)] bg-[var(--surface-soft)] p-3">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-sm font-semibold text-[var(--text-primary)]">{node.nodeName}</span>
                  <span className={`text-xs ${node.suitable ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {node.suitable ? 'Suitable' : 'Unsuitable'}
                  </span>
                </div>
                <div className="text-xs text-[var(--text-muted)]">Score: {node.score}/100</div>
                {!node.suitable && node.reason && <div className="mt-1 text-xs text-[var(--text-primary)]">{node.reason}</div>}
              </div>
            ))}
          </div>
        </div>
      </Section>
    )
  }

  return (
    <div className={pageContainerClass}>
      <PageHeader
        title="Simulations"
        description="Simple simulation analysis for service impact and response-time changes"
        icon={Sparkles}
      />

      {/* Cluster Topology — Nodes / Services / Pods */}
      <div className="w-full">
        <ClusterTopologyMap />
      </div>

      <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <Section title="Scenario Configuration" icon={Settings} className="h-full">
            <ScenarioForm
              onRun={handleRun}
              loading={loading}
              scenarioType={scenarioType}
              allowExperimentalAdd={capabilities.experimental.includes('add-service')}
              onScenarioTypeChange={(type) => {
                setScenarioType(type)
                setResult(null)
                setLastScenario(null)
              }}
              onServiceSelectionChange={setSelectedServiceId}
              onDepthChange={setSelectedDepth}
            />
          </Section>
        </div>

        <div className="lg:col-span-2">
          <Section
            title="Simulation Context Preview"
            icon={Network}
            className="flex h-full min-h-0 flex-col"
            contentClassName="flex-1 min-h-0 overflow-hidden"
          >
            {renderContextPreview()}
          </Section>
        </div>
      </div>

      <div className="space-y-6">
        {loading && (
          <div className={loadingCardClass}>
            <LoadingSpinner fullHeight={false} message="Running simulation..." />
          </div>
        )}

        {result && !loading && (
          <>
            {isServiceAdditionResult(result)
              ? renderServiceAdditionResults(result)
              : isScaleResult(result)
                ? renderScaleResults(result)
                : renderFailureResults(result)}
          </>
        )}

        {!result && !loading && (
          <EmptyState
            icon={<Sparkles className="h-12 w-12 text-[var(--text-dim)]" />}
            message="Configure a scenario and click Run to generate simulation evidence"
            description={
              lastScenario
                ? 'Previous run cleared. Adjust your scenario and run again.'
                : 'Start with failure or scaling to preview blast radius and latency deltas.'
            }
          />
        )}
      </div>
    </div>
  )
}
