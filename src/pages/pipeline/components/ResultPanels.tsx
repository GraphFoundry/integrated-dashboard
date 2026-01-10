import type {
  FailureResponse,
  ScaleResponse,
  ScaleAffectedCaller,
  FailureAffectedCaller,
  Recommendation,
  CriticalPath,
  ScaleAffectedPath,
  LastRunMeta,
} from '@/lib/types'
import type { StageId, StageState } from '@/pages/pipeline/pipelineTypes'
import { PIPELINE_STAGES, isStageCompleted, stageIndex } from '@/pages/pipeline/pipelineTypes'
import OperatorSummary from './OperatorSummary'

export interface DemoStopInfo {
  stopAtStage: StageId | null
  disabledStages: StageId[]
}

interface ResultPanelsProps {
  readonly result: FailureResponse | ScaleResponse
  readonly demoStopInfo?: DemoStopInfo
  readonly currentStageIndex?: number
  readonly stageStates?: Record<StageId, StageState>
  readonly lastRunMeta?: LastRunMeta
}

// Stages that must complete before certain results are available
const REQUIRED_STAGES: Record<string, StageId> = {
  impact: 'compute-impact',
  recommendations: 'recommendations',
  paths: 'path-analysis',
}

interface DemoStopMessageProps {
  readonly type: string
  readonly stageName: string
  readonly isDisabled: boolean
}

function DemoStopMessage({ type, stageName, isDisabled }: DemoStopMessageProps) {
  return (
    <div className="bg-yellow-900/10 border border-yellow-700/30 rounded-lg p-4">
      <div className="flex items-center gap-2 text-yellow-400 mb-2">
        <span>⏸</span>
        <span className="font-medium">Demo Mode: {type} Not Available</span>
      </div>
      <p className="text-sm text-slate-400">
        {isDisabled
          ? `Stage "${stageName}" is disabled in demo settings.`
          : `Pipeline stopped before "${stageName}" stage completed.`}
      </p>
    </div>
  )
}

function getStageName(stageId: StageId): string {
  const stage = PIPELINE_STAGES.find((s) => s.id === stageId)
  return stage?.name ?? stageId
}

