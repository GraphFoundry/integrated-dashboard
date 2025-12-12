import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router'
import { Sparkles } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import KPIStatCard from '@/components/layout/KPIStatCard'
import Section from '@/components/layout/Section'
import EmptyState from '@/components/layout/EmptyState'
import ScenarioForm from '@/pages/pipeline/components/ScenarioForm'
import { simulateFailure, simulateScale } from '@/lib/api'
import { formatMs } from '@/lib/format'
import type {
  Scenario,
  FailureResponse,
  ScaleResponse,
  ScenarioType,
} from '@/lib/types'

export default function SimulationsRefactored() {
  const [searchParams] = useSearchParams()
  const [scenarioType, setScenarioType] = useState<ScenarioType>('failure')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<FailureResponse | ScaleResponse | null>(null)

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
  }, [])

  // Save result to localStorage when it changes
  useEffect(() => {
    if (result) {
      localStorage.setItem('simulationResult', JSON.stringify(result))
    }
  }, [result])

  useEffect(() => {
    if (prefillType && (prefillType === 'failure' || prefillType === 'scale')) {
      setScenarioType(prefillType)
    }
  }, [prefillType])

  const handleRun = async (scenario: Scenario) => {
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      let response: FailureResponse | ScaleResponse
      if (scenario.type === 'failure') {
        response = await simulateFailure({
          serviceId: scenario.serviceId,
          maxDepth: scenario.maxDepth,
        })
      } else {
        response = await simulateScale({
          serviceId: scenario.serviceId,
          currentPods: scenario.currentPods,
          newPods: scenario.newPods,
          latencyMetric: scenario.latencyMetric,
          maxDepth: scenario.maxDepth,
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
        <Section title="Impact Summary">
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
        <Section title="Dependency Neighborhood">
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
        <Section title="Impact Summary">
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

  return (
    <div className="p-8 space-y-6">
      <PageHeader title="Simulations" description="Predict failure and scaling impact" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Scenario Builder */}
        <div className="lg:col-span-1">
          <ScenarioForm
            onRun={handleRun}
            loading={loading}
            mode="live"
            scenarioType={scenarioType}
            onScenarioTypeChange={setScenarioType}
          />
        </div>

        {/* Results */}
        <div className="lg:col-span-2 space-y-6">
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
              {'affectedCallers' in result && result.affectedCallers
                ? renderFailureResults(result as FailureResponse)
                : renderScaleResults(result as ScaleResponse)}
            </>
          )}

          {!result && !loading && !error && (
            <EmptyState icon={<Sparkles className="w-12 h-12 text-slate-600" />} message="Configure a scenario and click Run to see predictions" />
          )}
        </div>
      </div>
    </div>
  )
}
