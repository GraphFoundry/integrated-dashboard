import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { Activity, CircleHelp, Network, Settings, SlidersHorizontal, Sparkles } from 'lucide-react'
import toast from 'react-hot-toast'
import InfoHint from '@/components/common/InfoHint'
import PageHeader from '@/components/layout/PageHeader'
import KPIStatCard from '@/components/layout/KPIStatCard'
import Section from '@/components/layout/Section'
import EmptyState from '@/components/layout/EmptyState'
import LoadingSpinner from '@/components/common/LoadingSpinner'
import {
  controlInputMutedClass,
  loadingCardClass,
  pageContainerClass,
  tableBodyRowClass,
  tableCellClass,
  tableHeadRowClass,
  tableHeaderCellClass,
  tableShellClass,
} from '@/components/common/uiClassTokens'
import { Checkbox, Select } from '@/components/ui'
import ScenarioForm from '@/pages/simulations/ScenarioForm'
import {
  getDemoSnapshots,
  getSimulationCapabilities,
  getSimulationContext,
  simulateFailure,
  simulateScale,
  simulateServiceAddition,
} from '@/lib/api'
import { formatMs, formatPercent, formatRps } from '@/lib/format'
import type {
  DemoSnapshot,
  FailureResponse,
  ScaleResponse,
  Scenario,
  ScenarioType,
  ServiceAdditionResponse,
  SimulationCapabilitiesResponse,
  SimulationDemoConstraints,
  SimulationContextResponse,
} from '@/lib/types'

type SimulationMode = 'live' | 'demo'

type SimulationResult = FailureResponse | ScaleResponse | ServiceAdditionResponse

const DEFAULT_DEMO_CONSTRAINTS: SimulationDemoConstraints = {
  note: 'Demo Snapshot Mode uses deterministic fixtures and supports a curated subset of scenarios.',
  addServiceSupported: false,
  failure: { serviceId: 'default:checkoutservice' },
  scale: { serviceId: 'default:recommendationservice', currentPods: 2, newPods: 5 },
}

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

