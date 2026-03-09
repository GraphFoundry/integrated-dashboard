import { useState, useEffect, useCallback } from 'react'
import { FlaskConical, CalendarClock, Gauge } from 'lucide-react'
import type {
  Scenario,
  DiscoveredService,
  TimeWindow,
} from '@/lib/types'
import { getDependencyGraphSnapshot, getResilientServices, getServices } from '@/lib/api'
import InfoHint from '@/components/common/InfoHint'
import {
  cn,
  controlInputMutedClass,
  controlLabelClass,
  primaryButtonClass,
} from '@/components/common/uiClassTokens'
import { Combobox, Field, Input, Select, Slider } from '@/components/ui'

// Validate serviceId format: must be "namespace:name"
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

type LockedScenario = Exclude<Scenario, { type: 'add-service' }>
type LockedScenarioType = LockedScenario['type']

const LOCKED_SCENARIO_OPTIONS: ReadonlyArray<{ value: LockedScenarioType; label: string }> = [
  { value: 'failure', label: 'Failure / Service Shutdown' },
  { value: 'scale', label: 'Scaling Up / Down' },
  { value: 'traffic-spike', label: 'Traffic Spike / Targeted Load' },
  { value: 'chatty-colocation', label: 'Chatty-Service Co-location / Migration' },
  { value: 'network-cut', label: 'Network Cut / Degradation' },
]

function isLockedScenarioType(value: string): value is LockedScenarioType {
  return LOCKED_SCENARIO_OPTIONS.some((option) => option.value === value)
}

interface ScenarioFormProps {
  readonly onRun: (scenario: LockedScenario) => void
  readonly loading: boolean
  readonly scenarioType: LockedScenarioType
  readonly onScenarioTypeChange: (type: LockedScenarioType) => void
  readonly onServiceSelectionChange?: (serviceId: string) => void
  readonly onDepthChange?: (depth: number) => void
}

const compactControlClass =
  'neon-focus-ring interactive-soft h-11 w-full rounded-[var(--radius-sm)] border border-[var(--color-emerald-300)]/45 bg-[var(--surface-subtle)] px-4 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] hover:border-[var(--color-emerald-300)] focus:border-[var(--color-emerald-300)]'

const scenarioNeedsSingleTarget = (scenarioType: LockedScenarioType): boolean =>
  scenarioType === 'failure' || scenarioType === 'scale' || scenarioType === 'traffic-spike'

