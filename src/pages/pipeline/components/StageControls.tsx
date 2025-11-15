import { useMemo } from 'react';

export type StageId = 
  | 'scenario-parse'
  | 'staleness-check'
  | 'fetch-neighborhood'
  | 'build-snapshot'
  | 'apply-scaling-model'
  | 'path-analysis'
  | 'compute-impact'
  | 'recommendations';

interface PipelineStageDefinition {
  id: StageId;
  name: string;
  description: string;
  scaleOnly: boolean;
}

// Standard pipeline stages in execution order
export const PIPELINE_STAGES: readonly PipelineStageDefinition[] = [
  { id: 'scenario-parse', name: 'Scenario Parse', description: 'Validate and parse input parameters', scaleOnly: false },
  { id: 'staleness-check', name: 'Staleness Check', description: 'Check graph data freshness', scaleOnly: false },
  { id: 'fetch-neighborhood', name: 'Fetch Neighborhood', description: 'Retrieve service topology from Graph Engine', scaleOnly: false },
  { id: 'build-snapshot', name: 'Build Snapshot', description: 'Construct graph snapshot for analysis', scaleOnly: false },
  { id: 'apply-scaling-model', name: 'Apply Scaling Model', description: 'Calculate scaling impact (scale scenarios only)', scaleOnly: true },
  { id: 'path-analysis', name: 'Path Analysis', description: 'Analyze critical paths and dependencies', scaleOnly: false },
  { id: 'compute-impact', name: 'Compute Impact', description: 'Calculate affected services and impact metrics', scaleOnly: false },
  { id: 'recommendations', name: 'Recommendations', description: 'Generate actionable recommendations', scaleOnly: false },
];

export type StageStatus = 'pending' | 'running' | 'done' | 'skipped';

export interface StageState {
  id: StageId;
  enabled: boolean;
  status: StageStatus;
}

interface StageControlsProps {
  readonly stages: StageState[];
  readonly onToggleStage: (stageId: StageId) => void;
  readonly stopAtStage: StageId | null;
  readonly onStopAtStageChange: (stageId: StageId | null) => void;
  readonly scenarioType: 'failure' | 'scale';
  readonly isRunning: boolean;
}

function getStatusClasses(status: StageStatus): string {
  switch (status) {
    case 'done': return 'bg-green-900/30 text-green-400';
    case 'running': return 'bg-blue-900/30 text-blue-400';
    case 'skipped': return 'bg-yellow-900/30 text-yellow-400';
    default: return 'bg-slate-700 text-slate-400';
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
    return PIPELINE_STAGES.filter(
      (stage) => !stage.scaleOnly || scenarioType === 'scale'
    );
  }, [scenarioType]);

  const enabledStages = stages.filter((s) => s.enabled);

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-4">
      <h3 className="text-lg font-semibold text-white mb-3">Stage Controls</h3>

      {/* Stage Toggles */}
      <div className="space-y-2 mb-4">
        <p className="text-xs text-slate-400 mb-2">Enable/disable stages for demo:</p>
        {availableStages.map((stage) => {
          const stageState = stages.find((s) => s.id === stage.id);
          const isEnabled = stageState?.enabled ?? true;
          const status = stageState?.status ?? 'pending';

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
              <span
                className={`text-xs px-2 py-0.5 rounded ${getStatusClasses(status)}`}
              >
                {status}
              </span>
            </label>
          );
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
          onChange={(e) =>
            onStopAtStageChange(e.target.value ? (e.target.value as StageId) : null)
          }
          disabled={isRunning}
          className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Run all stages</option>
          {enabledStages.map((stage) => {
            const stageInfo = PIPELINE_STAGES.find((s) => s.id === stage.id);
            return (
              <option key={stage.id} value={stage.id}>
                Stop after: {stageInfo?.name}
              </option>
            );
          })}
        </select>
        {stopAtStage && (
          <p className="text-xs text-yellow-400 mt-1">
            ⚠ Demo will stop after "{PIPELINE_STAGES.find((s) => s.id === stopAtStage)?.name}"
          </p>
        )}
      </div>
    </div>
  );
}
