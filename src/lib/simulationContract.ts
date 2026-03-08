export const SIMULATION_SCHEMA_VERSION = 'v1' as const

export type SimulationScenarioType =
  | 'failure_shutdown'
  | 'scaling'
  | 'traffic_spike'
  | 'chatty_colocation'
  | 'network_cut'

export type SimulationEvidenceSourceLabel =
  | 'live_service_graph'
  | 'live_k8s_runtime'
  | 'historical_influxdb'
  | 'deterministic_fallback'

export type SimulationEvidenceMode = 'FULL' | 'PARTIAL' | 'DEGRADED' | 'FALLBACK'

export type SimulationConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW'

export type SimulationDegradedMode = '' | 'INFLUX_EMPTY' | 'INFLUX_SPARSE' | 'INFLUX_ERROR'

export type SimulationResultStatus = 'OK' | 'DEFERRED' | 'UNSUPPORTED'

export type SimulationAssumptionType =
  | 'MODEL_CONSTANT'
  | 'FORMULA'
  | 'EVIDENCE_BINDING'
  | 'CLASSIFICATION'

export interface FailureShutdownParamsDto {
  targetServiceId: string
  maxDepth?: number
}

export interface ScalingParamsDto {
  targetServiceId: string
  currentPods: number
  newPods: number
  latencyMetric?: string
}

export interface TrafficSpikeParamsDto {
  targetServiceId: string
  loadMultiplier: number
}

export interface ChattyColocationParamsDto {
  sourceServiceId: string
  targetServiceId: string
}

export interface NetworkLinkDto {
  sourceServiceId: string
  targetServiceId: string
}

export interface NetworkCutParamsDto {
  affectedLinks: NetworkLinkDto[]
  degradationPercent?: number
}

export interface SimulationRunRequestDto {
  version: typeof SIMULATION_SCHEMA_VERSION
  scenarioType: SimulationScenarioType
  snapshotTimestamp: string
  snapshotHash?: string
  failureShutdownParams?: FailureShutdownParamsDto
  scalingParams?: ScalingParamsDto
  trafficSpikeParams?: TrafficSpikeParamsDto
  chattyColocationParams?: ChattyColocationParamsDto
  networkCutParams?: NetworkCutParamsDto
}

export interface SimulationValidationErrorDto {
  code: string
  message: string
}

export interface SimulationAssumptionDto {
  key: string
  type: SimulationAssumptionType
  value: string
  description: string
  source: string
  traceRef: string
}

export interface ImpactedServiceDto {
  serviceId: string
  name: string
  namespace: string
  role: string
}

export interface ImpactedPathDto {
  path: string[]
}

export interface BeforeAfterValueDto {
  fieldRef: string
  traceRef: string
  description: string
  unit?: string
  beforeValue?: number
  afterValue?: number
  deltaValue?: number
}

export interface SimulationRecommendationDto {
  action: string
  explanation: string
  evidenceSourceRefs: string[]
}

export interface SimulationRunResponseDto {
  version: typeof SIMULATION_SCHEMA_VERSION
  scenarioType: SimulationScenarioType
  snapshotTimestamp: string
  snapshotHash?: string
  resultStatus: SimulationResultStatus
  deferredReason?: string
  evidenceSources: SimulationEvidenceSourceLabel[]
  evidenceMode: SimulationEvidenceMode
  degradedMode?: SimulationDegradedMode
  degradedModeReason?: string
  confidenceLevel: SimulationConfidenceLevel
  assumptions: SimulationAssumptionDto[]
  impactedServices: ImpactedServiceDto[]
  impactedPaths: ImpactedPathDto[]
  beforeAfterValues: BeforeAfterValueDto[]
  recommendation: SimulationRecommendationDto
}

export interface SimulationErrorResponseDto {
  code?: string
  error?: string
  reason?: string
  resultStatus?: SimulationResultStatus
  deferredReason?: string
  errors?: SimulationValidationErrorDto[]
  [key: string]: unknown
}
