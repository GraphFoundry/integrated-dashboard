import { useState } from 'react'
import type { FailureResponse, ScaleResponse, DataFreshness, LastRunMeta } from '@/lib/types'
import StatusBadge, { type BadgeVariant } from '@/components/common/StatusBadge'

interface OperatorSummaryProps {
  readonly result: FailureResponse | ScaleResponse
  readonly lastRunMeta?: LastRunMeta
}

// ─────────────────────────────────────────────────────────────────────────────
// Badge helpers using centralized StatusBadge
// ─────────────────────────────────────────────────────────────────────────────

function getConfidenceVariant(confidence: string | undefined): BadgeVariant {
  if (confidence === 'high') return 'success'
  if (confidence === 'medium') return 'warning'
  if (confidence === 'low') return 'destructive'
  return 'secondary'
}

function ConfidenceBadge({ confidence }: { readonly confidence?: string }) {
  if (!confidence) return null
  return (
    <StatusBadge variant={getConfidenceVariant(confidence)}>
      Confidence: {confidence}
    </StatusBadge>
  )
}

function FreshnessBadge({ freshness }: { readonly freshness?: DataFreshness }) {
  if (!freshness) return null

  const isStale = freshness.stale === true
  const lastUpdated = freshness.lastUpdatedSecondsAgo
  const variant: BadgeVariant = isStale ? 'destructive' : 'success'
  const label = isStale ? '⚠ Stale' : '● Fresh'

  return (
    <StatusBadge variant={variant}>
      {label}
      {lastUpdated != null && ` (${lastUpdated}s ago)`}
    </StatusBadge>
  )
}

function SourceBadge({ source }: { readonly source: 'live' | 'mock' }) {
  const variant: BadgeVariant = source === 'live' ? 'success' : 'secondary'
  const label = source === 'live' ? '🚀 Live' : '📋 Mock'
  return <StatusBadge variant={variant}>{label}</StatusBadge>
}

type CardVariant = 'default' | 'warning' | 'success'

interface SummaryCardProps {
  readonly title: string
  readonly value: string | number
  readonly subtitle?: string
  readonly variant?: CardVariant
}

function SummaryCard({ title, value, subtitle, variant = 'default' }: SummaryCardProps) {
  let borderClass = 'border-slate-700'
  let valueClass = 'text-white'
  if (variant === 'warning') {
    borderClass = 'border-yellow-700/50'
    valueClass = 'text-yellow-400'
  } else if (variant === 'success') {
    borderClass = 'border-green-700/50'
    valueClass = 'text-green-400'
  }

  return (
    <div className={`bg-slate-900 border ${borderClass} rounded-lg p-4`}>
      <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">{title}</p>
      <p className={`text-2xl font-bold ${valueClass}`}>{value}</p>
      {subtitle && <p className="text-xs text-slate-500 mt-1">{subtitle}</p>}
    </div>
  )
}

function isFailureResponse(result: FailureResponse | ScaleResponse): result is FailureResponse {
  return 'affectedCallers' in result && !('latencyEstimate' in result)
}

function isScaleResponse(result: FailureResponse | ScaleResponse): result is ScaleResponse {
  return 'latencyEstimate' in result || 'scalingDirection' in result
}

// Helper functions to reduce cognitive complexity
function formatRps(rps: number | undefined | null): string {
  if (rps === undefined || rps === null) return '—'
  return `${rps.toFixed(1)} RPS`
}

function formatMs(ms: number | undefined | null): string {
  if (ms === undefined || ms === null) return '—'
  return `${ms.toFixed(1)} ms`
}

function formatDeltaMs(deltaMs: number | undefined | null): string {
  if (deltaMs === undefined || deltaMs === null) return '—'
  const sign = deltaMs > 0 ? '+' : ''
  return `${sign}${deltaMs.toFixed(1)} ms`
}

function getScalingVariant(direction: string | undefined): CardVariant {
  if (direction === 'up') return 'success'
  if (direction === 'down') return 'warning'
  return 'default'
}

function getDeltaVariant(deltaMs: number | undefined | null): CardVariant {
  if (deltaMs == null) return 'default'
  if (deltaMs < 0) return 'success'
  if (deltaMs > 0) return 'warning'
  return 'default'
}

