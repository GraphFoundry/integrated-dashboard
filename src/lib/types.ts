export type PipelineTraceStage = {
  name: string;
  ms: number;
  summary?: Record<string, any>;
  warnings?: string[];
};

export type PipelineTrace = {
  options: {
    trace: boolean;
    includeSnapshot?: boolean;
    includeRawPaths?: boolean;
    includeEdgeDetails?: boolean;
  };
  stages: PipelineTraceStage[];
  generatedAt: string;
};

export type FailureResponse = {
  pipelineTrace?: PipelineTrace;
  correlationId?: string;
  target?: any;
  affectedCallers?: any[];
  criticalPathsToTarget?: any[];
  recommendations?: any[];
  [k: string]: any;
};

export type ScaleResponse = {
  pipelineTrace?: PipelineTrace;
  correlationId?: string;
  target?: any;
  affectedPaths?: any[];
  recommendations?: any[];
  [k: string]: any;
};

export type ScenarioType = 'failure' | 'scale';

export type FailureScenario = {
  type: 'failure';
  serviceId: string;
  maxDepth: number;
};

export type ScaleScenario = {
  type: 'scale';
  serviceId: string;
  currentPods: number;
  newPods: number;
  latencyMetric: 'p50' | 'p95' | 'p99';
  maxDepth: number;
};

export type Scenario = FailureScenario | ScaleScenario;