export default function ScenarioForm({
  onRun,
  loading,
  scenarioType,
  onScenarioTypeChange,
  onServiceSelectionChange,
  onDepthChange,
}: ScenarioFormProps) {
  const [serviceId, setServiceId] = useState('')
  const [sourceServiceId, setSourceServiceId] = useState('')
  const [targetServiceId, setTargetServiceId] = useState('')
  const [maxDepth, setMaxDepth] = useState(1)
  const [currentPods, setCurrentPods] = useState(3)
  const [newPods, setNewPods] = useState(5)
  const [latencyMetric, setLatencyMetric] = useState<'p50' | 'p95' | 'p99'>('p95')
  const [loadMultiplier, setLoadMultiplier] = useState(2)
  const [degradationPercent, setDegradationPercent] = useState(100)
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('1w')

  // Service discovery state
  const [discoveredServices, setDiscoveredServices] = useState<DiscoveredService[]>([])
  const [servicesLoading, setServicesLoading] = useState(false)
  const [servicesError, setServicesError] = useState<string | null>(null)
  const [servicesNotice, setServicesNotice] = useState<string | null>(null)
  const [servicesStale, setServicesStale] = useState(false)

  // Fetch services from backend for simulation targeting.
  const fetchServices = useCallback(async (signal?: AbortSignal) => {
    setServicesLoading(true)
    setServicesError(null)
    setServicesNotice(null)
    try {
      const [serviceResponse, graphSnapshot] = await Promise.all([
        getServices(signal).catch(() => null),
        getDependencyGraphSnapshot(signal).catch(() => null),
      ])

      if (!serviceResponse && !graphSnapshot) {
        setServicesStale(true)
        setServicesNotice(
          'Live service discovery is unavailable. Showing any cached services; if none appear, check predictive API connectivity and OVERVIEW_NAMESPACE configuration.'
        )
        setDiscoveredServices(getResilientServices([], { includeSeeded: false }))
        return
      }

      const graphServices: DiscoveredService[] = (graphSnapshot?.nodes ?? [])
        .filter((node) => Boolean(node.name))
        .map((node) => ({
          serviceId: `${node.namespace || 'default'}:${node.name}`,
          name: node.name,
          namespace: node.namespace || 'default',
          podCount: typeof node.podCount === 'number' ? node.podCount : undefined,
          availability: typeof node.availability === 'number' ? node.availability : undefined,
        }))

      const resilientServices = getResilientServices(
        [...(serviceResponse?.services ?? []), ...graphServices],
        { includeSeeded: false }
      )
      setDiscoveredServices(resilientServices)
      const sourcesAreStale = Boolean(serviceResponse?.stale || graphSnapshot?.metadata?.stale)
      setServicesStale(sourcesAreStale)

      if (serviceResponse?.error) {
        setServicesNotice(serviceResponse.error)
      } else if (sourcesAreStale) {
        setServicesNotice('Showing latest available services (data source is currently stale).')
      } else if (resilientServices.length === 0) {
        setServicesNotice(
          'No live services were found in the configured workload namespace. Check that analysis-engine and service-graph-engine use the same OVERVIEW_NAMESPACE.'
        )
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'CanceledError') {
        return // Aborted, ignore
      }
      setServicesError(null)
      setServicesStale(true)
      setServicesNotice(
        'Live service discovery is unavailable. Showing any cached services; if none appear, check predictive API connectivity and OVERVIEW_NAMESPACE configuration.'
      )
      setDiscoveredServices(getResilientServices([], { includeSeeded: false }))
    } finally {
      setServicesLoading(false)
    }
  }, [])

  // Fetch services for live simulation runs.
  useEffect(() => {
    const controller = new AbortController()
    fetchServices(controller.signal)
    return () => controller.abort()
  }, [fetchServices])

  useEffect(() => {
    const selected = scenarioNeedsSingleTarget(scenarioType)
      ? serviceId.trim()
      : sourceServiceId.trim()
    onServiceSelectionChange?.(selected)
  }, [scenarioType, serviceId, sourceServiceId, onServiceSelectionChange])

  useEffect(() => {
    onDepthChange?.(maxDepth)
  }, [maxDepth, onDepthChange])

  const isServiceIdInGraph = (candidateServiceId: string): boolean => {
    if (discoveredServices.length === 0) return true // Allow if no services loaded (may be loading)
    return discoveredServices.some((service) => service.serviceId === candidateServiceId.trim())
  }

  const isServiceIdValid = (candidateServiceId: string): boolean => {
    if (!candidateServiceId.trim()) return false
    if (!isValidLiveServiceId(candidateServiceId)) return false
    return isServiceIdInGraph(candidateServiceId)
  }

  const getServiceIdHint = (candidateServiceId: string): string | null => {
    if (!candidateServiceId.trim()) return null
    if (!isValidLiveServiceId(candidateServiceId)) {
      return 'Format: namespace:name (e.g., default:productcatalog)'
    }
    if (discoveredServices.length > 0 && !isServiceIdInGraph(candidateServiceId)) {
      return 'Service not found in graph. Select from the dropdown or check the service name.'
    }
    return null
  }

  const isScaleInputsValid = (): boolean => {
    if (currentPods < 1) return false
    if (newPods < 1) return false
    if (currentPods === newPods) return false
    return true
  }

  const arePairServicesValid = (): boolean => {
    if (!isServiceIdValid(sourceServiceId)) return false
    if (!isServiceIdValid(targetServiceId)) return false
    return sourceServiceId.trim() !== targetServiceId.trim()
  }

  const isValid = (): boolean => {
    if (scenarioNeedsSingleTarget(scenarioType) && !isServiceIdValid(serviceId)) {
      return false
    }

    if (scenarioType === 'failure' || scenarioType === 'scale' || scenarioType === 'traffic-spike') {
      if (maxDepth < 1 || maxDepth > 3) return false
    }

    if (scenarioType === 'scale' && !isScaleInputsValid()) return false

    if (scenarioType === 'traffic-spike' && loadMultiplier <= 1) return false

    if ((scenarioType === 'chatty-colocation' || scenarioType === 'network-cut') && !arePairServicesValid()) {
      return false
    }

    if (scenarioType === 'network-cut') {
      if (!Number.isFinite(degradationPercent)) return false
      if (degradationPercent < 0 || degradationPercent > 100) return false
    }

    return true
  }

  const serviceIdHint = getServiceIdHint(serviceId)
  const sourceServiceHint = getServiceIdHint(sourceServiceId)
  const targetServiceHint = getServiceIdHint(targetServiceId)

  const serviceComboboxItems = discoveredServices.map((service) => {
    let label = `${service.name} (${service.namespace})`
    if (service.podCount !== undefined || service.availability !== undefined) {
      const details = []
      if (service.podCount !== undefined) details.push(`${service.podCount} pods`)
      if (service.availability !== undefined) {
        details.push(`${(service.availability * 100).toFixed(0)}% up`)
      }
      label += ` - ${details.join(', ')}`
    }
    return { value: service.serviceId, label }
  })

  const commonServiceHelperText =
    servicesNotice ||
    (!servicesLoading && discoveredServices.length === 0 && !servicesError
      ? 'No live services are currently discoverable. Enter a service as namespace:name or verify the configured workload namespace.'
      : undefined)

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
      return
    }

    if (scenarioType === 'scale') {
      onRun({
        type: 'scale',
        serviceId: serviceId.trim(),
        currentPods,
        newPods,
        latencyMetric,
        maxDepth,
        timeWindow,
      })
      return
    }

    if (scenarioType === 'traffic-spike') {
      onRun({
        type: 'traffic-spike',
        serviceId: serviceId.trim(),
        loadMultiplier,
        maxDepth,
        timeWindow,
      })
      return
    }

    if (scenarioType === 'chatty-colocation') {
      onRun({
        type: 'chatty-colocation',
        sourceServiceId: sourceServiceId.trim(),
        targetServiceId: targetServiceId.trim(),
        maxDepth,
        timeWindow,
      })
      return
    }

    onRun({
      type: 'network-cut',
      sourceServiceId: sourceServiceId.trim(),
      targetServiceId: targetServiceId.trim(),
      degradationPercent,
      maxDepth,
      timeWindow,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="scenarioType" className={controlLabelClass}>
          Scenario Type
        </label>
        <Select
          id="scenarioType"
          value={scenarioType}
          onChange={(e) => {
            const nextValue = e.target.value
            if (isLockedScenarioType(nextValue)) {
              onScenarioTypeChange(nextValue)
            }
          }}
          className={controlInputMutedClass}
          suffixIcon={<FlaskConical className="h-4 w-4" />}
        >
          {LOCKED_SCENARIO_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>

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

      {scenarioNeedsSingleTarget(scenarioType) ? (
        <div>
          <Field
            id="serviceId"
            label={
              <>
                Target Service ID
                <span className="ml-1 align-middle">
                  <InfoHint text="Pick the service you want to test in this simulation. Use namespace:name so the system can find the exact service correctly and avoid selecting the wrong service with a similar name." />
                </span>
                <span className="ml-1 text-xs text-[var(--text-dim)]">(namespace:name)</span>
                {servicesLoading && <span className="ml-2 text-xs text-blue-400">Loading services...</span>}
                {!servicesLoading && discoveredServices.length > 0 && (
                  <span className="ml-2 text-xs text-[var(--text-secondary)]">
                    {discoveredServices.length} service
                    {discoveredServices.length === 1 ? '' : 's'} available
                    {servicesStale && <span className="ml-1 text-amber-600">(stale source)</span>}
                  </span>
                )}
              </>
            }
            helperClassName={cn(serviceIdHint ? 'text-amber-600' : 'text-[var(--text-dim)]')}
            helperText={serviceIdHint || commonServiceHelperText}
            errorClassName="text-red-400"
            errorText={servicesError}
          >
            <Combobox
              id="serviceId"
              value={serviceId}
              onChange={(e) => setServiceId(normalizeLiveServiceInput(e.target.value))}
              items={serviceComboboxItems}
              placeholder="Select or type service..."
              className={cn(
                compactControlClass,
                'placeholder-slate-500',
                serviceIdHint ? 'border-amber-500/70' : 'border-[var(--border-strong)]'
              )}
              aria-label="Target service ID"
            />
          </Field>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field
            id="sourceServiceId"
            label="Source Service ID"
            helperClassName={cn(sourceServiceHint ? 'text-amber-600' : 'text-[var(--text-dim)]')}
            helperText={sourceServiceHint || commonServiceHelperText}
            errorClassName="text-red-400"
            errorText={servicesError}
          >
            <Combobox
              id="sourceServiceId"
              value={sourceServiceId}
              onChange={(e) => setSourceServiceId(normalizeLiveServiceInput(e.target.value))}
              items={serviceComboboxItems}
              placeholder="Select or type source service..."
              className={cn(
                compactControlClass,
                'placeholder-slate-500',
                sourceServiceHint ? 'border-amber-500/70' : 'border-[var(--border-strong)]'
              )}
              aria-label="Source service ID"
            />
          </Field>

          <Field
            id="targetServiceId"
            label="Target Service ID"
            helperClassName={cn(targetServiceHint ? 'text-amber-600' : 'text-[var(--text-dim)]')}
            helperText={targetServiceHint || commonServiceHelperText}
            errorClassName="text-red-400"
            errorText={servicesError}
          >
            <Combobox
              id="targetServiceId"
              value={targetServiceId}
              onChange={(e) => setTargetServiceId(normalizeLiveServiceInput(e.target.value))}
              items={serviceComboboxItems}
              placeholder="Select or type target service..."
              className={cn(
                compactControlClass,
                'placeholder-slate-500',
                targetServiceHint ? 'border-amber-500/70' : 'border-[var(--border-strong)]'
              )}
              aria-label="Target service ID"
            />
          </Field>

          {sourceServiceId.trim() && targetServiceId.trim() && sourceServiceId.trim() === targetServiceId.trim() && (
            <p className="md:col-span-2 rounded border border-amber-500/60 bg-amber-500/10 p-2 text-xs text-[var(--text-primary)]">
              Source and target must be different services.
            </p>
          )}
        </div>
      )}

      {(scenarioType === 'failure' || scenarioType === 'scale' || scenarioType === 'traffic-spike') && (
        <div>
          <label htmlFor="maxDepth" className={controlLabelClass}>
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
          <div className="mt-1 flex justify-between text-xs text-[var(--text-dim)]">
            <span>1</span>
            <span>2</span>
            <span>3</span>
          </div>
        </div>
      )}

      {scenarioType === 'scale' && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="currentPods" className={controlLabelClass}>
                Current Pods
              </label>
              <Input
                id="currentPods"
                type="number"
                min="1"
                value={currentPods}
                onChange={(e) => setCurrentPods(Number(e.target.value))}
                className={compactControlClass}
              />
            </div>
            <div>
              <label htmlFor="newPods" className={controlLabelClass}>
                New Pods
              </label>
              <Input
                id="newPods"
                type="number"
                min="1"
                value={newPods}
                onChange={(e) => setNewPods(Number(e.target.value))}
                className={compactControlClass}
              />
            </div>
          </div>

          <div>
            <label htmlFor="latencyMetric" className={controlLabelClass}>
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
        </>
      )}

      {scenarioType === 'traffic-spike' && (
        <div>
          <label htmlFor="loadMultiplier" className={controlLabelClass}>
            Load Multiplier
          </label>
          <Input
            id="loadMultiplier"
            type="number"
            min="1.1"
            step="0.1"
            value={loadMultiplier}
            onChange={(e) => setLoadMultiplier(Number(e.target.value))}
            className={compactControlClass}
          />
          <p className="mt-1 text-xs text-[var(--text-dim)]">Use values greater than 1 (e.g., 2.0 for 2x traffic).</p>
        </div>
      )}

      {scenarioType === 'network-cut' && (
        <div>
          <label htmlFor="degradationPercent" className={controlLabelClass}>
            Degradation Percent (0-100)
          </label>
          <Input
            id="degradationPercent"
            type="number"
            min="0"
            max="100"
            step="1"
            value={degradationPercent}
            onChange={(e) => setDegradationPercent(Number(e.target.value))}
            className={compactControlClass}
          />
          <p className="mt-1 text-xs text-[var(--text-dim)]">
            100 means full cut; lower values represent partial degradation.
          </p>
        </div>
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