function shouldShowStopMessage(
  requiredStage: StageId,
  demoStopInfo?: DemoStopInfo,
  currentStageIndex?: number,
  stageStates?: Record<StageId, StageState>
): { show: boolean; isDisabled: boolean } {
  if (!demoStopInfo || !stageStates) return { show: false, isDisabled: false }

  const { stopAtStage, disabledStages } = demoStopInfo

  if (disabledStages.includes(requiredStage)) {
    return { show: true, isDisabled: true }
  }

  const currentIdx = currentStageIndex ?? stageIndex(PIPELINE_STAGES.at(-1)!.id)
  const stopIdx = stopAtStage ? stageIndex(stopAtStage) : null

  const completed = isStageCompleted(requiredStage, currentIdx, stageStates, stopIdx)

  if (!completed) {
    return { show: true, isDisabled: false }
  }

  return { show: false, isDisabled: false }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper functions to reduce cognitive complexity and avoid nested ternaries
// ─────────────────────────────────────────────────────────────────────────────

function formatOptionalRps(rps: number | undefined): string {
  if (rps === undefined) return '—'
  return `${rps.toFixed(1)} RPS`
}

function formatOptionalMs(ms: number | undefined): string {
  if (ms === undefined) return '—'
  return `${ms.toFixed(1)} ms`
}

function formatOptionalPercent(rate: number | undefined): string {
  if (rate === undefined) return '—'
  return `${(rate * 100).toFixed(1)}%`
}

function getDeltaClasses(deltaMs: number): string {
  if (deltaMs < 0) return 'bg-green-900/30 text-green-400'
  if (deltaMs > 0) return 'bg-red-900/30 text-red-400'
  return 'bg-slate-800 text-slate-400'
}

function formatDelta(deltaMs: number): string {
  const sign = deltaMs > 0 ? '+' : ''
  return `${sign}${deltaMs.toFixed(1)} ms`
}

function getPriorityClasses(priority: string | undefined): string {
  if (priority === 'high') return 'bg-red-900/30 text-red-400'
  if (priority === 'medium') return 'bg-yellow-900/30 text-yellow-400'
  return 'bg-slate-800 text-slate-400'
}

// ─────────────────────────────────────────────────────────────────────────────
// Raw JSON Panel with Copy/Download actions
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'

interface RawJsonPanelProps {
  readonly result: FailureResponse | ScaleResponse
}

function RawJsonPanel({ result }: RawJsonPanelProps) {
  const [copied, setCopied] = useState(false)
  const jsonString = JSON.stringify(result, null, 2)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(jsonString)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDownload = () => {
    const isoStr = new Date().toISOString()
    // Format: 2026-01-03T19-15-22
    const timestamp = isoStr.slice(0, 19).split(':').join('-')
    const filename = `simulation-result-${timestamp}.json`
    const blob = new Blob([jsonString], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <details className="bg-slate-900 border border-slate-700 rounded-lg p-6">
      <summary className="text-white font-semibold cursor-pointer hover:text-blue-400 flex items-center justify-between">
        <span>Raw JSON Response</span>
      </summary>
      <div className="mt-4 space-y-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void handleCopy()}
            className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-600 transition-colors"
          >
            {copied ? '✓ Copied' : '📋 Copy JSON'}
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-600 transition-colors"
          >
            ⬇ Download JSON
          </button>
        </div>
        <pre className="bg-slate-950 border border-slate-700 rounded p-4 overflow-x-auto text-xs text-slate-300">
          {jsonString}
        </pre>
      </div>
    </details>
  )
}

export default function ResultPanels({
  result,
  demoStopInfo,
  currentStageIndex,
  stageStates,
  lastRunMeta,
}: ResultPanelsProps) {
  // Type guard helpers
  const isFailureResult = 'affectedCallers' in result && !('latencyEstimate' in result)
  const isScaleResult = 'latencyEstimate' in result || 'scalingDirection' in result

  // Normalize affectedCallers for Scale (can be array or {items: []})
  const getScaleCallers = (): ScaleAffectedCaller[] => {
    if (!isScaleResult) return []
    const scaleRes = result
    if (!('affectedCallers' in scaleRes) || !scaleRes.affectedCallers) return []
    if (Array.isArray(scaleRes.affectedCallers)) {
      return scaleRes.affectedCallers
    }
    const callersObj = scaleRes.affectedCallers as { items?: ScaleAffectedCaller[] }
    return callersObj.items ?? []
  }

  // Check what results should be hidden due to demo stop
  const impactStop = shouldShowStopMessage(
    REQUIRED_STAGES.impact,
    demoStopInfo,
    currentStageIndex,
    stageStates
  )
  const pathsStop = shouldShowStopMessage(
    REQUIRED_STAGES.paths,
    demoStopInfo,
    currentStageIndex,
    stageStates
  )
  const recsStop = shouldShowStopMessage(
    REQUIRED_STAGES.recommendations,
    demoStopInfo,
    currentStageIndex,
    stageStates
  )

  // Get typed results - use type guards for narrowing
  const failureResult = isFailureResult ? (result as FailureResponse) : null
  const scaleResult = isScaleResult ? result : null
  const scaleCallers = getScaleCallers()

  return (
    <div className="space-y-6">
      {/* Operator Summary (always show first) */}
      <OperatorSummary result={result} lastRunMeta={lastRunMeta} />

      {/* Explanation (if present) */}
      {(failureResult?.explanation ?? scaleResult?.explanation) && (
        <div className="bg-slate-900 border border-slate-700 rounded-lg p-4">
          <p className="text-slate-300 text-sm leading-relaxed">
            {failureResult?.explanation ?? scaleResult?.explanation}
          </p>
        </div>
      )}

      {/* Scale Warnings (if present) */}
      {scaleResult?.warnings && scaleResult.warnings.length > 0 && (
        <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-lg p-4">
          <div className="flex items-center gap-2 text-yellow-400 mb-2">
            <span>⚠️</span>
            <span className="font-medium">Warnings</span>
          </div>
          <ul className="space-y-1 text-sm text-yellow-200">
            {scaleResult.warnings.map((warning) => (
              <li key={warning}>• {warning}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Demo Stop: Impact not computed */}
      {impactStop.show && (
        <DemoStopMessage
          type="Impact Analysis"
          stageName={getStageName(REQUIRED_STAGES.impact)}
          isDisabled={impactStop.isDisabled}
        />
      )}

      {/* Failure: Affected Callers Table */}
      {!impactStop.show &&
        failureResult?.affectedCallers &&
        failureResult.affectedCallers.length > 0 && (
          <div className="bg-slate-900 border border-slate-700 rounded-lg p-6">
            <h2 className="text-xl font-semibold text-white mb-4">
              Affected Callers ({failureResult.affectedCallers.length})
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left py-2 px-3 text-slate-400 font-medium">Service</th>
                    <th className="text-left py-2 px-3 text-slate-400 font-medium">Lost Traffic</th>
                    <th className="text-left py-2 px-3 text-slate-400 font-medium">Error Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {failureResult.affectedCallers.map((caller: FailureAffectedCaller, idx) => (
                    <tr
                      key={caller.serviceId ?? `caller-${idx}`}
                      className="border-b border-slate-800 hover:bg-slate-800/50"
                    >
                      <td className="py-3 px-3 text-white font-mono">
                        {caller.name ?? caller.serviceId ?? 'Unknown'}
                      </td>
                      <td className="py-3 px-3">
                        <span className="inline-block px-2 py-1 bg-red-900/30 text-red-400 text-xs rounded">
                          {formatOptionalRps(caller.lostTrafficRps)}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-slate-400 text-xs">
                        {formatOptionalPercent(caller.edgeErrorRate)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      {/* Scale: Affected Callers Table (with latency deltas) */}
      {!impactStop.show && isScaleResult && scaleCallers.length > 0 && (
        <div className="bg-slate-900 border border-slate-700 rounded-lg p-6">
          <h2 className="text-xl font-semibold text-white mb-4">
            Affected Callers ({scaleCallers.length})
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left py-2 px-3 text-slate-400 font-medium">Service</th>
                  <th className="text-left py-2 px-3 text-slate-400 font-medium">Before</th>
                  <th className="text-left py-2 px-3 text-slate-400 font-medium">After</th>
                  <th className="text-left py-2 px-3 text-slate-400 font-medium">Δ Latency</th>
                </tr>
              </thead>
              <tbody>
                {scaleCallers.map((caller: ScaleAffectedCaller, idx) => (
                  <tr
                    key={caller.serviceId ?? `scale-caller-${idx}`}
                    className="border-b border-slate-800 hover:bg-slate-800/50"
                  >
                    <td className="py-3 px-3 text-white font-mono">
                      {caller.name ?? caller.serviceId ?? 'Unknown'}
                    </td>
                    <td className="py-3 px-3 text-slate-300 text-xs">
                      {formatOptionalMs(caller.beforeMs)}
                    </td>
                    <td className="py-3 px-3 text-slate-300 text-xs">
                      {formatOptionalMs(caller.afterMs)}
                    </td>
                    <td className="py-3 px-3">
                      {caller.deltaMs === undefined ? (
                        '—'
                      ) : (
                        <span
                          className={`inline-block px-2 py-1 text-xs rounded ${getDeltaClasses(caller.deltaMs)}`}
                        >
                          {formatDelta(caller.deltaMs)}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Demo Stop: Paths not computed */}
      {pathsStop.show && (
        <DemoStopMessage
          type="Path Analysis"
          stageName={getStageName(REQUIRED_STAGES.paths)}
          isDisabled={pathsStop.isDisabled}
        />
      )}

      {/* Critical Paths (Failure) */}
      {!pathsStop.show &&
        failureResult?.criticalPathsToTarget &&
        failureResult.criticalPathsToTarget.length > 0 && (
          <div className="bg-slate-900 border border-slate-700 rounded-lg p-6">
            <h2 className="text-xl font-semibold text-white mb-4">
              Critical Paths ({failureResult.criticalPathsToTarget.length})
            </h2>
            <div className="space-y-3">
              {failureResult.criticalPathsToTarget.map((path: CriticalPath, pathIndex: number) => (
                <div
                  key={path.id ?? `path-${pathIndex}`}
                  className="bg-slate-800 border border-slate-600 rounded p-4"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-slate-400">Path {pathIndex + 1}</span>
                    {path.pathRps !== undefined && (
                      <span className="text-xs text-slate-500">{path.pathRps.toFixed(1)} RPS</span>
                    )}
                  </div>
                  {path.path && (
                    <div className="text-sm text-slate-300 font-mono">{path.path.join(' → ')}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

      {/* Affected Paths (Scale) */}
      {!pathsStop.show && scaleResult?.affectedPaths && scaleResult.affectedPaths.length > 0 && (
        <div className="bg-slate-900 border border-slate-700 rounded-lg p-6">
          <h2 className="text-xl font-semibold text-white mb-4">
            Affected Paths ({scaleResult.affectedPaths.length})
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left py-2 px-3 text-slate-400 font-medium">Path</th>
                  <th className="text-left py-2 px-3 text-slate-400 font-medium">Before</th>
                  <th className="text-left py-2 px-3 text-slate-400 font-medium">After</th>
                  <th className="text-left py-2 px-3 text-slate-400 font-medium">Δ Latency</th>
                </tr>
              </thead>
              <tbody>
                {scaleResult.affectedPaths.map((path: ScaleAffectedPath) => {
                  const pathKey = path.path?.join('-') ?? crypto.randomUUID()
                  return (
                    <tr key={pathKey} className="border-b border-slate-800 hover:bg-slate-800/50">
                      <td className="py-3 px-3 text-white font-mono text-xs">
                        {path.path?.join(' → ') ?? 'Unknown Path'}
                      </td>
                      <td className="py-3 px-3 text-slate-300 text-xs">
                        {formatOptionalMs(path.beforeMs)}
                      </td>
                      <td className="py-3 px-3 text-slate-300 text-xs">
                        {formatOptionalMs(path.afterMs)}
                      </td>
                      <td className="py-3 px-3">
                        {path.deltaMs === undefined ? (
                          '—'
                        ) : (
                          <span
                            className={`inline-block px-2 py-1 text-xs rounded ${getDeltaClasses(path.deltaMs)}`}
                          >
                            {formatDelta(path.deltaMs)}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Demo Stop: Recommendations not generated */}
      {recsStop.show && (
        <DemoStopMessage
          type="Recommendations"
          stageName={getStageName(REQUIRED_STAGES.recommendations)}
          isDisabled={recsStop.isDisabled}
        />
      )}

      {/* Recommendations */}
      {!recsStop.show && result.recommendations && result.recommendations.length > 0 && (
        <div className="bg-slate-900 border border-slate-700 rounded-lg p-6">
          <h2 className="text-xl font-semibold text-white mb-4">Recommendations</h2>
          <ul className="space-y-2">
            {result.recommendations.map((rec: Recommendation) => {
              const recKey = rec.description ?? crypto.randomUUID()
              return (
                <li key={recKey} className="flex items-start gap-3 text-slate-300">
                  <span className="text-green-400 mt-0.5">✓</span>
                  <div className="flex-1">
                    <span className="text-sm">{rec.description ?? JSON.stringify(rec)}</span>
                    {rec.priority && (
                      <span
                        className={`ml-2 inline-block px-2 py-0.5 text-xs rounded ${getPriorityClasses(rec.priority)}`}
                      >
                        {rec.priority}
                      </span>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {/* Raw Result (for debugging) */}
      <RawJsonPanel result={result} />
    </div>
  )
}
