import { useState, useEffect, useCallback } from 'react'
import { FlaskConical, CalendarClock, Gauge, Layers, X } from 'lucide-react'
import type { Scenario, ScenarioType, DiscoveredService, SimulationDemoConstraints, TimeWindow } from '@/lib/types'
import { getResilientServices, getServices } from '@/lib/api'
import InfoHint from '@/components/common/InfoHint'
import {
  cn,
  controlInputMutedClass,
  controlLabelClass,
  primaryButtonClass,
  secondaryButtonClass,
} from '@/components/common/uiClassTokens'
import { Combobox, Field, Input, Select, Slider } from '@/components/ui'

// Example services for Demo mode (valid format for Live mode reference)
const EXAMPLE_SERVICES = [
  'default:productcatalog',
  'default:checkoutservice',
  'default:frontend',
  'default:cartservice',
  'default:recommendationservice',
  'default:paymentservice',
]

const DEFAULT_DEMO_CONSTRAINTS: SimulationDemoConstraints = {
  note: 'Demo Snapshot Mode uses deterministic fixtures and supports a curated subset of scenarios.',
  addServiceSupported: false,
  failure: { serviceId: 'default:checkoutservice' },
  scale: { serviceId: 'default:recommendationservice', currentPods: 2, newPods: 5 },
}

// Validate serviceId format for Live mode: must be "namespace:name"
function isValidLiveServiceId(serviceId: string): boolean {
  const trimmed = serviceId.trim()
  if (!trimmed) return false
  const parts = trimmed.split(':')
  if (parts.length !== 2) return false
  const [namespace, name] = parts
  return namespace.length > 0 && name.length > 0
}

function normalizeLiveServiceInput(rawValue: string): string {
  const trimmed = rawValue.trim()
  if (!trimmed) return ''

  if (trimmed.includes(':')) {
    return trimmed
  }

  const labelledMatch = trimmed.match(/^([a-z0-9-]+)\s*\(([^)]+)\)(?:\s*-\s*.*)?$/i)
  if (labelledMatch) {
    const [, serviceName, namespace] = labelledMatch
    if (serviceName && namespace) {
      return `${namespace}:${serviceName}`
    }
  }

  return trimmed
}

interface ScenarioFormProps {
  readonly onRun: (scenario: Scenario) => void
  readonly loading: boolean
  readonly mode: 'demo' | 'live'
  readonly scenarioType: ScenarioType
  readonly demoConstraints?: SimulationDemoConstraints
  readonly onScenarioTypeChange: (type: ScenarioType) => void
  readonly allowExperimentalAdd?: boolean
  readonly onServiceSelectionChange?: (serviceId: string) => void
  readonly onDepthChange?: (depth: number) => void
}

const compactControlClass =
  'neon-focus-ring interactive-soft h-11 w-full rounded-[var(--radius-sm)] border border-[var(--color-emerald-300)]/45 bg-[var(--surface-subtle)] px-4 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] hover:border-[var(--color-emerald-300)] focus:border-[var(--color-emerald-300)]'

