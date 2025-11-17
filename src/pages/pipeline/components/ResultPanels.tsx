import type { FailureResponse, ScaleResponse } from '@/lib/types'
import type { StageId } from '@/pages/pipeline/pipelineTypes'
import { PIPELINE_STAGES } from '@/pages/pipeline/pipelineTypes'

export interface DemoStopInfo {
  stopAtStage: StageId | null
  disabledStages: StageId[]
}

interface ResultPanelsProps {
  readonly result: FailureResponse | ScaleResponse
  readonly demoStopInfo?: DemoStopInfo
}

// Stages that must complete before certain results are available
const REQUIRED_STAGES: Record<string, StageId> = {
  impact: 'compute-impact',
  recommendations: 'recommendations',
  paths: 'path-analysis',
}

function isStageComplete(
  stageId: StageId,
  stopAtStage: StageId | null,
  disabledStages: StageId[]
): boolean {
  if (disabledStages.includes(stageId)) return false
  if (!stopAtStage) return true

  const stageOrder = PIPELINE_STAGES.map((s) => s.id)
  const stopIndex = stageOrder.indexOf(stopAtStage)
  const stageIndex = stageOrder.indexOf(stageId)
  return stageIndex <= stopIndex
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
  demoStopInfo?: DemoStopInfo
): { show: boolean; isDisabled: boolean } {
  if (!demoStopInfo) return { show: false, isDisabled: false }

  const { stopAtStage, disabledStages } = demoStopInfo

  if (disabledStages.includes(requiredStage)) {
    return { show: true, isDisabled: true }
  }

  if (stopAtStage && !isStageComplete(requiredStage, stopAtStage, disabledStages)) {
    return { show: true, isDisabled: false }
  }

  return { show: false, isDisabled: false }
}

