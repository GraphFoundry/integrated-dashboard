import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { Activity, AlertTriangle, CheckCircle, Clock3, FileText, Network, RefreshCw, Settings, ShieldCheck, Sparkles, TrendingUp, XCircle, Zap } from 'lucide-react'
import toast from 'react-hot-toast'
import PageHeader from '@/components/layout/PageHeader'
import KPIStatCard from '@/components/layout/KPIStatCard'
import Section from '@/components/layout/Section'
import EmptyState from '@/components/layout/EmptyState'
import LoadingSpinner from '@/components/common/LoadingSpinner'
import InfoHint from '@/components/common/InfoHint'
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
  getSimulationContext,
  replaySimulation,
  runSimulation,
} from '@/lib/api'
import { formatMs, formatPercent, formatRps } from '@/lib/format'
import { ApiError } from '@/lib/httpClient'
import type {
  FailureResponse,
  ScaleResponse,
  Scenario,
  ServiceAdditionResponse,
  SimulationContextResponse,
  PredictiveCurrentActionResponse,
} from '@/lib/types'
import {
  SIMULATION_SCHEMA_VERSION,
  type SimulationDegradedMode,
  type SimulationErrorResponseDto,
  type SimulationRunRequestDto,
  type SimulationRunResponseDto,
} from '@/lib/simulationContract'

type SimulationResult = FailureResponse | ScaleResponse | ServiceAdditionResponse
type LockedScenario = Exclude<Scenario, { type: 'add-service' }>
type LockedScenarioType = LockedScenario['type']
type DeferredUnsupportedStatus = 'DEFERRED' | 'UNSUPPORTED'
type ResolvedDegradedMode = Exclude<SimulationDegradedMode, ''>

type DeferredUnsupportedOutcome = {
  resultStatus: DeferredUnsupportedStatus
  reason: string
  degradedMode?: ResolvedDegradedMode
  degradedModeReason?: string
}

function isDeferredUnsupportedStatus(status: string): status is DeferredUnsupportedStatus {
  return status === 'DEFERRED' || status === 'UNSUPPORTED'
}

const LOCKED_SCENARIO_TYPES: LockedScenarioType[] = [
  'failure',
  'scale',
  'traffic-spike',
  'chatty-colocation',
  'network-cut',
]