function FailureSummaryCards({ result }: { readonly result: FailureResponse }) {
  const lostTrafficVariant = result.totalLostTrafficRps && result.totalLostTrafficRps > 0 ? 'warning' : 'default'
  const unreachableVariant = result.unreachableServices && result.unreachableServices.length > 0 ? 'warning' : 'default'

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <SummaryCard
        title="Total Lost Traffic"
        value={formatRps(result.totalLostTrafficRps)}
        variant={lostTrafficVariant}
      />
      <SummaryCard
        title="Affected Callers"
        value={result.affectedCallers?.length ?? 0}
      />
      <SummaryCard
        title="Affected Downstream"
        value={result.affectedDownstream?.length ?? 0}
      />
      <SummaryCard
        title="Unreachable Services"
        value={result.unreachableServices?.length ?? 0}
        variant={unreachableVariant}
      />
    </div>
  )
}

function ScaleSummaryCards({ result }: { readonly result: ScaleResponse }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <SummaryCard
        title="Scaling Direction"
        value={result.scalingDirection ?? '—'}
        variant={getScalingVariant(result.scalingDirection)}
      />
      <SummaryCard
        title="Baseline Latency"
        value={formatMs(result.latencyEstimate?.baselineMs)}
      />
      <SummaryCard
        title="Projected Latency"
        value={formatMs(result.latencyEstimate?.projectedMs)}
      />
      <SummaryCard
        title="Latency Delta"
        value={formatDeltaMs(result.latencyEstimate?.deltaMs)}
        variant={getDeltaVariant(result.latencyEstimate?.deltaMs)}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Proof Header helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatRelativeTime(isoTimestamp: string): string {
  const diff = Date.now() - new Date(isoTimestamp).getTime()
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ago`
}

function formatAbsoluteTime(isoTimestamp: string): string {
  return new Date(isoTimestamp).toLocaleString()
}

function getScenarioSummary(meta: LastRunMeta): string {
  const s = meta.scenario
  if (s.type === 'failure') {
    return `Failure → ${s.serviceId} (depth: ${s.maxDepth})`
  }
  return `Scale → ${s.serviceId} (${s.currentPods}→${s.newPods} pods, ${s.latencyMetric})`
}

interface CopyButtonProps {
  readonly text: string
  readonly label?: string
}

function CopyButton({ text, label = 'Copy' }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      className="text-xs text-blue-400 hover:text-blue-300 underline"
    >
      {copied ? '✓ Copied' : label}
    </button>
  )
}

export default function OperatorSummary({ result, lastRunMeta }: OperatorSummaryProps) {
  const correlationId = result.correlationId
  const generatedAt = result.pipelineTrace?.generatedAt

  // Determine confidence and freshness (both types can have these)
  const failureResult = result as FailureResponse
  const confidence = failureResult.confidence
  const dataFreshness = failureResult.dataFreshness

  // Use lastRunMeta.requestId if available, otherwise fall back to correlationId from response
  const displayRequestId = lastRunMeta?.requestId ?? correlationId

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-6 space-y-4">
      {/* Proof Header Row */}
      {lastRunMeta && (
        <div className="flex flex-wrap items-center gap-3 pb-3 border-b border-slate-700">
          <SourceBadge source={lastRunMeta.source} />
          <span className="text-xs text-slate-500">
            {formatRelativeTime(lastRunMeta.startedAt)} ({formatAbsoluteTime(lastRunMeta.startedAt)})
          </span>
          <span className="text-xs text-slate-500">•</span>
          <span className="text-xs text-slate-400">{getScenarioSummary(lastRunMeta)}</span>
        </div>
      )}

      {/* Header with badges */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-white">Operator Summary</h2>
        <div className="flex flex-wrap items-center gap-2">
          <ConfidenceBadge confidence={confidence} />
          <FreshnessBadge freshness={dataFreshness} />
        </div>
      </div>

      {/* Request metadata with copy button */}
      {(displayRequestId || generatedAt) && (
        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
          {displayRequestId && (
            <span className="flex items-center gap-2">
              Request ID: <code className="text-slate-400 bg-slate-800 px-1 rounded">{displayRequestId}</code>
              <CopyButton text={displayRequestId} label="Copy" />
            </span>
          )}
          {generatedAt && (
            <span>
              Generated: <code className="text-slate-400">{generatedAt}</code>
            </span>
          )}
        </div>
      )}

      {/* Failure-specific summary cards */}
      {isFailureResponse(result) && <FailureSummaryCards result={result} />}

      {/* Scale-specific summary cards */}
      {isScaleResponse(result) && <ScaleSummaryCards result={result} />}
    </div>
  )
}
