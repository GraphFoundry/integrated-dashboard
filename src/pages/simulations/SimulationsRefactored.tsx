import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router'
import { Sparkles, Activity, Network, Settings } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import KPIStatCard from '@/components/layout/KPIStatCard'
import Section from '@/components/layout/Section'
import EmptyState from '@/components/layout/EmptyState'

import ScenarioForm from '@/pages/pipeline/components/ScenarioForm'
import NodeResourceGraph from './NodeResourceGraph'
import { simulateFailure, simulateScale, simulateServiceAddition } from '@/lib/api'
import { formatMs } from '@/lib/format'
import type {
  Scenario,
  FailureResponse,
  ScaleResponse,
  ServiceAdditionResponse,
  ScenarioType,
} from '@/lib/types'

export default function SimulationsRefactored() {
  const [searchParams] = useSearchParams()
  const [scenarioType, setScenarioType] = useState<ScenarioType>('failure')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<
    FailureResponse | ScaleResponse | ServiceAdditionResponse | null
  >(null)
  const [lastScenario, setLastScenario] = useState<Scenario | null>(null)

  // Prefill from query params
  const prefillType = searchParams.get('type') as ScenarioType | null

  // Restore result from localStorage on mount
  useEffect(() => {
    const savedResult = localStorage.getItem('simulationResult')
    if (savedResult) {
      try {
        setResult(JSON.parse(savedResult))
      } catch (e) {
        console.error('Failed to parse saved simulation result', e)
      }
    }
    const savedScenario = localStorage.getItem('simulationScenario')
    if (savedScenario) {
      try {
        setLastScenario(JSON.parse(savedScenario))
      } catch (e) {
        console.error('Failed to parse saved simulation scenario', e)
      }
    }
  }, [])

  // Save result to localStorage when it changes
  useEffect(() => {
    if (result) {
      localStorage.setItem('simulationResult', JSON.stringify(result))
    }
    if (lastScenario) {
      localStorage.setItem('simulationScenario', JSON.stringify(lastScenario))
    }
  }, [result, lastScenario])

  useEffect(() => {
    if (prefillType && (prefillType === 'failure' || prefillType === 'scale')) {
      setScenarioType(prefillType)
    }
  }, [prefillType])

  const handleRun = async (scenario: Scenario) => {
    setLoading(true)
    setError(null)
    setResult(null)
    setLastScenario(scenario)

    try {
      let response: FailureResponse | ScaleResponse | ServiceAdditionResponse
      if (scenario.type === 'failure') {
        response = await simulateFailure({
          serviceId: scenario.serviceId,
          maxDepth: scenario.maxDepth,
          timeWindow: scenario.timeWindow,
        })
      } else if (scenario.type === 'scale') {
        response = await simulateScale({
          serviceId: scenario.serviceId,
          currentPods: scenario.currentPods,
          newPods: scenario.newPods,
          latencyMetric: scenario.latencyMetric,
          maxDepth: scenario.maxDepth,
          timeWindow: scenario.timeWindow,
        })
      } else {
        response = await simulateServiceAddition({
          serviceName: scenario.serviceName,
          minCpuCores: scenario.minCpuCores,
          minRamMB: scenario.minRamMB,
          replicas: scenario.replicas,
          dependencies: scenario.dependencies,
          maxDepth: scenario.maxDepth,
          timeWindow: scenario.timeWindow,
        })
      }
      setResult(response)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run simulation')
    } finally {
      setLoading(false)
    }
  }

  const getConfidenceBadge = (confidence?: string) => {
    if (!confidence) return null
    const colors: Record<string, string> = {
      high: 'bg-green-900/30 text-green-300 border-green-700',
      medium: 'bg-yellow-900/30 text-yellow-300 border-yellow-700',
      low: 'bg-red-900/30 text-red-300 border-red-700',
    }
    return (
      <span
        className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium border ${colors[confidence] || 'bg-slate-700 text-slate-300'}`}
      >
        {confidence}
      </span>
    )
  }

  const renderFailureResults = (failureResult: FailureResponse) => {
    const affectedCallersCount = failureResult.affectedCallers?.length ?? 0
    const affectedDownstreamCount = failureResult.affectedDownstream?.length ?? 0
    const unreachableCount = failureResult.unreachableServices?.length ?? 0

    return (
      <>
        {/* Impact Summary */}
        <Section title="Impact Summary" icon={Activity}>
          <div className="mb-6 p-4 bg-slate-900 rounded-lg border border-slate-700">
            <p className="text-lg text-white leading-relaxed">
              If <span className="font-semibold">{failureResult.target?.name}</span> fails:
            </p>
            <ul className="mt-3 space-y-2 text-slate-300">
              <li>
                • <span className="font-semibold">{affectedDownstreamCount}</span> downstream
                service{affectedDownstreamCount === 1 ? '' : 's'} impacted
              </li>
              <li>
                • <span className="font-semibold">{affectedCallersCount}</span> upstream caller
                {affectedCallersCount === 1 ? '' : 's'} affected
              </li>
              {unreachableCount > 0 && (
                <li>
                  • <span className="font-semibold">{unreachableCount}</span> service
                  {unreachableCount === 1 ? '' : 's'} unreachable
                </li>
              )}
              <li className="flex items-center gap-2">
                • Confidence: {getConfidenceBadge(failureResult.confidence)}
              </li>
            </ul>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <KPIStatCard
              label="Affected Downstream"
              value={affectedDownstreamCount}
              variant={affectedDownstreamCount > 0 ? 'danger' : 'success'}
            />
            <KPIStatCard
              label="Affected Callers"
              value={affectedCallersCount}
              variant={affectedCallersCount > 0 ? 'warning' : 'success'}
            />
            <KPIStatCard
              label="Unreachable Services"
              value={unreachableCount}
              variant={unreachableCount > 0 ? 'danger' : 'success'}
            />
          </div>
        </Section>

        {/* Dependency Neighborhood */}
        <Section title="Dependency Neighborhood" icon={Network}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Upstream Callers */}
            <div>
              <h3 className="text-sm font-semibold text-slate-300 mb-3">
                Upstream Callers ({affectedCallersCount})
              </h3>
              {affectedCallersCount === 0 ? (
                <p className="text-sm text-slate-500">No upstream callers affected</p>
              ) : (
                <div className="space-y-2">
                  {failureResult.affectedCallers?.map((caller, idx) => (
                    <div
                      key={`caller-${caller.namespace}-${caller.name}-${idx}`}
                      className="p-3 bg-slate-900 rounded border border-yellow-700/30"
                    >
                      <div className="font-medium text-white">{caller.name}</div>
                      <div className="text-xs text-slate-400">{caller.namespace}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Downstream Dependencies */}
            <div>
              <h3 className="text-sm font-semibold text-slate-300 mb-3">
                Downstream Impacted ({affectedDownstreamCount})
              </h3>
              {affectedDownstreamCount === 0 ? (
                <p className="text-sm text-slate-500">No downstream services impacted</p>
              ) : (
                <div className="space-y-2">
                  {failureResult.affectedDownstream?.map((downstream, idx) => (
                    <div
                      key={`downstream-${downstream.namespace}-${downstream.name}-${idx}`}
                      className="p-3 bg-slate-900 rounded border border-red-700/30"
                    >
                      <div className="font-medium text-white">{downstream.name}</div>
                      <div className="text-xs text-slate-400">{downstream.namespace}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Section>
      </>
    )
  }

  const renderScaleResults = (scaleResult: ScaleResponse) => {
    const latency = scaleResult.latencyEstimate
    const affectedCallersData =
      'items' in (scaleResult.affectedCallers ?? {})
        ? ((scaleResult.affectedCallers as { items?: unknown[] }).items ?? [])
        : ((scaleResult.affectedCallers as unknown[]) ?? [])
    const affectedCallersCount = affectedCallersData.length

    return (
      <>
        {/* Impact Summary */}
        <Section title="Impact Summary" icon={Activity}>
          <div className="mb-6 p-4 bg-slate-900 rounded-lg border border-slate-700">
            <p className="text-lg text-white leading-relaxed">
              Scaling <span className="font-semibold">{scaleResult.target?.name}</span> from{' '}
              <span className="font-semibold">{scaleResult.target?.name}</span>:
            </p>
            <ul className="mt-3 space-y-2 text-slate-300">
              {latency && (
                <>
                  <li>
                    • Baseline latency:{' '}
                    <span className="font-semibold">{formatMs(latency.baselineMs ?? 0)}</span>
                  </li>
                  <li>
                    • Projected latency:{' '}
                    <span className="font-semibold">{formatMs(latency.projectedMs ?? 0)}</span>
                  </li>
                  <li>
                    • Delta:{' '}
                    <span
                      className={`font-semibold ${(latency.deltaMs ?? 0) < 0 ? 'text-green-400' : 'text-red-400'}`}
                    >
                      {(latency.deltaMs ?? 0) < 0 ? '' : '+'}
                      {formatMs(latency.deltaMs ?? 0)}
                    </span>
                  </li>
                </>
              )}
              <li>
                • Affected callers: <span className="font-semibold">{affectedCallersCount}</span>
              </li>
            </ul>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {latency && (
              <>
                <KPIStatCard
                  label="Baseline Latency"
                  value={formatMs(latency.baselineMs ?? 0)}
                  variant="default"
                />
                <KPIStatCard
                  label="Projected Latency"
                  value={formatMs(latency.projectedMs ?? 0)}
                  variant={(latency.deltaMs ?? 0) < 0 ? 'success' : 'warning'}
                />
                <KPIStatCard
                  label="Delta"
                  value={`${(latency.deltaMs ?? 0) < 0 ? '' : '+'}${formatMs(latency.deltaMs ?? 0)}`}
                  variant={(latency.deltaMs ?? 0) < 0 ? 'success' : 'warning'}
                />
              </>
            )}
          </div>
        </Section>
      </>
    )
  }

  const renderServiceAdditionResults = (additionResult: ServiceAdditionResponse) => {
    return (
      <Section title="Placement Analysis" icon={Activity}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div className="lg:col-span-2 space-y-4">
            <h3 className="text-sm font-semibold text-slate-300">Target Node Suitability</h3>
            <div className="space-y-3">
              {additionResult.suitableNodes.map((node) => (
                <div
                  key={node.nodeName}
                  className={`p-4 rounded border ${node.suitable ? 'bg-green-900/20 border-green-700/50' : 'bg-red-900/20 border-red-700/50'}`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-white">{node.nodeName}</span>
                      {node.suitable ? (
                        <span className="text-xs bg-green-900 text-green-300 px-2 py-0.5 rounded">
                          Suitable
                        </span>
                      ) : (
                        <span className="text-xs bg-red-900 text-red-300 px-2 py-0.5 rounded">
                          Unsuitable
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400">Score: {node.score}/100</div>
                  </div>
                  {!node.suitable && <div className="text-xs text-red-400 mb-2">{node.reason}</div>}
                  <div className="grid grid-cols-2 gap-4 text-xs text-slate-400">
                    <div>
                      Available CPU: <span className="text-white">{node.availableCpu} cores</span>
                    </div>
                    <div>
                      Available RAM: <span className="text-white">{node.availableRam} MB</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-300">Risk & Recommendations</h3>
            <div className="p-4 bg-slate-800 rounded border border-slate-700">
              <div className="mb-4">
                <div className="text-xs text-slate-500 mb-1">Dependency Risk</div>
                <div
                  className={`text-sm font-medium ${additionResult.riskAnalysis.dependencyRisk === 'low'
                    ? 'text-green-400'
                    : additionResult.riskAnalysis.dependencyRisk === 'medium'
                      ? 'text-yellow-400'
                      : 'text-red-400'
                    }`}
                >
                  {additionResult.riskAnalysis.dependencyRisk.toUpperCase()}
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  {additionResult.riskAnalysis.description}
                </p>
              </div>

              {additionResult.recommendations && additionResult.recommendations.length > 0 && (
                <div>
                  <div className="text-xs text-slate-500 mb-1">Recommendation</div>
                  <ul className="space-y-2">
                    {additionResult.recommendations.map((rec, i) => (
                      <li key={i} className="text-xs text-white">
                        • {rec.description}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      </Section>
    )
  }

  // Construct simulated service object if applicable
  const getSimulatedService = () => {
    if (
      result &&
      'targetServiceName' in result &&
      lastScenario &&
      lastScenario.type === 'add-service'
    ) {
      const bestNode = (result as ServiceAdditionResponse).suitableNodes.find((n) => n.suitable)
      if (!bestNode) return null

      return {
        name: lastScenario.serviceName,
        namespace: 'default', // Assumption for now
        nodeName: bestNode.nodeName,
        cpuRequest: lastScenario.minCpuCores,
        ramRequest: lastScenario.minRamMB,
        replicas: lastScenario.replicas,
      }
    }
    return null
  }

  const simulatedService = getSimulatedService()

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="Simulations"
        description="Predict failure and scaling impact"
        icon={Sparkles}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Scenario Builder */}
        <div className="lg:col-span-1">
          <Section title="Scenario Configuration" icon={Settings}>
            <ScenarioForm
              onRun={handleRun}
              loading={loading}
              mode="live"
              scenarioType={scenarioType}
              onScenarioTypeChange={setScenarioType}
            />
          </Section>
        </div>

        <div className="lg:col-span-2">
          {/* Infrastructure Overview */}
          <Section title="Infrastructure Overview" icon={Network}>
            <NodeResourceGraph simulatedService={simulatedService} />
          </Section>
        </div>
      </div>

      {/* Results */}
      <div className="space-y-6">
        {error && (
          <div className="bg-red-900/20 border border-red-700 rounded-lg p-4">
            <p className="text-red-300">{error}</p>
          </div>
        )}

        {loading && (
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-12 text-center">
            <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-slate-400">Running simulation...</p>
          </div>
        )}

        {result && !loading && (
          <>
            {'targetServiceName' in result
              ? renderServiceAdditionResults(result as ServiceAdditionResponse)
              : 'affectedCallers' in result
                ? renderFailureResults(result as FailureResponse)
                : renderScaleResults(result as ScaleResponse)}
          </>
        )}

        {!result && !loading && !error && (
          <EmptyState
            icon={<Sparkles className="w-12 h-12 text-slate-600" />}
            message="Configure a scenario and click Run to see predictions"
          />
        )}
      </div>
    </div>
  )
}