function isLockedScenarioType(value: string): value is LockedScenarioType {
  return LOCKED_SCENARIO_TYPES.includes(value as LockedScenarioType)
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
  aggregatedEdges: AggregatedContextEdge[]
): number {
  if (context.nodes.length === 0) return 100

  const availabilityPct =
    context.nodes.reduce((acc, node) => acc + (node.availability ?? 1) * 100, 0) / context.nodes.length

  // Consider worst metrics across ALL edges, not just the hottest
  let worstP95 = 0
  let maxErrorRate = 0
  let totalRate = 0
  for (const edge of aggregatedEdges) {
    worstP95 = Math.max(worstP95, edge.peakP95)
    maxErrorRate = Math.max(maxErrorRate, edge.maxErrorRate)
    totalRate += edge.peakRate
  }

  const maxEdgeErrorPct = maxErrorRate * 100
  const latencyPenalty = Math.min(28, worstP95 / 15)
  const errorPenalty = Math.min(26, maxEdgeErrorPct * 2.5)
  const availabilityPenalty = Math.max(0, 100 - availabilityPct) * 0.7
  // Dependency fan-out: more edges with higher aggregate traffic = more risk exposure
  const complexityPenalty = Math.min(10, aggregatedEdges.length * 0.5 + totalRate / 50)

  return Math.round(clamp(100 - latencyPenalty - errorPenalty - availabilityPenalty - complexityPenalty, 0, 100))
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

function buildSimulationRunRequest(scenario: LockedScenario): SimulationRunRequestDto {
  const snapshotTimestamp = new Date().toISOString()
  switch (scenario.type) {
    case 'failure':
      return {
        version: SIMULATION_SCHEMA_VERSION,
        scenarioType: 'failure_shutdown',
        snapshotTimestamp,
        failureShutdownParams: {
          targetServiceId: scenario.serviceId,
          maxDepth: scenario.maxDepth,
        },
      }
    case 'scale':
      return {
        version: SIMULATION_SCHEMA_VERSION,
        scenarioType: 'scaling',
        snapshotTimestamp,
        scalingParams: {
          targetServiceId: scenario.serviceId,
          currentPods: scenario.currentPods,
          newPods: scenario.newPods,
          latencyMetric: scenario.latencyMetric,
        },
      }
    case 'traffic-spike':
      return {
        version: SIMULATION_SCHEMA_VERSION,
        scenarioType: 'traffic_spike',
        snapshotTimestamp,
        trafficSpikeParams: {
          targetServiceId: scenario.serviceId,
          loadMultiplier: scenario.loadMultiplier,
        },
      }
    case 'chatty-colocation':
      return {
        version: SIMULATION_SCHEMA_VERSION,
        scenarioType: 'chatty_colocation',
        snapshotTimestamp,
        chattyColocationParams: {
          sourceServiceId: scenario.sourceServiceId,
          targetServiceId: scenario.targetServiceId,
        },
      }
    case 'network-cut':
      return {
        version: SIMULATION_SCHEMA_VERSION,
        scenarioType: 'network_cut',
        snapshotTimestamp,
        networkCutParams: {
          affectedLinks: [
            {
              sourceServiceId: scenario.sourceServiceId,
              targetServiceId: scenario.targetServiceId,
            },
          ],
          degradationPercent: scenario.degradationPercent,
        },
      }
  }
}

function parseSimulationRunError(error: unknown): SimulationErrorResponseDto | null {
  if (error instanceof ApiError && error.payload && typeof error.payload === 'object') {
    return error.payload as SimulationErrorResponseDto
  }
  return null
}

function formatOptionalNumber(value?: number): string {
  if (value === undefined) {
    return 'n/a'
  }
  if (!Number.isFinite(value)) {
    return 'n/a'
  }
  return Number.isInteger(value) ? value.toString() : value.toFixed(2)
}

function formatNumberWithUnit(value: number | undefined, unit: string | undefined): string {
  const formatted = formatOptionalNumber(value)
  if (formatted === 'n/a' || !unit) {
    return formatted
  }
  return `${formatted} ${unit}`
}

function getDefaultDegradedModeReason(degradedMode: ResolvedDegradedMode): string {
  if (degradedMode === 'INFLUX_EMPTY') {
    return 'Historical InfluxDB data is unavailable for this snapshot; deterministic fallback evidence is being used.'
  }
  if (degradedMode === 'INFLUX_SPARSE') {
    return 'Historical InfluxDB data is too sparse for high-confidence estimates; deterministic fallback evidence is being used.'
  }
  return 'InfluxDB history could not be queried; deterministic fallback evidence is being used.'
}

function getDegradedModeReason(
  degradedMode: SimulationDegradedMode | undefined,
  degradedModeReason?: string
): string | null {
  if (!degradedMode) {
    return null
  }
  if (degradedModeReason?.trim()) {
    return degradedModeReason.trim()
  }
  return getDefaultDegradedModeReason(degradedMode)
}

function getSparseOrEmptyHistoryContext(
  degradedMode: SimulationDegradedMode | undefined
): string | null {
  if (degradedMode === 'INFLUX_EMPTY') {
    return 'Historical data state: empty history window'
  }
  if (degradedMode === 'INFLUX_SPARSE') {
    return 'Historical data state: sparse history window'
  }
  return null
}

function getDeferredOrUnsupportedReason(runResult: SimulationRunResponseDto): string {
  if (runResult.deferredReason?.trim()) {
    return runResult.deferredReason.trim()
  }
  return 'No deferred/unsupported reason was provided by the backend.'
}

function getDeferredOrUnsupportedErrorReason(errorPayload: SimulationErrorResponseDto): string {
  if (typeof errorPayload.deferredReason === 'string' && errorPayload.deferredReason.trim()) {
    return errorPayload.deferredReason.trim()
  }
  if (typeof errorPayload.reason === 'string' && errorPayload.reason.trim()) {
    return errorPayload.reason.trim()
  }
  if (typeof errorPayload.error === 'string' && errorPayload.error.trim()) {
    return errorPayload.error.trim()
  }
  const validationMessage = errorPayload.errors?.[0]?.message
  if (typeof validationMessage === 'string' && validationMessage.trim()) {
    return validationMessage.trim()
  }
  return 'No deferred/unsupported reason was provided by the backend.'
}

function getSimulationErrorDegradedMode(errorPayload: SimulationErrorResponseDto): ResolvedDegradedMode | undefined {
  const degradedMode = errorPayload['degradedMode']
  if (degradedMode === 'INFLUX_EMPTY' || degradedMode === 'INFLUX_SPARSE' || degradedMode === 'INFLUX_ERROR') {
    return degradedMode
  }
  return undefined
}

function getSimulationErrorDegradedReason(errorPayload: SimulationErrorResponseDto): string | undefined {
  const degradedModeReason = errorPayload['degradedModeReason']
  if (typeof degradedModeReason === 'string' && degradedModeReason.trim()) {
    return degradedModeReason.trim()
  }
  return undefined
}

type ReplayComparison = {
  isMatch: boolean
  differingFields: string[]
  replayResult: SimulationRunResponseDto
}

function compareSimulationOutputs(
  original: SimulationRunResponseDto,
  replay: SimulationRunResponseDto
): ReplayComparison {
  const differingFields: string[] = []

  if (original.resultStatus !== replay.resultStatus) differingFields.push('resultStatus')
  if (original.scenarioType !== replay.scenarioType) differingFields.push('scenarioType')
  if (original.evidenceMode !== replay.evidenceMode) differingFields.push('evidenceMode')
  if (original.confidenceLevel !== replay.confidenceLevel) differingFields.push('confidenceLevel')
  if ((original.degradedMode ?? '') !== (replay.degradedMode ?? '')) differingFields.push('degradedMode')
  if (original.recommendation.action !== replay.recommendation.action) differingFields.push('recommendation.action')
  if (original.recommendation.explanation !== replay.recommendation.explanation) differingFields.push('recommendation.explanation')

  const sortedOrigBAVs = [...original.beforeAfterValues].sort((a, b) => a.fieldRef.localeCompare(b.fieldRef))
  const sortedReplayBAVs = [...replay.beforeAfterValues].sort((a, b) => a.fieldRef.localeCompare(b.fieldRef))
  if (sortedOrigBAVs.length !== sortedReplayBAVs.length) {
    differingFields.push('beforeAfterValues.length')
  } else {
    sortedOrigBAVs.forEach((origBav, i) => {
      const replayBav = sortedReplayBAVs[i]
      if (origBav.fieldRef !== replayBav.fieldRef) differingFields.push(`beforeAfterValues[${i}].fieldRef`)
      if (origBav.beforeValue !== replayBav.beforeValue) differingFields.push(`beforeAfterValues[${i}].beforeValue`)
      if (origBav.afterValue !== replayBav.afterValue) differingFields.push(`beforeAfterValues[${i}].afterValue`)
      if (origBav.deltaValue !== replayBav.deltaValue) differingFields.push(`beforeAfterValues[${i}].deltaValue`)
    })
  }

  const sortedOrigSvcs = [...original.impactedServices].sort((a, b) => a.serviceId.localeCompare(b.serviceId))
  const sortedReplaySvcs = [...replay.impactedServices].sort((a, b) => a.serviceId.localeCompare(b.serviceId))
  if (sortedOrigSvcs.length !== sortedReplaySvcs.length) {
    differingFields.push('impactedServices.length')
  } else {
    sortedOrigSvcs.forEach((origSvc, i) => {
      const replaySvc = sortedReplaySvcs[i]
      if (origSvc.serviceId !== replaySvc.serviceId) differingFields.push(`impactedServices[${i}].serviceId`)
      if (origSvc.role !== replaySvc.role) differingFields.push(`impactedServices[${i}].role`)
    })
  }

  const origPaths = [...original.impactedPaths].map((p) => p.path.join('->')).sort()
  const replayPaths = [...replay.impactedPaths].map((p) => p.path.join('->')).sort()
  if (JSON.stringify(origPaths) !== JSON.stringify(replayPaths)) differingFields.push('impactedPaths')

  const sortedOrigAssumptions = [...original.assumptions].sort((a, b) => a.key.localeCompare(b.key))
  const sortedReplayAssumptions = [...replay.assumptions].sort((a, b) => a.key.localeCompare(b.key))
  if (sortedOrigAssumptions.length !== sortedReplayAssumptions.length) {
    differingFields.push('assumptions.length')
  } else {
    sortedOrigAssumptions.forEach((origA, i) => {
      const replayA = sortedReplayAssumptions[i]
      if (origA.key !== replayA.key) differingFields.push(`assumptions[${i}].key`)
      if (origA.value !== replayA.value) differingFields.push(`assumptions[${i}].value`)
      if (origA.type !== replayA.type) differingFields.push(`assumptions[${i}].type`)
    })
  }

  return { isMatch: differingFields.length === 0, differingFields, replayResult: replay }
}

function toDeferredOutcomeFromRunResult(
  runResult: SimulationRunResponseDto,
  resultStatus: DeferredUnsupportedStatus
): DeferredUnsupportedOutcome {
  return {
    resultStatus,
    reason: getDeferredOrUnsupportedReason(runResult),
    degradedMode:
      runResult.degradedMode === 'INFLUX_EMPTY' ||
      runResult.degradedMode === 'INFLUX_SPARSE' ||
      runResult.degradedMode === 'INFLUX_ERROR'
        ? runResult.degradedMode
        : undefined,
    degradedModeReason:
      typeof runResult.degradedModeReason === 'string' && runResult.degradedModeReason.trim()
        ? runResult.degradedModeReason.trim()
        : undefined,
  }
}

export default function Simulations() {
  const [searchParams] = useSearchParams()
  const [scenarioType, setScenarioType] = useState<LockedScenarioType>('failure')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<SimulationResult | null>(null)
  const [contractResult, setContractResult] = useState<SimulationRunResponseDto | null>(null)
  const [deferredOutcome, setDeferredOutcome] = useState<DeferredUnsupportedOutcome | null>(null)
  const [lastScenario, setLastScenario] = useState<LockedScenario | null>(null)
  const [lastRequest, setLastRequest] = useState<SimulationRunRequestDto | null>(null)
  const [replayLoading, setReplayLoading] = useState(false)
  const [replayComparison, setReplayComparison] = useState<ReplayComparison | null>(null)

  const [selectedServiceId, setSelectedServiceId] = useState('')
  const [selectedDepth, setSelectedDepth] = useState(1)
  const [contextData, setContextData] = useState<SimulationContextResponse | null>(null)
  const [contextPrediction, setContextPrediction] = useState<PredictiveCurrentActionResponse | null>(null)
  const [contextLoading, setContextLoading] = useState(false)
  const [contextError, setContextError] = useState<string | null>(null)

  const prefillType = searchParams.get('type')

  useEffect(() => {
    if (prefillType && isLockedScenarioType(prefillType)) {
      setScenarioType(prefillType)
    }
  }, [prefillType])

  useEffect(() => {
    if (!selectedServiceId) {
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

  const handleRun = async (scenario: LockedScenario) => {
    setLoading(true)
    setResult(null)
    setContractResult(null)
    setDeferredOutcome(null)
    setLastScenario(scenario)
    setReplayComparison(null)
    setLastRequest(null)

    try {
      const request = buildSimulationRunRequest(scenario)
      setLastRequest(request)
      const response = await runSimulation(request)
      if (isDeferredUnsupportedStatus(response.resultStatus)) {
        setDeferredOutcome(toDeferredOutcomeFromRunResult(response, response.resultStatus))
      } else {
        setContractResult(response)
      }
    } catch (error) {
      const contractError = parseSimulationRunError(error)
      if (contractError?.resultStatus && isDeferredUnsupportedStatus(contractError.resultStatus)) {
        setDeferredOutcome({
          resultStatus: contractError.resultStatus,
          reason: getDeferredOrUnsupportedErrorReason(contractError),
          degradedMode: getSimulationErrorDegradedMode(contractError),
          degradedModeReason: getSimulationErrorDegradedReason(contractError),
        })
      }
      const validationMessage = contractError?.errors?.[0]?.message
      const message =
        validationMessage ??
        contractError?.deferredReason ??
        contractError?.reason ??
        contractError?.error ??
        (error instanceof Error ? error.message : 'Failed to run simulation')
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  const handleReplay = async () => {
    if (!contractResult || !lastRequest) return
    setReplayLoading(true)
    setReplayComparison(null)
    try {
      const replayRequest: SimulationRunRequestDto = {
        ...lastRequest,
        snapshotTimestamp: contractResult.snapshotTimestamp,
        snapshotHash: contractResult.snapshotHash,
      }
      const replayResponse = await replaySimulation(replayRequest)
      setReplayComparison(compareSimulationOutputs(contractResult, replayResponse))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Replay failed')
    } finally {
      setReplayLoading(false)
    }
  }

  const renderReplayComparison = (comparison: ReplayComparison) => {
    if (comparison.isMatch) {
      return (
        <div className="flex items-start gap-3 rounded-xl border-2 border-emerald-500/70 bg-emerald-500/15 p-4">
          <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
          <div>
            <p className="text-sm font-bold text-[var(--text-primary)]">Deterministic match confirmed</p>
            <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
              Replay with the same snapshot produced identical output fields. Simulation is deterministic.
            </p>
          </div>
        </div>
      )
    }
    return (
      <div className="rounded-xl border-2 border-rose-500/70 bg-rose-500/12 p-4">
        <div className="flex items-start gap-3">
          <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-700" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-[var(--text-primary)]">Deterministic mismatch detected</p>
            <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
              Replay returned different values for the following fields. Evidence details are preserved below.
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {comparison.differingFields.map((field) => (
                <span
                  key={field}
                  className="rounded border border-rose-500/50 bg-rose-500/10 px-2 py-0.5 font-mono text-xs text-[var(--text-primary)]"
                >
                  {field}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
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
    const derivedScore = deriveHealthScore(contextData, aggregatedEdges)
    const healthScore = Math.round(derivedScore)
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
                <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider">Health Score <InfoHint text="A single number (0–100) showing how healthy the selected service and its neighbors are right now. 100 = everything is working perfectly. Below 70 = something needs attention soon." /></div>
                <div className="mt-1 flex items-end gap-1">
                  <span className="text-3xl font-black leading-none">{healthScore}</span>
                  <span className="pb-0.5 text-sm font-semibold">/100</span>
                </div>
                <p className="mt-1 text-xs">{healthLabel}</p>
              </div>

              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-4 py-3 text-[var(--text-primary)]">
                <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  Primary Bottleneck <InfoHint text="The service or connection that is currently under the most stress. Think of it like the weakest link in a chain — if something breaks, it will likely break here first." />
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
                <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  Time To Impact <InfoHint text="How long before real users might start noticing problems like slow loading or errors. 'Stable' means no problems expected soon. A short time (like < 2 min) means action may be needed right away." />
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
            <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Services In Scope <InfoHint text="The total number of services (small programs) that are connected to your selected service. These are the services that could be affected if something goes wrong." /></div>
            <div className="mt-1 text-2xl font-black text-[var(--text-primary)]">{contextData.nodes.length}</div>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">Neighborhood around {contextData.target.name ?? shortServiceName(contextData.target.serviceId)}.</p>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-solid)] p-4">
            <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Busiest Link <InfoHint text="The connection between two services that is handling the most traffic right now. The number shows requests per second (how many times one service talks to another every second). Higher = busier." /></div>
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
            <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Worst Slow-End Latency <InfoHint text="The slowest response time seen among the connected services (measured in milliseconds). This shows how long the slowest 5% of requests are taking. If this number is high, some users are experiencing noticeable delays." />
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
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-[var(--text-secondary)]">Recommended Operator Action <InfoHint text="A suggested next step based on what the system is seeing right now. Following this advice can help prevent problems before users notice them." /></h3>
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
                (contextData.nodes.find((node) => node.serviceId === contextData.target.serviceId)
                  ?.availability ?? 1) * 100
              )}
              <InfoHint text="What percentage of the time this service is working correctly. 100% = always available. Lower values mean the service is sometimes failing or unreachable." />
            </span>
            {hottestEdge && (
              <span className="inline-flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                Peak error exposure: {formatPercent(hottestEdge.maxErrorRate * 100)}
                <InfoHint text="The highest error rate seen on any connection right now. A higher percentage means more requests are failing. Even a small percentage (like 2%) can affect many users if traffic is high." />
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

  const renderTraceabilityPanel = (runResult: SimulationRunResponseDto) => {
    type TraceRow = { displayLabel: string; backendPath: string; value: string; traceRef?: string }

    const identityRows: TraceRow[] = [
      {
        displayLabel: 'Snapshot Timestamp',
        backendPath: 'response.snapshotTimestamp',
        value: runResult.snapshotTimestamp,
      },
      {
        displayLabel: 'Snapshot Hash',
        backendPath: 'response.snapshotHash',
        value: runResult.snapshotHash ?? 'n/a',
      },
      {
        displayLabel: 'Schema Version',
        backendPath: 'response.version',
        value: runResult.version,
      },
      {
        displayLabel: 'Scenario Type',
        backendPath: 'response.scenarioType',
        value: runResult.scenarioType,
      },
      {
        displayLabel: 'Result Status',
        backendPath: 'response.resultStatus',
        value: runResult.resultStatus,
      },
      {
        displayLabel: 'Evidence Mode',
        backendPath: 'response.evidenceMode',
        value: runResult.evidenceMode,
      },
      {
        displayLabel: 'Confidence Level',
        backendPath: 'response.confidenceLevel',
        value: runResult.confidenceLevel,
      },
      ...(runResult.degradedMode
        ? [
            {
              displayLabel: 'Degraded Mode',
              backendPath: 'response.degradedMode',
              value: runResult.degradedMode,
            },
          ]
        : []),
    ]

    const bavRows: TraceRow[] = runResult.beforeAfterValues.map((bav, i) => ({
      displayLabel: bav.description || bav.fieldRef,
      backendPath: `response.beforeAfterValues[${i}].fieldRef`,
      value: `${formatOptionalNumber(bav.beforeValue)} → ${formatOptionalNumber(bav.afterValue)}${bav.unit ? ` ${bav.unit}` : ''}`,
      traceRef: bav.traceRef,
    }))

    return (
      <Section title="Field-Level Traceability" icon={FileText}>
        <p className="mb-5 text-sm text-[var(--text-secondary)]">
          Every displayed simulation value is mapped to its backend contract field path below. Use this panel to
          verify that no displayed value is hardcoded or inferred outside the backend response.
        </p>

        {/* Snapshot + Result Identity */}
        <div className="mb-6">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Snapshot &amp; Result Identity
          </h3>
          <div className={tableShellClass}>
            <table className="w-full">
              <thead className={tableHeadRowClass}>
                <tr>
                  <th className={tableHeaderCellClass}>Displayed Label</th>
                  <th className={tableHeaderCellClass}>Backend Field Path</th>
                  <th className={tableHeaderCellClass}>Value</th>
                </tr>
              </thead>
              <tbody>
                {identityRows.map((row) => (
                  <tr key={row.backendPath} className={tableBodyRowClass}>
                    <td className={tableCellClass}>{row.displayLabel}</td>
                    <td className={tableCellClass}>
                      <span className="font-mono text-xs">{row.backendPath}</span>
                    </td>
                    <td className={tableCellClass}>
                      <span className="break-all font-mono text-xs">{row.value}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Before/After Value Traceability */}
        {bavRows.length > 0 && (
          <div className="mb-6">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Before/After Value Traceability
            </h3>
            <div className={tableShellClass}>
              <table className="w-full">
                <thead className={tableHeadRowClass}>
                  <tr>
                    <th className={tableHeaderCellClass}>Displayed Label</th>
                    <th className={tableHeaderCellClass}>Backend Field Path</th>
                    <th className={tableHeaderCellClass}>Before → After</th>
                    <th className={tableHeaderCellClass}>Trace Ref</th>
                  </tr>
                </thead>
                <tbody>
                  {bavRows.map((row) => (
                    <tr key={row.traceRef ?? row.backendPath} className={tableBodyRowClass}>
                      <td className={tableCellClass}>{row.displayLabel}</td>
                      <td className={tableCellClass}>
                        <span className="font-mono text-xs">{row.backendPath}</span>
                      </td>
                      <td className={tableCellClass}>
                        <span className="font-mono text-xs">{row.value}</span>
                      </td>
                      <td className={tableCellClass}>
                        <span className="font-mono text-xs">{row.traceRef ?? '-'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Recommendation Explanation + Evidence Refs */}
        <div className="mb-6">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Recommendation (response.recommendation)
          </h3>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-solid)] p-4 space-y-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Action <span className="font-mono normal-case text-[var(--text-secondary)]">(response.recommendation.action)</span>
              </p>
              <p className="mt-1 text-sm text-[var(--text-primary)]">
                {runResult.recommendation.action || 'n/a'}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Explanation <span className="font-mono normal-case text-[var(--text-secondary)]">(response.recommendation.explanation)</span>
              </p>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                {runResult.recommendation.explanation || 'n/a'}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Evidence Source Refs <span className="font-mono normal-case text-[var(--text-secondary)]">(response.recommendation.evidenceSourceRefs)</span>
              </p>
              <div className="mt-1 flex flex-wrap gap-2">
                {runResult.recommendation.evidenceSourceRefs.length > 0
                  ? runResult.recommendation.evidenceSourceRefs.map((ref) => (
                      <span
                        key={ref}
                        className="rounded border border-[var(--border)] bg-[var(--surface-soft)] px-2 py-0.5 text-xs font-mono text-[var(--text-primary)]"
                      >
                        {ref}
                      </span>
                    ))
                  : <span className="text-sm text-[var(--text-muted)]">None</span>}
              </div>
            </div>
          </div>
        </div>

        {/* Assumptions Traceability */}
        {runResult.assumptions.length > 0 && (
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Assumptions (response.assumptions)
            </h3>
            <div className={tableShellClass}>
              <table className="w-full">
                <thead className={tableHeadRowClass}>
                  <tr>
                    <th className={tableHeaderCellClass}>Key</th>
                    <th className={tableHeaderCellClass}>Backend Field Path</th>
                    <th className={tableHeaderCellClass}>Type</th>
                    <th className={tableHeaderCellClass}>Value</th>
                    <th className={tableHeaderCellClass}>Source</th>
                    <th className={tableHeaderCellClass}>Trace Ref</th>
                  </tr>
                </thead>
                <tbody>
                  {runResult.assumptions.map((assumption, i) => (
                    <tr key={assumption.traceRef} className={tableBodyRowClass}>
                      <td className={tableCellClass}>{assumption.key}</td>
                      <td className={tableCellClass}>
                        <span className="font-mono text-xs">{`response.assumptions[${i}]`}</span>
                      </td>
                      <td className={tableCellClass}>
                        <span className="font-mono text-xs">{assumption.type}</span>
                      </td>
                      <td className={tableCellClass}>{assumption.value}</td>
                      <td className={tableCellClass}>{assumption.source}</td>
                      <td className={tableCellClass}>
                        <span className="font-mono text-xs">{assumption.traceRef}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Section>
    )
  }

  const renderContractResults = (runResult: SimulationRunResponseDto) => {
    const hasDegradedMode = Boolean(runResult.degradedMode)
    const degradedModeReason = getDegradedModeReason(runResult.degradedMode, runResult.degradedModeReason)
    const sparseOrEmptyHistoryContext = getSparseOrEmptyHistoryContext(runResult.degradedMode)

    return (
      <div className="space-y-6">
        <Section title="Simulation Evidence Summary" icon={Activity}
          actions={
            <button
              type="button"
              onClick={() => { void handleReplay() }}
              disabled={replayLoading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-panel)] disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${replayLoading ? 'animate-spin' : ''}`} />
              {replayLoading ? 'Replaying...' : 'Replay same snapshot'}
            </button>
          }
        >
          {hasDegradedMode && (
            <div className="mb-4 rounded-xl border-2 border-amber-500/70 bg-amber-500/20 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-700" />
                <div className="space-y-1">
                  <p className="text-sm font-bold uppercase tracking-wide text-[var(--text-primary)]">
                    Degraded mode active: {runResult.degradedMode}
                  </p>
                  {sparseOrEmptyHistoryContext && (
                    <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-primary)]">
                      {sparseOrEmptyHistoryContext}
                    </p>
                  )}
                  {degradedModeReason && <p className="text-sm text-[var(--text-secondary)]">{degradedModeReason}</p>}
                </div>
              </div>
            </div>
          )}

          {replayComparison && (
            <div className="mb-4">
              {renderReplayComparison(replayComparison)}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-solid)] p-4">
              <h3 className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Data Snapshot <InfoHint text="A frozen copy of all the service data at the exact moment the simulation ran. The timestamp shows when, and the fingerprint is a unique ID so you can refer back to this exact run later." />
              </h3>
              <div className="space-y-2 text-sm text-[var(--text-primary)]">
                <p className="break-all">
                  Taken at: <span className="font-mono">{runResult.snapshotTimestamp}</span>
                </p>
                <p className="break-all">
                  Fingerprint: <span className="font-mono">{runResult.snapshotHash ?? 'n/a'}</span>
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-solid)] p-4">
              <h3 className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Simulation Outcome <InfoHint text="A summary of what the simulation found. It tells you what kind of test was run, whether it passed or flagged issues, how the results were calculated, and how confident the system is in the answer." />
              </h3>
              <div className="space-y-2 text-sm text-[var(--text-primary)]">
                <p className="flex items-center gap-1">
                  What was tested: <span className="font-mono">{runResult.scenarioType}</span>
                </p>
                <p className="flex items-center gap-1">
                  Outcome: <span className="font-mono">{runResult.resultStatus}</span>
                  <InfoHint text="Whether the simulation completed successfully, found issues, or could not run. A 'COMPLETED' status means results are ready to review." />
                </p>
                <p className="flex items-center gap-1">
                  How results were calculated: <span className="font-mono">{runResult.evidenceMode}</span>
                  <InfoHint text="Shows whether results came from real historical data, a mathematical model, or a mix of both. Real data = higher reliability." />
                </p>
                <p className="flex items-center gap-1">
                  Confidence: <span className="font-mono">{runResult.confidenceLevel}</span>
                  <InfoHint text="How sure the system is about these results. 'HIGH' means the data strongly supports the conclusion. 'LOW' means treat as a rough estimate." />
                </p>
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--surface-solid)] p-4">
            <h3 className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Where the Evidence Came From <InfoHint text="Lists all the data sources the simulation used to produce its results — for example, live metrics, the service dependency graph, or historical records. More sources generally means more reliable results." />
            </h3>
            <div className="flex flex-wrap gap-2">
              {runResult.evidenceSources.map((source) => (
                <span
                  key={source}
                  className="rounded border border-[var(--border)] bg-[var(--surface-soft)] px-2 py-0.5 text-xs font-medium text-[var(--text-primary)]"
                >
                  {source}
                </span>
              ))}
            </div>
          </div>
        </Section>

        <Section title="Assumptions" icon={ShieldCheck}>
          {runResult.assumptions.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">No assumptions returned.</p>
          ) : (
            <div className={tableShellClass}>
              <table className="w-full">
                <thead className={tableHeadRowClass}>
                  <tr>
                    <th className={tableHeaderCellClass}>Key</th>
                    <th className={tableHeaderCellClass}>Type</th>
                    <th className={tableHeaderCellClass}>Value</th>
                    <th className={tableHeaderCellClass}>Source</th>
                    <th className={tableHeaderCellClass}>Trace</th>
                    <th className={tableHeaderCellClass}>Description</th>
                  </tr>
                </thead>
                <tbody>
                  {runResult.assumptions.map((assumption) => (
                    <tr key={assumption.traceRef} className={tableBodyRowClass}>
                      <td className={tableCellClass}>{assumption.key}</td>
                      <td className={tableCellClass}>
                        <span className="font-mono text-xs">{assumption.type}</span>
                      </td>
                      <td className={tableCellClass}>{assumption.value}</td>
                      <td className={tableCellClass}>{assumption.source}</td>
                      <td className={tableCellClass}>
                        <span className="font-mono text-xs">{assumption.traceRef}</span>
                      </td>
                      <td className={tableCellClass}>{assumption.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        <Section title="Impacted Services" icon={Network}>
          {runResult.impactedServices.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">No impacted services returned.</p>
          ) : (
            <div className={tableShellClass}>
              <table className="w-full">
                <thead className={tableHeadRowClass}>
                  <tr>
                    <th className={tableHeaderCellClass}>Service ID</th>
                    <th className={tableHeaderCellClass}>Name</th>
                    <th className={tableHeaderCellClass}>Namespace</th>
                    <th className={tableHeaderCellClass}>Role</th>
                  </tr>
                </thead>
                <tbody>
                  {runResult.impactedServices.map((service) => (
                    <tr key={`${service.serviceId}:${service.role}`} className={tableBodyRowClass}>
                      <td className={tableCellClass}>
                        <span className="font-mono text-xs">{service.serviceId}</span>
                      </td>
                      <td className={tableCellClass}>{service.name}</td>
                      <td className={tableCellClass}>{service.namespace}</td>
                      <td className={tableCellClass}>{service.role}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        <Section title="Impacted Paths" icon={Network}>
          {runResult.impactedPaths.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">No impacted paths returned.</p>
          ) : (
            <div className={tableShellClass}>
              <table className="w-full">
                <thead className={tableHeadRowClass}>
                  <tr>
                    <th className={tableHeaderCellClass}>Path</th>
                  </tr>
                </thead>
                <tbody>
                  {runResult.impactedPaths.map((path, index) => (
                    <tr key={`${path.path.join('->')}-${index}`} className={tableBodyRowClass}>
                      <td className={tableCellClass}>{path.path.join(' -> ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        <Section title="Before/After Values" icon={TrendingUp}>
          {runResult.beforeAfterValues.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">No before/after values returned.</p>
          ) : (
            <div className={tableShellClass}>
              <table className="w-full">
                <thead className={tableHeadRowClass}>
                  <tr>
                    <th className={tableHeaderCellClass}>Field</th>
                    <th className={tableHeaderCellClass}>Before</th>
                    <th className={tableHeaderCellClass}>After</th>
                    <th className={tableHeaderCellClass}>Delta</th>
                    <th className={tableHeaderCellClass}>Trace</th>
                    <th className={tableHeaderCellClass}>Description</th>
                  </tr>
                </thead>
                <tbody>
                  {runResult.beforeAfterValues.map((value) => (
                    <tr key={value.traceRef} className={tableBodyRowClass}>
                      <td className={tableCellClass}>{value.fieldRef}</td>
                      <td className={tableCellClass}>{formatNumberWithUnit(value.beforeValue, value.unit)}</td>
                      <td className={tableCellClass}>{formatNumberWithUnit(value.afterValue, value.unit)}</td>
                      <td className={tableCellClass}>{formatNumberWithUnit(value.deltaValue, value.unit)}</td>
                      <td className={tableCellClass}>
                        <span className="font-mono text-xs">{value.traceRef}</span>
                      </td>
                      <td className={tableCellClass}>{value.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        <Section title="Recommendation" icon={Sparkles}>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-solid)] p-4">
            <p className="text-sm text-[var(--text-secondary)]">
              Action: <span className="font-mono text-[var(--text-primary)]">{runResult.recommendation.action || 'n/a'}</span>
            </p>
            <p className="mt-2 text-sm text-[var(--text-primary)]">{runResult.recommendation.explanation}</p>
            <div className="mt-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Recommendation Evidence References
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {runResult.recommendation.evidenceSourceRefs.map((reference) => (
                  <span
                    key={reference}
                    className="rounded border border-[var(--border)] bg-[var(--surface-soft)] px-2 py-0.5 text-xs font-mono text-[var(--text-primary)]"
                  >
                    {reference}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </Section>

        {renderTraceabilityPanel(runResult)}
      </div>
    )
  }

  const renderDeferredOutcome = (outcome: DeferredUnsupportedOutcome) => {
    const degradedModeReason = getDegradedModeReason(outcome.degradedMode, outcome.degradedModeReason)
    const sparseOrEmptyHistoryContext = getSparseOrEmptyHistoryContext(outcome.degradedMode)
    return (
      <div className="space-y-6">
        <Section title="Simulation Evidence Summary" icon={Activity}>
          {outcome.degradedMode && (
            <div className="mb-4 rounded-xl border-2 border-amber-500/70 bg-amber-500/20 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-700" />
                <div className="space-y-1">
                  <p className="text-sm font-bold uppercase tracking-wide text-[var(--text-primary)]">
                    Degraded mode active: {outcome.degradedMode}
                  </p>
                  {sparseOrEmptyHistoryContext && (
                    <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-primary)]">
                      {sparseOrEmptyHistoryContext}
                    </p>
                  )}
                  {degradedModeReason && <p className="text-sm text-[var(--text-secondary)]">{degradedModeReason}</p>}
                </div>
              </div>
            </div>
          )}

          <div className="rounded-lg border border-rose-500/50 bg-rose-500/12 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Backend Outcome</p>
            <p className="mt-2 text-sm font-semibold text-[var(--text-primary)]">{outcome.resultStatus} result</p>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">{outcome.reason}</p>
          </div>
        </Section>

        <Section title="Simulation Output" icon={TrendingUp}>
          <p className="rounded border border-[var(--border)] bg-[var(--surface-solid)] p-4 text-sm text-[var(--text-secondary)]">
            No simulated impact cards are shown for deferred or unsupported outcomes.
          </p>
        </Section>
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
              onScenarioTypeChange={(type) => {
                setScenarioType(type)
                setResult(null)
                setContractResult(null)
                setDeferredOutcome(null)
                setLastScenario(null)
                setLastRequest(null)
                setReplayComparison(null)
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

        {contractResult && !loading && renderContractResults(contractResult)}
        {deferredOutcome && !contractResult && !loading && renderDeferredOutcome(deferredOutcome)}

        {result && !loading && (
          <>
            {isServiceAdditionResult(result)
              ? renderServiceAdditionResults(result)
              : isScaleResult(result)
                ? renderScaleResults(result)
                : renderFailureResults(result)}
          </>
        )}

        {!contractResult && !deferredOutcome && !result && !loading && (
          <EmptyState
            icon={<Sparkles className="h-12 w-12 text-[var(--text-dim)]" />}
            message="Configure a scenario and click Run to generate simulation evidence"
            description={
              lastScenario
                ? 'Previous run cleared. Adjust your scenario and run again.'
                : 'Choose one of the five locked simulation scenarios and run to generate evidence-backed output.'
            }
          />
        )}
      </div>
    </div>
  )
}
