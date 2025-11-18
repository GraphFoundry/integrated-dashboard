import { useMemo } from 'react'
import type { StageId, StageState, StageStatus } from '@/pages/pipeline/pipelineTypes'
import { PIPELINE_STAGES, resolveStopIndex } from '@/pages/pipeline/pipelineTypes'

// Re-export for components that import from this file
export type { StageId, StageState, StageStatus } from '@/pages/pipeline/pipelineTypes'
export { PIPELINE_STAGES } from '@/pages/pipeline/pipelineTypes'

interface StageControlsProps {
  readonly stages: StageState[]
  readonly onToggleStage: (stageId: StageId) => void
  readonly stopAtStage: StageId | null
  readonly onStopAtStageChange: (stageId: StageId | null) => void
  readonly scenarioType: 'failure' | 'scale'
  readonly isRunning: boolean
}

function getStatusClasses(status: StageStatus): string {
  switch (status) {
    case 'done':
      return 'bg-green-900/30 text-green-400'
    case 'running':
      return 'bg-blue-900/30 text-blue-400'
    case 'skipped':
      return 'bg-yellow-900/30 text-yellow-400'
    default:
      return 'bg-slate-700 text-slate-400'
  }
}

export default function StageControls({
  stages,
  onToggleStage,
  stopAtStage,
  onStopAtStageChange,
  scenarioType,
  isRunning,
}: StageControlsProps) {
  // Filter stages based on scenario type
  const availableStages = useMemo(() => {
    return PIPELINE_STAGES.filter((stage) => !stage.scaleOnly || scenarioType === 'scale')
  }, [scenarioType])

  const enabledStages = stages.filter((s) => s.enabled)

  // Compute resolved stop stage
  const stageStatesMap = useMemo(() => {
    return stages.reduce<Record<StageId, StageState>>(
      (acc, s) => {
        acc[s.id] = s
        return acc
      },
      {} as Record<StageId, StageState>
    )
  }, [stages])

  const resolvedStopIndex = useMemo(() => {
    return resolveStopIndex(stopAtStage, stageStatesMap)
  }, [stopAtStage, stageStatesMap])

  const resolvedStopStageId = useMemo(() => {
    if (resolvedStopIndex === null) return null
    return PIPELINE_STAGES[resolvedStopIndex]?.id ?? null
  }, [resolvedStopIndex])

  const isStopStageDisabled = stopAtStage && !stageStatesMap[stopAtStage]?.enabled
  const wasAutoResolved = isStopStageDisabled && resolvedStopStageId !== stopAtStage

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-4">
      <h3 className="text-lg font-semibold text-white mb-3">Stage Controls</h3>

      {/* Stage Toggles */}
      <div className="space-y-2 mb-4">
        <p className="text-xs text-slate-400 mb-2">Enable/disable stages for demo:</p>
        {availableStages.map((stage) => {
          const stageState = stages.find((s) => s.id === stage.id)
          const isEnabled = stageState?.enabled ?? true
          const status = stageState?.status ?? 'pending'

          return (
            <label
              key={stage.id}
              className={`flex items-center gap-2 p-2 rounded cursor-pointer transition-colors ${
                isEnabled ? 'bg-slate-800 hover:bg-slate-700' : 'bg-slate-850 opacity-60'
              }`}
            >
              <input
                type="checkbox"
                checked={isEnabled}
                onChange={() => onToggleStage(stage.id)}
                disabled={isRunning}
                className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-blue-600 focus:ring-blue-500 focus:ring-offset-slate-900"
              />
              <div className="flex-1 min-w-0">
                <span className="text-sm text-white">{stage.name}</span>
                {stage.scaleOnly && (
                  <span className="ml-2 text-xs text-blue-400">(scale only)</span>
                )}
              </div>
              <span className={`text-xs px-2 py-0.5 rounded ${getStatusClasses(status)}`}>
                {status}
              </span>
            </label>
          )
        })}
      </div>

      {/* Stop At Stage */}
      <div className="border-t border-slate-700 pt-4">
        <label htmlFor="stop-at-stage" className="block text-sm font-medium text-slate-300 mb-2">
          Stop at stage (presentation mode):
        </label>
        <select
          id="stop-at-stage"
          value={stopAtStage || ''}
          onChange={(e) => onStopAtStageChange(e.target.value ? (e.target.value as StageId) : null)}
          disabled={isRunning}
          className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Run all stages</option>
          {enabledStages.map((stage) => {
            const stageInfo = PIPELINE_STAGES.find((s) => s.id === stage.id)
            return (
              <option key={stage.id} value={stage.id}>
                Stop after: {stageInfo?.name}
              </option>
            )
          })}
        </select>
        {stopAtStage && (
          <div className="mt-2 space-y-1">
            {wasAutoResolved && resolvedStopStageId ? (
              <p className="text-xs text-orange-400">
                ⚠ Requested stage "{PIPELINE_STAGES.find((s) => s.id === stopAtStage)?.name}" is
                disabled. Will stop at: "
                {PIPELINE_STAGES.find((s) => s.id === resolvedStopStageId)?.name}"
              </p>
            ) : (
              <p className="text-xs text-yellow-400">
                ⚠ Demo will stop after "{PIPELINE_STAGES.find((s) => s.id === stopAtStage)?.name}"
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