export default function ResultPanels({ result, demoStopInfo }: ResultPanelsProps) {
  const hasFailureData = 'affectedCallers' in result
  const hasScaleData = 'affectedPaths' in result

  // Check what results should be hidden due to demo stop
  const impactStop = shouldShowStopMessage(REQUIRED_STAGES.impact, demoStopInfo)
  const pathsStop = shouldShowStopMessage(REQUIRED_STAGES.paths, demoStopInfo)
  const recsStop = shouldShowStopMessage(REQUIRED_STAGES.recommendations, demoStopInfo)

  return (
    <div className="space-y-6">
      {/* Demo Stop: Impact not computed */}
      {impactStop.show && (
        <DemoStopMessage
          type="Impact Analysis"
          stageName={getStageName(REQUIRED_STAGES.impact)}
          isDisabled={impactStop.isDisabled}
        />
      )}

      {/* Affected Services */}
      {!impactStop.show &&
        hasFailureData &&
        result.affectedCallers &&
        result.affectedCallers.length > 0 && (
          <div className="bg-slate-900 border border-slate-700 rounded-lg p-6">
            <h2 className="text-xl font-semibold text-white mb-4">
              Affected Callers ({result.affectedCallers.length})
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left py-2 px-3 text-slate-400 font-medium">Service</th>
                    <th className="text-left py-2 px-3 text-slate-400 font-medium">Impact</th>
                    <th className="text-left py-2 px-3 text-slate-400 font-medium">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {result.affectedCallers.map(
                    (caller: {
                      serviceId?: string
                      id?: string
                      impact?: string
                      reason?: string
                      description?: string
                    }) => (
                      <tr
                        key={caller.serviceId ?? caller.id ?? crypto.randomUUID()}
                        className="border-b border-slate-800 hover:bg-slate-800/50"
                      >
                        <td className="py-3 px-3 text-white font-mono">
                          {caller.serviceId ?? caller.id ?? 'Unknown'}
                        </td>
                        <td className="py-3 px-3">
                          <span className="inline-block px-2 py-1 bg-red-900/30 text-red-400 text-xs rounded">
                            {caller.impact ?? 'Direct'}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-slate-400 text-xs max-w-xs truncate">
                          {caller.reason ?? caller.description ?? '—'}
                        </td>
                      </tr>
                    )
                  )}
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
        hasFailureData &&
        result.criticalPathsToTarget &&
        result.criticalPathsToTarget.length > 0 && (
          <div className="bg-slate-900 border border-slate-700 rounded-lg p-6">
            <h2 className="text-xl font-semibold text-white mb-4">
              Critical Paths ({result.criticalPathsToTarget.length})
            </h2>
            <div className="space-y-3">
              {result.criticalPathsToTarget.map(
                (path: { id?: string; length?: number }, pathIndex: number) => (
                  <div
                    key={path.id ?? `path-${pathIndex}`}
                    className="bg-slate-800 border border-slate-600 rounded p-4"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs text-slate-400">Path {pathIndex + 1}</span>
                      {path.length != null && (
                        <span className="text-xs text-slate-500">({path.length} hops)</span>
                      )}
                    </div>
                    <pre className="text-xs text-slate-300 font-mono overflow-x-auto">
                      {JSON.stringify(path, null, 2)}
                    </pre>
                  </div>
                )
              )}
            </div>
          </div>
        )}

      {/* Affected Paths (Scale) */}
      {!pathsStop.show &&
        hasScaleData &&
        result.affectedPaths &&
        result.affectedPaths.length > 0 && (
          <div className="bg-slate-900 border border-slate-700 rounded-lg p-6">
            <h2 className="text-xl font-semibold text-white mb-4">
              Affected Paths ({result.affectedPaths.length})
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left py-2 px-3 text-slate-400 font-medium">Path</th>
                    <th className="text-left py-2 px-3 text-slate-400 font-medium">Metric</th>
                    <th className="text-left py-2 px-3 text-slate-400 font-medium">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {result.affectedPaths.map(
                    (
                      path: {
                        path?: string
                        id?: string
                        metric?: string
                        change?: string
                        impact?: string
                      },
                      pathIndex: number
                    ) => (
                      <tr
                        key={path.id ?? path.path ?? `affected-path-${pathIndex}`}
                        className="border-b border-slate-800 hover:bg-slate-800/50"
                      >
                        <td className="py-3 px-3 text-white font-mono text-xs">
                          {path.path ?? path.id ?? `Path ${pathIndex + 1}`}
                        </td>
                        <td className="py-3 px-3 text-slate-300 text-xs">{path.metric ?? '—'}</td>
                        <td className="py-3 px-3">
                          <span className="inline-block px-2 py-1 bg-blue-900/30 text-blue-400 text-xs rounded">
                            {path.change ?? path.impact ?? 'TBD'}
                          </span>
                        </td>
                      </tr>
                    )
                  )}
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
            {result.recommendations.map(
              (rec: string | { id?: string; text?: string }, recIndex: number) => {
                const recKey =
                  typeof rec === 'string' ? `rec-${recIndex}` : (rec.id ?? `rec-${recIndex}`)
                const recText = typeof rec === 'string' ? rec : (rec.text ?? JSON.stringify(rec))
                return (
                  <li key={recKey} className="flex items-start gap-3 text-slate-300">
                    <span className="text-green-400 mt-0.5">✓</span>
                    <span className="text-sm">{recText}</span>
                  </li>
                )
              }
            )}
          </ul>
        </div>
      )}

      {/* Raw Result (for debugging) */}
      <details className="bg-slate-900 border border-slate-700 rounded-lg p-6">
        <summary className="text-white font-semibold cursor-pointer hover:text-blue-400">
          Raw JSON Response
        </summary>
        <pre className="mt-4 bg-slate-950 border border-slate-700 rounded p-4 overflow-x-auto text-xs text-slate-300">
          {JSON.stringify(result, null, 2)}
        </pre>
      </details>
    </div>
  )
}