export default function Simulations() {
  const [searchParams] = useSearchParams()
  const [scenarioType, setScenarioType] = useState<ScenarioType>('failure')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<SimulationResult | null>(null)
  const [lastScenario, setLastScenario] = useState<Scenario | null>(null)

  const [mode, setMode] = useState<SimulationMode>('live')
  const [capabilities, setCapabilities] = useState<SimulationCapabilitiesResponse>({
    enabled: ['failure', 'scale'],
    experimental: [],
    demoConstraints: DEFAULT_DEMO_CONSTRAINTS,
  })
  const [demoSnapshots, setDemoSnapshots] = useState<DemoSnapshot[]>([])
  const [snapshotId, setSnapshotId] = useState('seed-v1')

  const [selectedServiceId, setSelectedServiceId] = useState('')
  const [selectedDepth, setSelectedDepth] = useState(1)
  const [contextData, setContextData] = useState<SimulationContextResponse | null>(null)
  const [contextLoading, setContextLoading] = useState(false)
  const [contextError, setContextError] = useState<string | null>(null)
  const [hideLowRpsEdges, setHideLowRpsEdges] = useState(false)
  const [hideLowAvailabilityNodes, setHideLowAvailabilityNodes] = useState(false)

  const prefillType = searchParams.get('type') as ScenarioType | null

  useEffect(() => {
    if (prefillType && (prefillType === 'failure' || prefillType === 'scale')) {
      setScenarioType(prefillType)
    }
  }, [prefillType])

  useEffect(() => {
    const fetchBootstrap = async () => {
      try {
        const [caps, snapshotsResp] = await Promise.all([getSimulationCapabilities(), getDemoSnapshots()])
        setCapabilities(caps)
        setDemoSnapshots(snapshotsResp.snapshots)
        if (snapshotsResp.snapshots.length > 0) {
          setSnapshotId((prev) => prev || snapshotsResp.snapshots[0].id)
        }
      } catch (error) {
        console.error('Failed to load simulation bootstrap data', error)
      }
    }
    fetchBootstrap()
  }, [])

  useEffect(() => {
    if (!selectedServiceId || scenarioType === 'add-service') {
      setContextData(null)
      setContextError(null)
      return
    }

    const controller = new AbortController()
    const fetchContext = async () => {
      setContextLoading(true)
      setContextError(null)
      try {
        const response = await getSimulationContext({
          serviceId: selectedServiceId,
          k: selectedDepth,
          direction: scenarioType === 'scale' ? 'in' : 'both',
          mode,
          snapshotId: mode === 'demo' ? snapshotId : undefined,
        })
        if (!controller.signal.aborted) {
          setContextData(response)
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setContextData(null)
          setContextError(
            error instanceof Error
              ? error.message
              : 'Could not load service neighborhood. You can switch to Demo Snapshot Mode to continue the presentation.'
          )
        }
      } finally {
        if (!controller.signal.aborted) {
          setContextLoading(false)
        }
      }
    }

    fetchContext()

    return () => controller.abort()
  }, [mode, scenarioType, selectedDepth, selectedServiceId, snapshotId])

  const runOptions = useMemo(
    () => ({
      mode,
      snapshotId: mode === 'demo' ? snapshotId : undefined,
    }),
    [mode, snapshotId]
  )

  const demoConstraints = capabilities.demoConstraints ?? DEFAULT_DEMO_CONSTRAINTS
  const demoFailureTarget = demoConstraints.failure?.serviceId ?? 'default:checkoutservice'
  const demoScaleTarget = demoConstraints.scale?.serviceId ?? 'default:recommendationservice'
  const demoScaleCurrentPods = demoConstraints.scale?.currentPods ?? 2
  const demoScaleNewPods = demoConstraints.scale?.newPods ?? 5
  const demoModeSupportSummary =
    `Supported demo runs: failure on ${demoFailureTarget}; scale on ${demoScaleTarget} (${demoScaleCurrentPods} -> ${demoScaleNewPods} pods). ` +
    'Add-service remains Live mode only.'

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
        if (mode === 'demo') {
          toast.error('Add-service simulation is available only in Live mode')
          setLoading(false)
          return
        }
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
          <span className="text-xs text-[var(--text-dim)]">Mode</span>
          <span className="rounded border border-[var(--border)] bg-[var(--surface-soft)] px-2 py-0.5 text-xs uppercase text-[var(--text-secondary)]">
            {runResult.sourceMode ?? mode}
          </span>
          {runResult.snapshotId && (
            <span className="rounded border border-[var(--border)] bg-[var(--surface-soft)] px-2 py-0.5 text-xs text-[var(--text-secondary)]">
              Snapshot: {runResult.snapshotId}
            </span>
          )}
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

    if (contextLoading) {
      return <LoadingSpinner fullHeight={false} message="Loading neighborhood context..." />
    }

    if (contextError) {
      return (
        <p className="rounded border border-rose-500/45 bg-rose-500/10 p-3 text-sm text-[var(--text-primary)]">
          {contextError}
        </p>
      )
    }

    if (!contextData) {
      return <p className="text-sm text-[var(--text-muted)]">No context available.</p>
    }

    const lowRpsThreshold = 5
    const targetServiceId = contextData.target.serviceId ?? ''
    const visibleNodes = hideLowAvailabilityNodes
      ? contextData.nodes.filter(
        (node) => node.serviceId === targetServiceId || (node.availability ?? 1) >= 0.95
      )
      : contextData.nodes
    const visibleNodeIds = new Set(visibleNodes.map((node) => node.serviceId))
    const edgesAfterNodeFilter = contextData.edges.filter(
      (edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target)
    )
    const visibleEdges = hideLowRpsEdges
      ? edgesAfterNodeFilter.filter((edge) => (edge.rate ?? 0) >= lowRpsThreshold)
      : edgesAfterNodeFilter
    const topEdges = [...visibleEdges].sort((a, b) => b.rate - a.rate).slice(0, 12)

    return (
      <div className="h-full min-h-0 space-y-4 overflow-y-auto pr-1">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <KPIStatCard
            label="Target Service"
            value={contextData.target.name ?? contextData.target.serviceId ?? 'unknown'}
            variant="default"
            tooltip="This is the main service you selected for analysis. All impact numbers in this panel are calculated relative to this target."
          />
          <KPIStatCard label="Visible Services" value={visibleNodes.length} variant="default" tooltip="How many services are currently visible in this preview after your filters are applied. If this number drops, your filter is hiding more nodes." />
          <KPIStatCard label="Visible Connections" value={visibleEdges.length} variant="default" tooltip="How many service-to-service links are currently visible. This helps you see how connected the selected neighborhood is." />
          <KPIStatCard label="View Direction" value={contextData.direction} variant="default" tooltip="Shows the direction of analysis: callers (incoming), dependencies (outgoing), or both. Use this to understand whether impact is upstream, downstream, or both." />
        </div>

        <div className="rounded border border-[var(--border)] bg-[var(--surface-soft)] p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--text-secondary)]">
            <SlidersHorizontal className="h-4 w-4" />
            Preview filters
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs text-[var(--text-secondary)]">
            <Checkbox
              checked={hideLowRpsEdges}
              onChange={(event) => setHideLowRpsEdges(Boolean(event.target.checked))}
              label={`Hide low-traffic connections (<${lowRpsThreshold} req/s)`}
            />
            <Checkbox
              checked={hideLowAvailabilityNodes}
              onChange={(event) => setHideLowAvailabilityNodes(Boolean(event.target.checked))}
              label="Hide lower-health services (availability below 95%)"
            />
          </div>
        </div>

        {contextData.truncated && (
          <p className="rounded border border-amber-500/60 bg-amber-500/10 p-2 text-xs text-[var(--text-primary)]">
            Context graph was truncated to keep the response bounded.
          </p>
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded border border-[var(--border)] bg-[var(--surface-solid)] p-3">
            <div className="mb-2 inline-flex items-center gap-1.5">
              <h3 className="text-sm font-semibold text-[var(--text-secondary)]">Services in neighborhood</h3>
              <InfoHint text="This list shows nearby services directly connected to your selected target. It gives you a quick map of who talks to whom around the target service." />
            </div>
            <div className="max-h-64 space-y-2 overflow-auto pr-1">
              {visibleNodes.map((node) => (
                <div key={node.serviceId} className="rounded border border-[var(--border)] bg-[var(--surface-soft)] p-2">
                  <div className="text-sm font-medium text-[var(--text-primary)]">{node.name}</div>
                  <div className="text-xs text-[var(--text-muted)]">{node.namespace}</div>
                  <div className="mt-1 text-xs text-[var(--text-secondary)]">
                    Pods: {node.podCount} | Health: {formatPercent((node.availability ?? 0) * 100)}
                  </div>
                </div>
              ))}
              {visibleNodes.length === 0 && (
                <p className="text-xs text-[var(--text-muted)]">No services match the current filter.</p>
              )}
            </div>
          </div>

          <div className="rounded border border-[var(--border)] bg-[var(--surface-solid)] p-3">
            <div className="mb-2 inline-flex items-center gap-1.5">
              <h3 className="text-sm font-semibold text-[var(--text-secondary)]">Top edges by traffic</h3>
              <InfoHint text="This list highlights the busiest links between services in this local area. Higher traffic links usually carry more risk during failures." />
            </div>
            <div className="max-h-64 space-y-2 overflow-auto pr-1">
              {topEdges.map((edge, index) => (
                <div key={`${edge.source}-${edge.target}-${index}`} className="rounded border border-[var(--border)] bg-[var(--surface-soft)] p-2 text-xs">
                  <div className="font-mono text-[var(--text-primary)]">
                    {edge.source} → {edge.target}
                  </div>
                  <div className="mt-1 text-[var(--text-secondary)]">
                    {formatRps(edge.rate)} req/s | slow-end response time {formatMs(edge.p95)} | failures {formatPercent(edge.errorRate * 100)}
                  </div>
                </div>
              ))}
              {topEdges.length === 0 && <p className="text-xs text-[var(--text-muted)]">No connections match the current filter.</p>}
            </div>
          </div>
        </div>
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

      <Section title="Run Mode" icon={Settings}>
        {mode === 'demo' && (
          <div className="mb-4 rounded border border-amber-500/55 bg-amber-500/12 p-3 text-xs font-semibold text-[var(--text-primary)]">
            Demo Snapshot Mode: deterministic fixtures for stable reruns. {demoModeSupportSummary}
          </div>
        )}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label htmlFor="simulationMode" className="mb-2 block text-sm font-semibold text-[var(--text-secondary)]">
                <span className="inline-flex items-center gap-1.5">
                  <span>Source Mode</span>
                  <InfoHint text="Live mode uses current platform data. Demo mode uses deterministic fixtures for repeatable presentation runs, but only a curated subset of scenario/service combinations is supported." />
                </span>
              </label>
            <Select
              id="simulationMode"
              value={mode}
              onChange={(e) => setMode(e.target.value as SimulationMode)}
              className={controlInputMutedClass}
              suffixIcon={<Settings className="h-4 w-4" />}
            >
              <option value="live">Live Graph Mode</option>
              <option value="demo">Demo Snapshot Mode</option>
            </Select>
          </div>

          <div>
            <label htmlFor="snapshotId" className="mb-2 block text-sm font-semibold text-[var(--text-secondary)]">
              <span className="inline-flex items-center gap-1.5">
                <span>Demo Snapshot</span>
                <InfoHint text="A snapshot is a saved state of the system at a specific time. Use snapshots when you want consistent reruns and fair comparison across scenarios." />
              </span>
            </label>
            <Select
              id="snapshotId"
              value={snapshotId}
              onChange={(e) => setSnapshotId(e.target.value)}
              className={controlInputMutedClass}
              disabled={mode !== 'demo'}
              suffixIcon={<CircleHelp className="h-4 w-4" />}
            >
              {demoSnapshots.length === 0 ? <option value="seed-v1">seed-v1</option> : null}
              {demoSnapshots.map((snapshot) => (
                <option key={snapshot.id} value={snapshot.id}>
                  {snapshot.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="rounded border border-[var(--border)] bg-[var(--surface-soft)] p-3 text-xs text-[var(--text-muted)]">
            {mode === 'demo'
              ? `${demoConstraints.note ?? 'Using deterministic demo data for stable presentation results.'} ${demoModeSupportSummary}`
              : 'Using live graph data. This simulation does not change the running cluster.'}
          </div>
        </div>
      </Section>

      <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <Section title="Scenario Configuration" icon={Settings} className="h-full">
            <ScenarioForm
              onRun={handleRun}
              loading={loading}
              mode={mode}
              scenarioType={scenarioType}
              demoConstraints={demoConstraints}
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
