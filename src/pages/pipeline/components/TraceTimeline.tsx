import type { PipelineTrace } from '../../../lib/types';
import type { StageStatus, StageState, StageId } from './StageControls';

export interface StageDisplayState {
  status: StageStatus;
  enabled: boolean;
}

interface TraceTimelineProps {
  readonly trace: PipelineTrace;
  readonly currentStageIndex?: number;
  readonly stageStates?: Record<StageId, StageState>;
  readonly stopAtIndex?: number | null;
}

function getStageClasses(status: StageStatus, isActive: boolean): string {
  const baseClasses = 'border rounded-lg p-4 transition-all duration-300';
  
  switch (status) {
    case 'done':
      return `${baseClasses} bg-green-900/10 border-green-700/50`;
    case 'running':
      return `${baseClasses} bg-blue-900/20 border-blue-500 ring-2 ring-blue-500/30`;
    case 'skipped':
      return `${baseClasses} bg-slate-800/50 border-slate-700 opacity-50`;
    case 'pending':
    default:
      return `${baseClasses} bg-slate-800 border-slate-600 ${isActive ? 'hover:border-slate-500' : ''}`;
  }
}

function getIndicatorClasses(status: StageStatus): string {
  switch (status) {
    case 'done':
      return 'bg-green-600 text-white';
    case 'running':
      return 'bg-blue-600 text-white animate-pulse';
    case 'skipped':
      return 'bg-slate-600 text-slate-400 line-through';
    case 'pending':
    default:
      return 'bg-slate-700 text-slate-300';
  }
}

function getStageIndicator(status: StageStatus, index: number): string {
  if (status === 'done') return '✓';
  if (status === 'skipped') return '—';
  return String(index + 1);
}

function normalizeStageKey(name: string): string {
  return name.toLowerCase().split(/\s+/).join('-');
}

export default function TraceTimeline({ 
  trace, 
  currentStageIndex = -1,
  stageStates,
  stopAtIndex,
}: TraceTimelineProps) {
  // Calculate total time only for non-skipped stages up to stop point
  const effectiveStopIndex = stopAtIndex ?? trace.stages.length - 1;
  const visibleStages = trace.stages.slice(0, effectiveStopIndex + 1);
  
  const totalTime = visibleStages.reduce((sum, stage) => {
    const stageKey = normalizeStageKey(stage.name) as StageId;
    const stageState = stageStates?.[stageKey];
    if (stageState?.status === 'skipped') return sum;
    return sum + stage.ms;
  }, 0);

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-white">Pipeline Trace</h2>
        <div className="flex items-center gap-4">
          {stopAtIndex != null && stopAtIndex < trace.stages.length - 1 && (
            <span className="text-xs text-yellow-400 bg-yellow-900/20 px-2 py-1 rounded">
              ⏸ Stopped at stage {stopAtIndex + 1}
            </span>
          )}
          <div className="text-sm text-slate-400">
            Total: <span className="text-white font-mono">{totalTime}ms</span>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {trace.stages.map((stage, idx) => {
          // Determine stage state
          const stageKey = normalizeStageKey(stage.name) as StageId;
          const stageState = stageStates?.[stageKey];
          const status: StageStatus = stageState?.status ?? (idx <= currentStageIndex ? 'done' : 'pending');
          const isHidden = stopAtIndex != null && idx > stopAtIndex;
          
          if (isHidden) return null;

          return (
            <div
              key={stage.name}
              className={getStageClasses(status, status === 'pending')}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-3">
                  <span className={`flex items-center justify-center w-8 h-8 text-sm font-bold rounded ${getIndicatorClasses(status)}`}>
                    {getStageIndicator(status, idx)}
                  </span>
                  <div>
                    <h3 className={`font-medium ${status === 'skipped' ? 'text-slate-500 line-through' : 'text-white'}`}>
                      {stage.name}
                    </h3>
                    {status === 'running' && (
                      <span className="text-xs text-blue-400">Processing...</span>
                    )}
                    {status === 'skipped' && (
                      <span className="text-xs text-yellow-400">Skipped (disabled)</span>
                    )}
                    {stage.warnings && stage.warnings.length > 0 && (
                      <div className="flex gap-1 mt-1">
                        {stage.warnings.map((warning) => (
                          <span
                            key={warning}
                            className="text-xs text-yellow-400 bg-yellow-900/20 px-2 py-0.5 rounded"
                          >
                            ⚠ {warning}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <span className={`text-sm font-mono ${status === 'skipped' ? 'text-slate-500' : 'text-slate-300'}`}>
                  {stage.ms}ms
                </span>
              </div>

              {status === 'done' && stage.summary && Object.keys(stage.summary).length > 0 && (
                <div className="mt-3 pl-11">
                  <details className="text-xs">
                    <summary className="text-slate-400 cursor-pointer hover:text-slate-300">
                      View summary
                    </summary>
                    <pre className="mt-2 bg-slate-950 border border-slate-700 rounded p-3 overflow-x-auto text-slate-300">
                      {JSON.stringify(stage.summary, null, 2)}
                    </pre>
                  </details>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 text-xs text-slate-500">
        Generated at: {new Date(trace.generatedAt).toLocaleString()}
      </div>
    </div>
  );
}
