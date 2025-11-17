/**
 * Central type definitions for Pipeline Playground
 * Single source of truth for stage identifiers, states, and definitions
 */

export type StageId =
  | 'scenario-parse'
  | 'staleness-check'
  | 'fetch-neighborhood'
  | 'build-snapshot'
  | 'apply-scaling-model'
  | 'path-analysis'
  | 'compute-impact'
  | 'recommendations';

export type StageStatus = 'pending' | 'running' | 'done' | 'skipped';

export interface PipelineStageDefinition {
  id: StageId;
  name: string;
  description: string;
  scaleOnly: boolean;
}

export interface StageState {
  id: StageId;
  enabled: boolean;
  status: StageStatus;
}

// Standard pipeline stages in execution order
export const PIPELINE_STAGES: readonly PipelineStageDefinition[] = [
  {
    id: 'scenario-parse',
    name: 'Scenario Parse',
    description: 'Validate and parse input parameters',
    scaleOnly: false,
  },
  {
    id: 'staleness-check',
    name: 'Staleness Check',
    description: 'Check graph data freshness',
    scaleOnly: false,
  },
  {
    id: 'fetch-neighborhood',
    name: 'Fetch Neighborhood',
    description: 'Retrieve service topology from Graph Engine',
    scaleOnly: false,
  },
  {
    id: 'build-snapshot',
    name: 'Build Snapshot',
    description: 'Construct graph snapshot for analysis',
    scaleOnly: false,
  },
  {
    id: 'apply-scaling-model',
    name: 'Apply Scaling Model',
    description: 'Calculate scaling impact (scale scenarios only)',
    scaleOnly: true,
  },
  {
    id: 'path-analysis',
    name: 'Path Analysis',
    description: 'Analyze critical paths and dependencies',
    scaleOnly: false,
  },
  {
    id: 'compute-impact',
    name: 'Compute Impact',
    description: 'Calculate affected services and impact metrics',
    scaleOnly: false,
  },
  {
    id: 'recommendations',
    name: 'Recommendations',
    description: 'Generate actionable recommendations',
    scaleOnly: false,
  },
];
