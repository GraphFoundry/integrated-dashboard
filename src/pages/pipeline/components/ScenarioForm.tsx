import { useState, useEffect, useCallback } from 'react'
import type { Scenario, ScenarioType, DiscoveredService } from '@/lib/types'
import { getServices } from '@/lib/api'

// Example services for Mock mode (valid format for Live mode reference)
const EXAMPLE_SERVICES = [
  'default:productcatalog',
  'default:checkoutservice',
  'default:frontend',
  'default:cartservice',
]

// Validate serviceId format for Live mode: must be "namespace:name"
function isValidLiveServiceId(serviceId: string): boolean {
  const trimmed = serviceId.trim()
  if (!trimmed) return false
  const parts = trimmed.split(':')
  if (parts.length !== 2) return false
  const [namespace, name] = parts
  return namespace.length > 0 && name.length > 0
}

interface ScenarioFormProps {
  readonly onRun: (scenario: Scenario) => void
  readonly loading: boolean
  readonly mode: 'mock' | 'live'
  readonly scenarioType: ScenarioType
  readonly onScenarioTypeChange: (type: ScenarioType) => void
}

export default function ScenarioForm({
  onRun,
  loading,
  mode,
  scenarioType,
  onScenarioTypeChange,
}: ScenarioFormProps) {
  // Mock mode: prefill with a valid service; Live mode: empty for user input
  const [serviceId, setServiceId] = useState(mode === 'mock' ? 'default:productcatalog' : '')
  const [maxDepth, setMaxDepth] = useState(2)
  const [currentPods, setCurrentPods] = useState(3)
  const [newPods, setNewPods] = useState(5)
  const [latencyMetric, setLatencyMetric] = useState<'p50' | 'p95' | 'p99'>('p95')

  // Service Addition state
  const [newServiceName, setNewServiceName] = useState('')
  const [minCpu, setMinCpu] = useState(0.5)
  const [minRam, setMinRam] = useState(512)
  const [addReplicas, setAddReplicas] = useState(1)
  const [dependencies, setDependencies] = useState<string[]>([])

  // Service discovery state (Live mode only)
  const [discoveredServices, setDiscoveredServices] = useState<DiscoveredService[]>([])
  const [servicesLoading, setServicesLoading] = useState(false)
  const [servicesError, setServicesError] = useState<string | null>(null)
  const [servicesStale, setServicesStale] = useState(false)

  // Fetch services from backend when Live mode is active
  const fetchServices = useCallback(async (signal?: AbortSignal) => {
    setServicesLoading(true)
    setServicesError(null)
    try {
      const response = await getServices(signal)
      setDiscoveredServices(response.services)
      setServicesStale(response.stale)
      if (response.error) {
        setServicesError(response.error)
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'CanceledError') {
        return // Aborted, ignore
      }
      setServicesError(err instanceof Error ? err.message : 'Failed to fetch services')
      setDiscoveredServices([])
    } finally {
      setServicesLoading(false)
    }
  }, [])

  // Reset serviceId and fetch services when mode changes
  useEffect(() => {
    if (mode === 'mock') {
      setServiceId('default:productcatalog')
      setDiscoveredServices([])
      setServicesError(null)
      setServicesStale(false)
    } else {
      setServiceId('')
      // Fetch services for Live mode
      const controller = new AbortController()
      fetchServices(controller.signal)
      return () => controller.abort()
    }
  }, [mode, fetchServices])

  // Helper: check if serviceId exists in discovered services (Live mode)
  const isServiceIdInGraph = (): boolean => {
    if (mode !== 'live') return true
    if (discoveredServices.length === 0) return true // Allow if no services loaded (may be loading)
    return discoveredServices.some((s) => s.serviceId === serviceId.trim())
  }

  // Helper: check if serviceId is valid for Live mode
  const isLiveServiceIdValid = (): boolean => {
    if (!serviceId.trim()) return false
    if (!isValidLiveServiceId(serviceId)) return false
    return isServiceIdInGraph()
  }

  // Helper: check scale-specific validation
  const isScaleInputsValid = (): boolean => {
    if (currentPods < 1) return false
    if (newPods < 1) return false
    if (currentPods === newPods) return false
    return true
  }

  // Helper: check add-service specific validation
  const isAddServiceInputsValid = (): boolean => {
    if (!newServiceName.trim()) return false
    if (minCpu <= 0) return false
    if (minRam <= 0) return false
    if (addReplicas < 1) return false
    // Must have at least one valid dependency
    if (dependencies.filter((d) => d.trim()).length === 0) return false
    return true
  }

  // Helper: get serviceId validation message for display
  const getServiceIdHint = (): string | null => {
    if (mode === 'mock') return null
    if (!serviceId.trim()) return null
    if (!isValidLiveServiceId(serviceId)) {
      return 'Format: namespace:name (e.g., default:productcatalog)'
    }
    if (discoveredServices.length > 0 && !isServiceIdInGraph()) {
      return 'Service not found in graph. Select from the dropdown or check the service name.'
    }
    return null
  }

  // Main validation
  const isValid = (): boolean => {
    if (scenarioType === 'add-service') {
      return isAddServiceInputsValid()
    }
    if (!serviceId.trim()) return false
    if (mode === 'live' && !isLiveServiceIdValid()) return false
    if (maxDepth < 1 || maxDepth > 3) return false
    if (scenarioType === 'scale' && !isScaleInputsValid()) return false
    return true
  }

  const serviceIdHint = getServiceIdHint()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!isValid()) return

    if (scenarioType === 'failure') {
      onRun({
        type: 'failure',
        serviceId: serviceId.trim(),
        maxDepth,
      })
    } else if (scenarioType === 'scale') {
      onRun({
        type: 'scale',
        serviceId: serviceId.trim(),
        currentPods,
        newPods,
        latencyMetric,
        maxDepth,
      })
    } else {
      onRun({
        type: 'add-service',
        serviceName: newServiceName.trim(),
        minCpuCores: minCpu,
        minRamMB: minRam,
        replicas: addReplicas,
        dependencies: dependencies.map((d) => ({ serviceId: d, relation: 'calls' })),
        maxDepth,
      })
    }
  }

  const handleAddDependency = () => {
    setDependencies([...dependencies, ''])
  }

  const handleDependencyChange = (index: number, value: string) => {
    const newDeps = [...dependencies]
    newDeps[index] = value
    setDependencies(newDeps)
  }

  const handleRemoveDependency = (index: number) => {
    const newDeps = [...dependencies]
    newDeps.splice(index, 1)
    setDependencies(newDeps)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Scenario Type */}
      <div>
        <label htmlFor="scenarioType" className="block text-sm font-medium text-gray-300 mb-2">
          Scenario Type
        </label>
        <select
          id="scenarioType"
          value={scenarioType}
          onChange={(e) => onScenarioTypeChange(e.target.value as ScenarioType)}
          className="w-full bg-gray-700/70 text-white border border-gray-600/50 rounded-lg px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
        >
          <option value="failure">Failure Simulation</option>
          <option value="scale">Scaling Simulation</option>
          <option value="add-service">Add New Service</option>
        </select>
      </div>

      {scenarioType === 'add-service' ? (
        <>
          {/* New Service Fields */}
          <div>
            <label
              htmlFor="newServiceName"
              className="block text-sm font-medium text-slate-300 mb-2"
            >
              Service Name
            </label>
            <input
              id="newServiceName"
              type="text"
              value={newServiceName}
              onChange={(e) => setNewServiceName(e.target.value)}
              placeholder="e.g., payment-service"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="minCpu"
                className="block text-sm font-medium text-slate-300 mb-2"
              >
                Min CPU (Cores)
              </label>
              <input
                id="minCpu"
                type="number"
                step="0.1"
                min="0.1"
                value={minCpu}
                onChange={(e) => setMinCpu(Number(e.target.value))}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label
                htmlFor="minRam"
                className="block text-sm font-medium text-slate-300 mb-2"
              >
                Min RAM (MB)
              </label>
              <input
                id="minRam"
                type="number"
                min="128"
                step="128"
                value={minRam}
                onChange={(e) => setMinRam(Number(e.target.value))}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="addReplicas"
              className="block text-sm font-medium text-slate-300 mb-2"
            >
              Replicas
            </label>
            <select
              id="addReplicas"
              value={addReplicas}
              onChange={(e) => setAddReplicas(Number(e.target.value))}
              className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {[1, 2, 3, 4, 5, 10].map((num) => (
                <option key={num} value={num}>
                  {num}
                </option>
              ))}
            </select>
          </div>

          {/* Dependencies */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Dependencies
            </label>
            <div className="space-y-2 mb-2">
              {dependencies.map((dep, idx) => (
                <div key={idx} className="flex gap-2">
                  <select
                    value={dep}
                    onChange={(e) => handleDependencyChange(idx, e.target.value)}
                    className="flex-1 bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select Service...</option>
                    {discoveredServices.length > 0
                      ? discoveredServices.map((s) => (
                        <option key={s.serviceId} value={s.serviceId}>
                          {s.name} ({s.namespace})
                        </option>
                      ))
                      : EXAMPLE_SERVICES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => handleRemoveDependency(idx)}
                    className="px-3 py-2 bg-red-900/30 text-red-200 rounded hover:bg-red-900/50"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={handleAddDependency}
              className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1"
            >
              + Add Dependency
            </button>
          </div>
        </>
      ) : (
        <>
          {/* Existing Fields for Failure/Scale */}
          <div>
            <label
              htmlFor="serviceId"
              className="block text-sm font-medium text-slate-300 mb-2"
            >
              Service ID
              {mode === 'live' && (
                <span className="ml-1 text-xs text-slate-500">(namespace:name)</span>
              )}
              {mode === 'live' && servicesLoading && (
                <span className="ml-2 text-xs text-blue-400">Loading services...</span>
              )}
              {mode === 'live' && !servicesLoading && discoveredServices.length > 0 && (
                <span className="ml-2 text-xs text-green-400">
                  {discoveredServices.length} service
                  {discoveredServices.length === 1 ? '' : 's'} available
                  {servicesStale && <span className="text-yellow-400 ml-1">(stale)</span>}
                </span>
              )}
            </label>
            <input
              id="serviceId"
              type="text"
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
              list={mode === 'live' ? 'discovered-services' : undefined}
              placeholder={
                mode === 'live' ? 'Select or type service...' : 'e.g., productcatalog'
              }
              className={`w-full px-3 py-2 bg-slate-800 border rounded text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 ${serviceIdHint ? 'border-yellow-600' : 'border-slate-600'
                }`}
              disabled={mode === 'live' && servicesLoading}
            />
            {/* Datalist for Live mode autocomplete */}
            {mode === 'live' && discoveredServices.length > 0 && (
              <datalist id="discovered-services">
                {discoveredServices.map((s) => {
                  // Build enhanced label with pod count and availability if available
                  let label = `${s.name} (${s.namespace})`
                  if (s.podCount !== undefined || s.availability !== undefined) {
                    const details = []
                    if (s.podCount !== undefined) details.push(`${s.podCount} pods`)
                    if (s.availability !== undefined)
                      details.push(`${(s.availability * 100).toFixed(0)}% up`)
                    label += ` - ${details.join(', ')}`
                  }
                  return (
                    <option key={s.serviceId} value={s.serviceId}>
                      {label}
                    </option>
                  )
                })}
              </datalist>
            )}
            {serviceIdHint && (
              <p className="mt-1 text-xs text-yellow-400">{serviceIdHint}</p>
            )}
            {mode === 'live' && servicesError && (
              <p className="mt-1 text-xs text-red-400">{servicesError}</p>
            )}
            {mode === 'live' &&
              !serviceId.trim() &&
              !servicesLoading &&
              discoveredServices.length === 0 &&
              !servicesError && (
                <p className="mt-1 text-xs text-slate-500">
                  Examples: {EXAMPLE_SERVICES.slice(0, 2).join(', ')}
                </p>
              )}
          </div>

          {/* Max Depth */}
          <div>
            <label
              htmlFor="maxDepth"
              className="block text-sm font-medium text-slate-300 mb-2"
            >
              Max Depth: {maxDepth}
            </label>
            <input
              id="maxDepth"
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
                  <label
                    htmlFor="currentPods"
                    className="block text-sm font-medium text-slate-300 mb-2"
                  >
                    Current Pods
                  </label>
                  <input
                    id="currentPods"
                    type="number"
                    min="1"
                    value={currentPods}
                    onChange={(e) => setCurrentPods(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label
                    htmlFor="newPods"
                    className="block text-sm font-medium text-slate-300 mb-2"
                  >
                    New Pods
                  </label>
                  <input
                    id="newPods"
                    type="number"
                    min="1"
                    value={newPods}
                    onChange={(e) => setNewPods(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="latencyMetric"
                  className="block text-sm font-medium text-gray-300 mb-2"
                >
                  Latency Metric
                </label>
                <select
                  id="latencyMetric"
                  value={latencyMetric}
                  onChange={(e) => setLatencyMetric(e.target.value as any)}
                  className="w-full bg-gray-700/70 text-white border border-gray-600/50 rounded-lg px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                >
                  <option value="p50">P50</option>
                  <option value="p95">P95</option>
                  <option value="p99">P99</option>
                </select>
              </div>
            </>
          )}
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

  )
}