export default function ScenarioForm({
  onRun,
  loading,
  mode,
  scenarioType,
  demoConstraints,
  onScenarioTypeChange,
  allowExperimentalAdd = true,
  onServiceSelectionChange,
  onDepthChange,
}: ScenarioFormProps) {
  // Demo mode: prefill with a valid service; Live mode: empty for user input
  const [serviceId, setServiceId] = useState(mode === 'demo' ? 'default:productcatalog' : '')
  const [maxDepth, setMaxDepth] = useState(1)
  const [currentPods, setCurrentPods] = useState(3)
  const [newPods, setNewPods] = useState(5)
  const [latencyMetric, setLatencyMetric] = useState<'p50' | 'p95' | 'p99'>('p95')
  const [topPaths, setTopPaths] = useState(5)
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('1w')

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
  const [servicesNotice, setServicesNotice] = useState<string | null>(null)
  const [servicesStale, setServicesStale] = useState(false)
  const effectiveDemoConstraints = demoConstraints ?? DEFAULT_DEMO_CONSTRAINTS
  const activeDemoScenarioConstraint =
    mode !== 'demo'
      ? undefined
      : scenarioType === 'failure'
        ? effectiveDemoConstraints.failure
        : scenarioType === 'scale'
          ? effectiveDemoConstraints.scale
          : undefined
  const demoScaleConstraint = mode === 'demo' && scenarioType === 'scale' ? effectiveDemoConstraints.scale : undefined

  // Fetch services from backend when Live mode is active
  const fetchServices = useCallback(async (signal?: AbortSignal) => {
    setServicesLoading(true)
    setServicesError(null)
    setServicesNotice(null)
    try {
      const response = await getServices(signal)
      const resilientServices = getResilientServices(response.services)
      setDiscoveredServices(resilientServices)
      setServicesStale(response.stale)
      if (response.error) {
        setServicesNotice(response.error)
      } else if (response.stale) {
        setServicesNotice('Showing latest available services (data source is currently stale).')
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'CanceledError') {
        return // Aborted, ignore
      }
      setServicesError(null)
      setServicesStale(true)
      setServicesNotice('Live service list is unavailable. Showing cached/demo services.')
      setDiscoveredServices(getResilientServices([]))
    } finally {
      setServicesLoading(false)
    }
  }, [])

  // Reset serviceId and fetch services when mode changes
  useEffect(() => {
    if (mode === 'demo') {
      if (scenarioType === 'failure') {
        setServiceId(effectiveDemoConstraints.failure?.serviceId ?? 'default:checkoutservice')
      } else if (scenarioType === 'scale') {
        setServiceId(effectiveDemoConstraints.scale?.serviceId ?? 'default:recommendationservice')
        setCurrentPods(effectiveDemoConstraints.scale?.currentPods ?? 2)
        setNewPods(effectiveDemoConstraints.scale?.newPods ?? 5)
      }
      setDiscoveredServices(getResilientServices([]))
      setServicesError(null)
      setServicesNotice(null)
      setServicesStale(false)
    } else {
      setServiceId('')
      // Fetch services for Live mode
      const controller = new AbortController()
      fetchServices(controller.signal)
      return () => controller.abort()
    }
  }, [
    mode,
    fetchServices,
    scenarioType,
    effectiveDemoConstraints.failure?.serviceId,
    effectiveDemoConstraints.scale?.serviceId,
    effectiveDemoConstraints.scale?.currentPods,
    effectiveDemoConstraints.scale?.newPods,
  ])

  useEffect(() => {
    onServiceSelectionChange?.(serviceId.trim())
  }, [serviceId, onServiceSelectionChange])

  useEffect(() => {
    onDepthChange?.(maxDepth)
  }, [maxDepth, onDepthChange])

  useEffect(() => {
    const addServiceSupportedInCurrentMode =
      allowExperimentalAdd && (mode !== 'demo' || effectiveDemoConstraints.addServiceSupported === true)
    if (!addServiceSupportedInCurrentMode && scenarioType === 'add-service') {
      onScenarioTypeChange('failure')
    }
  }, [allowExperimentalAdd, effectiveDemoConstraints.addServiceSupported, mode, onScenarioTypeChange, scenarioType])

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
    if (mode === 'demo') {
      if (scenarioType === 'failure') {
        return `Demo failure runs are fixed to ${effectiveDemoConstraints.failure?.serviceId ?? 'default:checkoutservice'}.`
      }
      if (scenarioType === 'scale') {
        const scaleTarget = effectiveDemoConstraints.scale?.serviceId ?? 'default:recommendationservice'
        const current = effectiveDemoConstraints.scale?.currentPods ?? 2
        const next = effectiveDemoConstraints.scale?.newPods ?? 5
        return `Demo scaling runs are fixed to ${scaleTarget} (${current} -> ${next} pods).`
      }
      return 'Demo mode supports curated fixtures only.'
    }
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
      return mode === 'live' && isAddServiceInputsValid()
    }
    if (!serviceId.trim()) return false
    if (mode === 'demo') {
      if (scenarioType === 'failure') {
        const expectedServiceId = effectiveDemoConstraints.failure?.serviceId
        if (expectedServiceId && serviceId.trim() !== expectedServiceId) return false
      }
      if (scenarioType === 'scale') {
        const expectedServiceId = effectiveDemoConstraints.scale?.serviceId
        if (expectedServiceId && serviceId.trim() !== expectedServiceId) return false
        const expectedCurrentPods = effectiveDemoConstraints.scale?.currentPods
        if (typeof expectedCurrentPods === 'number' && currentPods !== expectedCurrentPods) return false
        const expectedNewPods = effectiveDemoConstraints.scale?.newPods
        if (typeof expectedNewPods === 'number' && newPods !== expectedNewPods) return false
      }
    }
    if (mode === 'live' && !isLiveServiceIdValid()) return false
    if (maxDepth < 1 || maxDepth > 3) return false
    if (scenarioType === 'scale' && !isScaleInputsValid()) return false
    return true
  }

  const serviceIdHint = getServiceIdHint()
  const serviceComboboxItems =
    mode === 'live'
      ? discoveredServices.map((s) => {
        let label = `${s.name} (${s.namespace})`
        if (s.podCount !== undefined || s.availability !== undefined) {
          const details = []
          if (s.podCount !== undefined) details.push(`${s.podCount} pods`)
          if (s.availability !== undefined) details.push(`${(s.availability * 100).toFixed(0)}% up`)
          label += ` - ${details.join(', ')}`
        }
        return { value: s.serviceId, label }
      })
      : activeDemoScenarioConstraint
        ? [{ value: activeDemoScenarioConstraint.serviceId, label: `${activeDemoScenarioConstraint.serviceId} (demo fixture)` }]
        : []

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!isValid()) return

    if (scenarioType === 'failure') {
      onRun({
        type: 'failure',
        serviceId: serviceId.trim(),
        maxDepth,
        timeWindow,
      })
    } else if (scenarioType === 'scale') {
      onRun({
        type: 'scale',
        serviceId: serviceId.trim(),
        currentPods,
        newPods,
        latencyMetric,
        maxDepth,
        topPaths,
        timeWindow,
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
        timeWindow,
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
        <label htmlFor="scenarioType" className={controlLabelClass}>
          Scenario Type
        </label>
        <Select
          id="scenarioType"
          value={scenarioType}
          onChange={(e) => onScenarioTypeChange(e.target.value as ScenarioType)}
          className={controlInputMutedClass}
          suffixIcon={<FlaskConical className="h-4 w-4" />}
        >
          <option value="failure">Failure Simulation</option>
          <option value="scale">Scaling Simulation</option>
          {allowExperimentalAdd && (
            <option value="add-service" disabled={mode === 'demo' && effectiveDemoConstraints.addServiceSupported !== true}>
              {mode === 'demo' ? 'Add New Service (Experimental, Live only)' : 'Add New Service (Experimental)'}
            </option>
          )}
        </Select>
        {mode === 'demo' && (
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            Demo mode is constrained to curated fixtures for repeatable outputs.
          </p>
        )}
      </div>

      {/* Time Period (For all simulation types) */}
      <div className="mb-4">
        <label htmlFor="timeWindow" className={controlLabelClass}>
          Decision Time Period
        </label>
        <Select
          id="timeWindow"
          value={timeWindow}
          onChange={(e) => setTimeWindow(e.target.value as TimeWindow)}
          className={controlInputMutedClass}
          suffixIcon={<CalendarClock className="h-4 w-4" />}
        >
          <option value="5d">5 Days</option>
          <option value="1w">1 Week</option>
          <option value="2w">2 Weeks</option>
          <option value="1m">1 Month</option>
        </Select>
      </div>

      {scenarioType === 'add-service' ? (
        <>
          {/* New Service Fields */}
          <div>
            <label
              htmlFor="newServiceName"
              className={controlLabelClass}
            >
              Service Name
            </label>
            <Input
              id="newServiceName"
              type="text"
              value={newServiceName}
              onChange={(e) => setNewServiceName(e.target.value)}
              placeholder="e.g., payment-service"
              className={compactControlClass}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="minCpu"
                className={controlLabelClass}
              >
                Min CPU (Cores)
              </label>
              <Input
                id="minCpu"
                type="number"
                step="0.1"
                min="0.1"
                value={minCpu}
                onChange={(e) => setMinCpu(Number(e.target.value))}
                className={compactControlClass}
              />
            </div>
            <div>
              <label
                htmlFor="minRam"
                className={controlLabelClass}
              >
                Memory Allocation
              </label>
              <Select
                id="minRam"
                value={minRam}
                onChange={(e) => setMinRam(Number(e.target.value))}
                className={controlInputMutedClass}
                suffixIcon={<Gauge className="h-4 w-4" />}
              >
                <option value={128}>128 MB</option>
                <option value={256}>256 MB</option>
                <option value={512}>512 MB</option>
                <option value={1024}>1 GB</option>
                <option value={2048}>2 GB</option>
                <option value={4096}>4 GB</option>
                <option value={8192}>8 GB</option>
                <option value={12288}>12 GB</option>
                <option value={16384}>16 GB</option>
              </Select>
            </div>
          </div>

          <div>
            <label
              htmlFor="addReplicas"
              className={controlLabelClass}
            >
              Replicas
            </label>
            <Select
              id="addReplicas"
              value={addReplicas}
              onChange={(e) => setAddReplicas(Number(e.target.value))}
              className={controlInputMutedClass}
              suffixIcon={<Layers className="h-4 w-4" />}
            >
              {[1, 2, 3, 4, 5, 10].map((num) => (
                <option key={num} value={num}>
                  {num}
                </option>
              ))}
            </Select>
          </div>

          {/* Dependencies */}
          <div>
            <label className={controlLabelClass}>
              Dependencies
            </label>
            <div className="space-y-2 mb-2">
              {dependencies.map((dep, idx) => (
                <div key={idx} className="flex gap-2">
                  <Select
                    aria-label={`Dependency ${idx + 1}`}
                    value={dep}
                    onChange={(e) => handleDependencyChange(idx, e.target.value)}
                    className={cn(controlInputMutedClass, 'flex-1')}
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
                  </Select>
                  <button
                    type="button"
                    onClick={() => handleRemoveDependency(idx)}
                    className="neon-focus-ring interactive-soft inline-flex h-11 items-center justify-center rounded-[var(--radius-sm)] border border-rose-300/45 bg-rose-500/14 px-3 text-rose-400 hover:bg-rose-500/24"
                    aria-label={`Remove dependency ${idx + 1}`}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={handleAddDependency}
              className={cn(secondaryButtonClass, 'inline-flex items-center gap-1 px-3 py-2 text-sm')}
            >
              + Add Dependency
            </button>
          </div>
        </>
      ) : (
        <>
          {/* Existing Fields for Failure/Scale */}
          <div>
            <Field
              id="serviceId"
              label={
                <>
                  Service ID
                  <span className="ml-1 align-middle">
                    <InfoHint text="Pick the service you want to test in this simulation. Use namespace:name so the system can find the exact service correctly and avoid selecting the wrong service with a similar name." />
                  </span>
                  {mode === 'live' && (
                    <span className="ml-1 text-xs text-[var(--text-dim)]">(namespace:name)</span>
                  )}
                  {mode === 'live' && servicesLoading && (
                    <span className="ml-2 text-xs text-blue-400">Loading services...</span>
                  )}
                  {mode === 'live' && !servicesLoading && discoveredServices.length > 0 && (
                    <span className="ml-2 text-xs text-[var(--text-secondary)]">
                      {discoveredServices.length} service
                      {discoveredServices.length === 1 ? '' : 's'} available
                      {servicesStale && <span className="ml-1 text-amber-600">(stale source)</span>}
                    </span>
                  )}
                </>
              }
              helperClassName={cn(serviceIdHint ? 'text-amber-600' : 'text-[var(--text-dim)]')}
              helperText={
                serviceIdHint ||
                servicesNotice ||
                (mode === 'live' &&
                !serviceId.trim() &&
                !servicesLoading &&
                discoveredServices.length === 0 &&
                !servicesError
                  ? `Examples: ${EXAMPLE_SERVICES.slice(0, 2).join(', ')}`
                  : undefined)
              }
              errorClassName="text-red-400"
              errorText={mode === 'live' ? servicesError : null}
            >
              <Combobox
                id="serviceId"
                value={serviceId}
                onChange={(e) => setServiceId(normalizeLiveServiceInput(e.target.value))}
                disabled={mode === 'demo' && Boolean(activeDemoScenarioConstraint?.serviceId)}
                items={serviceComboboxItems}
                placeholder={
                  mode === 'live'
                    ? 'Select or type service...'
                    : activeDemoScenarioConstraint
                      ? 'Fixed by demo fixture'
                      : 'e.g., productcatalog'
                }
                className={cn(
                  compactControlClass,
                  'placeholder-slate-500',
                  serviceIdHint ? 'border-amber-500/70' : 'border-[var(--border-strong)]'
                )}
                aria-label="Service ID"
              />
            </Field>
          </div>

          {/* Max Depth */}
          <div>
            <label
              htmlFor="maxDepth"
              className={controlLabelClass}
            >
              Impact Range (hops): {maxDepth}
            </label>
            <Slider
              aria-label="Impact range in hops"
              id="maxDepth"
              min="1"
              max="3"
              value={maxDepth}
              onChange={(e) => setMaxDepth(Number(e.target.value))}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-[var(--text-dim)] mt-1">
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
                    className={controlLabelClass}
                  >
                    Current Pods
                  </label>
                  <Input
                    id="currentPods"
                    type="number"
                    min="1"
                    value={currentPods}
                    onChange={(e) => setCurrentPods(Number(e.target.value))}
                    disabled={Boolean(demoScaleConstraint)}
                    className={compactControlClass}
                  />
                </div>
                <div>
                  <label
                    htmlFor="newPods"
                    className={controlLabelClass}
                  >
                    New Pods
                  </label>
                  <Input
                    id="newPods"
                    type="number"
                    min="1"
                    value={newPods}
                    onChange={(e) => setNewPods(Number(e.target.value))}
                    disabled={Boolean(demoScaleConstraint)}
                    className={compactControlClass}
                  />
                </div>
              </div>
              {demoScaleConstraint && (
                <p className="text-xs text-[var(--text-muted)]">
                  Demo scaling fixture is locked to {demoScaleConstraint.serviceId} ({demoScaleConstraint.currentPods ?? 2} -&gt;{' '}
                  {demoScaleConstraint.newPods ?? 5} pods) to match backend demo validation.
                </p>
              )}

              <div>
                <label
                  htmlFor="latencyMetric"
                  className={controlLabelClass}
                >
                  Latency Metric
                </label>
                <Select
                  id="latencyMetric"
                  value={latencyMetric}
                  onChange={(e) => setLatencyMetric(e.target.value as 'p50' | 'p95' | 'p99')}
                  className={controlInputMutedClass}
                  suffixIcon={<Gauge className="h-4 w-4" />}
                >
                  <option value="p50">Typical response time</option>
                  <option value="p95">Slow-end response time (95% under this)</option>
                  <option value="p99">Worst-case response time (99% under this)</option>
                </Select>
              </div>

              <div>
                <label
                  htmlFor="topPaths"
                  className={controlLabelClass}
                >
                  Top Paths
                </label>
                <Select
                  id="topPaths"
                  value={topPaths}
                  onChange={(e) => setTopPaths(Number(e.target.value))}
                  className={controlInputMutedClass}
                  suffixIcon={<Layers className="h-4 w-4" />}
                >
                  {[3, 5, 8, 10].map((num) => (
                    <option key={num} value={num}>
                      Top {num}
                    </option>
                  ))}
                </Select>
              </div>
            </>
          )}
        </>
      )}

      <button
        type="submit"
        disabled={!isValid() || loading}
        className={cn(
          primaryButtonClass,
          'w-full py-3 disabled:cursor-not-allowed disabled:bg-[var(--surface-soft)] disabled:text-[var(--text-dim)]'
        )}
      >
        {loading ? 'Running...' : 'Run Simulation'}
      </button>
    </form>

  )
}
