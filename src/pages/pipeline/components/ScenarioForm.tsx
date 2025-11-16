import { useState } from 'react'
import type { Scenario, ScenarioType } from '@/lib/types'

interface ScenarioFormProps {
  onRun: (scenario: Scenario) => void
  loading: boolean
}

export default function ScenarioForm({ onRun, loading }: ScenarioFormProps) {
  const [scenarioType, setScenarioType] = useState<ScenarioType>('failure')
  const [serviceId, setServiceId] = useState('')
  const [maxDepth, setMaxDepth] = useState(2)
  const [currentPods, setCurrentPods] = useState(3)
  const [newPods, setNewPods] = useState(5)
  const [latencyMetric, setLatencyMetric] = useState<'p50' | 'p95' | 'p99'>('p95')

  const isValid = () => {
    if (!serviceId.trim()) return false
    if (maxDepth < 1 || maxDepth > 3) return false
    if (scenarioType === 'scale') {
      if (currentPods < 1 || newPods < 1) return false
      if (currentPods === newPods) return false
    }
    return true
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!isValid()) return

    if (scenarioType === 'failure') {
      onRun({
        type: 'failure',
        serviceId: serviceId.trim(),
        maxDepth,
      })
    } else {
      onRun({
        type: 'scale',
        serviceId: serviceId.trim(),
        currentPods,
        newPods,
        latencyMetric,
        maxDepth,
      })
    }
  }

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-6">
      <h2 className="text-xl font-semibold text-white mb-4">Scenario Configuration</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Scenario Type */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Scenario Type</label>
          <select
            value={scenarioType}
            onChange={(e) => setScenarioType(e.target.value as ScenarioType)}
            className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="failure">Failure</option>
            <option value="scale">Scale</option>
          </select>
        </div>

        {/* Service ID */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Service ID</label>
          <input
            type="text"
            value={serviceId}
            onChange={(e) => setServiceId(e.target.value)}
            placeholder="e.g., productcatalog"
            className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Max Depth */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Max Depth: {maxDepth}
          </label>
          <input
            type="range"
            min="1"
            max="3"
            value={maxDepth}
            onChange={(e) => setMaxDepth(Number(e.target.value))}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-slate-500 mt-1">
            <span>1</span>
            <span>2</span>
            <span>3</span>
          </div>
        </div>

        {/* Scale-specific fields */}
        {scenarioType === 'scale' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Current Pods
                </label>
                <input
                  type="number"
                  min="1"
                  value={currentPods}
                  onChange={(e) => setCurrentPods(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">New Pods</label>
                <input
                  type="number"
                  min="1"
                  value={newPods}
                  onChange={(e) => setNewPods(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Latency Metric
              </label>
              <select
                value={latencyMetric}
                onChange={(e) => setLatencyMetric(e.target.value as any)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="p50">P50</option>
                <option value="p95">P95</option>
                <option value="p99">P99</option>
              </select>
            </div>
          </>
        )}

        <button
          type="submit"
          disabled={!isValid() || loading}
          className="w-full px-4 py-3 bg-blue-600 text-white font-medium rounded hover:bg-blue-700 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Running...' : 'Run Simulation'}
        </button>
      </form>
    </div>
  )
}
