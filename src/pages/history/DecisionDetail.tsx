import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router'
import { ArrowLeft, CheckCircle, AlertTriangle, Clock } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import Section from '@/components/layout/Section'
import { getDecisionHistory } from '@/lib/api'
import { formatDate, formatRps, formatMs } from '@/lib/format'
import type { DecisionRecord, Recommendation, PipelineTrace } from '@/lib/types'

const getScenarioSummary = (item: DecisionRecord): string => {
  const { type, scenario, result } = item

  if (type === 'failure') {
    const callers = result.affectedCallers as unknown[] | undefined
    const downstream = result.affectedDownstream as unknown[] | undefined
    const affectedCount = (callers?.length ?? 0) + (downstream?.length ?? 0)
    const serviceId = scenario.serviceId as string | undefined
    return `If ${serviceId} fails, ${affectedCount} service${affectedCount === 1 ? '' : 's'} would be affected`
  }
  const currentPods = scenario.currentPods as number | undefined
  const newPods = scenario.newPods as number | undefined
  const delta = (newPods ?? 0) - (currentPods ?? 0)
  const direction = delta > 0 ? 'up' : 'down'
  const serviceId = scenario.serviceId as string | undefined
  return `Scaling ${serviceId} ${direction} from ${currentPods} to ${newPods} pods`
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

export default function DecisionDetail() {
  const { id } = useParams<{ id: string }>()
  const [decision, setDecision] = useState<DecisionRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showRawJson, setShowRawJson] = useState(false)

  useEffect(() => {
    const loadDecision = async () => {
      if (!id) return

      try {
        setLoading(true)
        const response = await getDecisionHistory({ limit: 1000, offset: 0 })
        const found = response.decisions.find((item) => item.id.toString() === id)
        if (found) {
          setDecision(found)
        } else {
          setError('Decision not found')
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load decision')
      } finally {
        setLoading(false)
      }
    }

    loadDecision()
  }, [id])

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto" />
      </div>
    )
  }

  if (error || !decision) {
    return (
      <div className="p-8">
        <PageHeader title="Decision Not Found" />
        <div className="bg-red-900/20 border border-red-700 rounded-lg p-4 mt-6">
          <p className="text-red-300">{error || 'Decision not found'}</p>
        </div>
        <Link
          to="/history"
          className="inline-flex items-center gap-2 mt-4 text-blue-400 hover:text-blue-300"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to History
        </Link>
      </div>
    )
  }

  const summary = getScenarioSummary(decision)
  const confidence = decision.result.confidence as string | undefined
  const recommendations = (decision.result.recommendations as Recommendation[]) ?? []
  const affectedCallers = (decision.result.affectedCallers as unknown[]) ?? []
  const affectedDownstream = (decision.result.affectedDownstream as unknown[]) ?? []
  const latencyEstimate = decision.result.latencyEstimate as Record<string, unknown> | undefined
  const pipelineTrace = decision.result.pipelineTrace as PipelineTrace | undefined

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/history" className="text-slate-400 hover:text-white transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <PageHeader
          title="Decision Details"
          description={formatDate(new Date(decision.timestamp))}
        />
      </div>

      {/* Summary */}
      <Section title="Summary">
        <div className="p-4 bg-slate-900 rounded-lg border border-slate-700">
          <p className="text-lg text-white leading-relaxed">{summary}</p>
          {confidence && (
            <div className="flex items-center gap-2 mt-3">
              <span className="text-sm text-slate-400">Confidence:</span>
              {getConfidenceBadge(confidence)}
            </div>
          )}
        </div>
      </Section>

      {/* Configuration Audit (Inputs) */}
      <Section
        title="Configuration Audit"
        description="System state inputs used for this simulation"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 bg-slate-900 rounded-lg border border-slate-800">
            <div className="text-xs text-slate-500 uppercase mb-1">Scenario Type</div>
            <div className="text-white font-medium capitalize">{decision.type}</div>
          </div>
          <div className="p-4 bg-slate-900 rounded-lg border border-slate-800">
            <div className="text-xs text-slate-500 uppercase mb-1">Target Service</div>
            <div className="text-white font-medium">{decision.scenario.serviceId as string}</div>
          </div>
          {(decision.type === 'scale' || decision.type === 'scaling') && (
            <>
              <div className="p-4 bg-slate-900 rounded-lg border border-slate-800">
                <div className="text-xs text-slate-500 uppercase mb-1">Current Pods</div>
                <div className="text-white font-medium">
                  {decision.scenario.currentPods as number}
                </div>
              </div>
              <div className="p-4 bg-slate-900 rounded-lg border border-slate-800">
                <div className="text-xs text-slate-500 uppercase mb-1">Target Pods</div>
                <div className="text-white font-medium">{decision.scenario.newPods as number}</div>
              </div>
            </>
          )}
          <div className="p-4 bg-slate-900 rounded-lg border border-slate-800">
            <div className="text-xs text-slate-500 uppercase mb-1">Simulation Depth</div>
            <div className="text-white font-medium">
              {(decision.scenario.maxDepth as number) ?? 'N/A'} hops
            </div>
          </div>
        </div>
      </Section>

      {/* Evidence Chain (Pipeline Trace) */}
      {pipelineTrace && (
        <Section title="Evidence Chain" description="Steps executed to reach this conclusion">
          <div className="space-y-4">
            {pipelineTrace.stages.map((stage, idx) => (
              <div
                key={idx}
                className="relative pl-6 pb-4 border-l border-slate-700 last:pb-0 last:border-0"
              >
                <div className="absolute left-[-5px] top-0 w-2.5 h-2.5 rounded-full bg-blue-500 ring-4 ring-slate-900" />
                <div className="bg-slate-900 p-3 rounded border border-slate-700">
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-sm font-medium text-white">{stage.name}</span>
                    <span className="text-xs text-slate-500 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatMs(stage.ms)}
                    </span>
                  </div>
                  {stage.warnings && stage.warnings.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {stage.warnings.map((w, wIdx) => (
                        <div
                          key={wIdx}
                          className="flex items-start gap-2 text-xs text-yellow-400 bg-yellow-900/10 p-1.5 rounded"
                        >
                          <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                          <span>{w}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Affected Services */}
      {decision.type === 'failure' && (
        <Section title="Impact Analysis">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Upstream Callers */}
            <div>
              <h3 className="text-sm font-semibold text-slate-300 mb-3">
                Upstream Callers ({affectedCallers.length})
              </h3>
              {affectedCallers.length === 0 ? (
                <div className="p-8 text-center bg-slate-900 rounded border border-slate-800 border-dashed">
                  <CheckCircle className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                  <p className="text-sm text-slate-500">No upstream callers affected</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {affectedCallers.map((caller: unknown, idx: number) => {
                    const c = caller as Record<string, unknown>
                    return (
                      <div
                        key={`caller-${c.namespace}-${c.name}-${idx}`}
                        className="p-3 bg-slate-900 rounded border border-yellow-700/30"
                      >
                        <div className="font-medium text-white">{c.name as string}</div>
                        <div className="text-xs text-slate-400">{c.namespace as string}</div>
                        {c.lostTrafficRps !== undefined && (
                          <div className="text-sm text-yellow-300 mt-1">
                            Lost: {formatRps(c.lostTrafficRps as number)} RPS
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Downstream Dependencies */}
            <div>
              <h3 className="text-sm font-semibold text-slate-300 mb-3">
                Downstream Impacted ({affectedDownstream.length})
              </h3>
              {affectedDownstream.length === 0 ? (
                <div className="p-8 text-center bg-slate-900 rounded border border-slate-800 border-dashed">
                  <CheckCircle className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                  <p className="text-sm text-slate-500">No downstream services impacted</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {affectedDownstream.map((downstream: unknown, idx: number) => {
                    const d = downstream as Record<string, unknown>
                    return (
                      <div
                        key={`downstream-${d.namespace}-${d.name}-${idx}`}
                        className="p-3 bg-slate-900 rounded border border-red-700/30"
                      >
                        <div className="font-medium text-white">{d.name as string}</div>
                        <div className="text-xs text-slate-400">{d.namespace as string}</div>
                        {d.lostTrafficRps !== undefined && (
                          <div className="text-sm text-red-300 mt-1">
                            Lost: {formatRps(d.lostTrafficRps as number)} RPS
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </Section>
      )}

      {/* Latency Impact (Scaling) */}
      {(decision.type === 'scale' || decision.type === 'scaling') && latencyEstimate && (
        <Section title="Latency Impact">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-slate-900 rounded-lg">
              <div className="text-xs text-slate-500 uppercase mb-1">Baseline</div>
              <div className="text-white text-xl font-semibold">
                {formatMs((latencyEstimate.baselineMs as number) ?? 0)}
              </div>
            </div>
            <div className="p-4 bg-slate-900 rounded-lg">
              <div className="text-xs text-slate-500 uppercase mb-1">Projected</div>
              <div className="text-white text-xl font-semibold">
                {formatMs((latencyEstimate.projectedMs as number) ?? 0)}
              </div>
            </div>
            <div className="p-4 bg-slate-900 rounded-lg">
              <div className="text-xs text-slate-500 uppercase mb-1">Delta</div>
              <div
                className={`text-xl font-semibold ${((latencyEstimate.deltaMs as number) ?? 0) < 0 ? 'text-green-400' : 'text-red-400'}`}
              >
                {((latencyEstimate.deltaMs as number) ?? 0) < 0 ? '' : '+'}
                {formatMs((latencyEstimate.deltaMs as number) ?? 0)}
              </div>
            </div>
          </div>
        </Section>
      )}

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <Section
          title="Recommendations"
          description="AI-generated action items based on simulation results"
        >
          <div className="space-y-3">
            {recommendations.map((rec, idx) => {
              const priorityClass = (() => {
                if (rec.priority === 'high') return 'bg-red-900/30 text-red-300'
                if (rec.priority === 'medium') return 'bg-yellow-900/30 text-yellow-300'
                return 'bg-blue-900/30 text-blue-300'
              })()

              return (
                <div
                  key={`rec-${rec.description}-${idx}`}
                  className="p-4 bg-slate-900 rounded-lg border border-slate-700"
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${priorityClass}`}
                    >
                      {rec.priority || 'info'}
                    </span>
                    <p className="text-sm text-slate-300 flex-1">{rec.description}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </Section>
      )}

      {/* Advanced Details */}
      <Section>
        <button
          onClick={() => setShowRawJson(!showRawJson)}
          className="w-full flex items-center justify-between p-4 bg-slate-900 rounded-lg border border-slate-700 hover:border-slate-600 transition-colors"
        >
          <span className="text-sm font-medium text-slate-300">Raw Record (Debug)</span>
          <span className="text-slate-500">{showRawJson ? '▼' : '▶'}</span>
        </button>

        {showRawJson && (
          <div className="mt-4 p-4 bg-slate-900 rounded-lg">
            <div className="text-xs text-slate-500 mb-2 font-mono">
              ID: {decision.id} | Correlation: {decision.correlationId || 'N/A'}
            </div>
            <pre className="text-xs text-slate-300 overflow-x-auto font-mono">
              {JSON.stringify(decision, null, 2)}
            </pre>
          </div>
        )}
      </Section>
    </div>
  )
}
