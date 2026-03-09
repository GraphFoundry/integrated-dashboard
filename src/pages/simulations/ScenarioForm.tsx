import { useState, useEffect, useCallback } from 'react'
import { FlaskConical, CalendarClock, Gauge, CheckCircle, XCircle, Server } from 'lucide-react'
import type {
  Scenario,
  DiscoveredService,
  TimeWindow,
  NodeWithResources,
} from '@/lib/types'
import { getDependencyGraphSnapshot, getNodes, getResilientServices, getServices } from '@/lib/api'
import InfoHint from '@/components/common/InfoHint'
import {
  cn,
  controlInputMutedClass,
  controlLabelClass,
  primaryButtonClass,
} from '@/components/common/uiClassTokens'
import { Combobox, Field, Input, Select, Slider } from '@/components/ui'

// ─── Type helpers ────────────────────────────────────────────────────────────

type LockedScenario = Exclude<Scenario, { type: 'add-service' }>
type LockedScenarioType = LockedScenario['type']
export type AllScenarioType = LockedScenarioType | 'add-service'

const SCENARIO_OPTIONS: ReadonlyArray<{ value: AllScenarioType; label: string }> = [
  { value: 'failure', label: 'Failure / Service Shutdown' },
  { value: 'scale', label: 'Scaling Up / Down' },
  { value: 'add-service', label: 'Add a New Service' },
]

export function isAllScenarioType(value: string): value is AllScenarioType {
  return SCENARIO_OPTIONS.some((o) => o.value === value)
}

// ─── Resource request options ─────────────────────────────────────────────────

const CPU_OPTIONS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 0.1, label: '0.1 cores — very light' },
  { value: 0.25, label: '0.25 cores — light' },
  { value: 0.5, label: '0.5 cores — half a CPU' },
  { value: 1, label: '1 core — one full CPU' },
  { value: 2, label: '2 cores — two CPUs' },
  { value: 4, label: '4 cores — four CPUs' },
]

const RAM_OPTIONS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 64, label: '64 MB — very small' },
  { value: 128, label: '128 MB — small' },
  { value: 256, label: '256 MB — quarter gigabyte' },
  { value: 512, label: '512 MB — half gigabyte' },
  { value: 1024, label: '1 GB' },
  { value: 2048, label: '2 GB' },
  { value: 4096, label: '4 GB' },
]

// ─── Validators ───────────────────────────────────────────────────────────────

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
  if (trimmed.includes(':')) return trimmed
  const labelledMatch = trimmed.match(/^([a-z0-9-]+)\s*\(([^)]+)\)(?:\s*-\s*.*)?$/i)
  if (labelledMatch) {
    const [, serviceName, namespace] = labelledMatch
    if (serviceName && namespace) return `${namespace}:${serviceName}`
  }
  return trimmed
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface ScenarioFormProps {
  readonly onRun: (scenario: Scenario) => void
  readonly loading: boolean
  readonly scenarioType: AllScenarioType
  readonly onScenarioTypeChange: (type: AllScenarioType) => void
  readonly onServiceSelectionChange?: (serviceId: string) => void
  readonly onDepthChange?: (depth: number) => void
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const compactControlClass =
  'neon-focus-ring interactive-soft h-11 w-full rounded-[var(--radius-sm)] border border-[var(--color-emerald-300)]/45 bg-[var(--surface-subtle)] px-4 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] hover:border-[var(--color-emerald-300)] focus:border-[var(--color-emerald-300)]'

const scenarioNeedsSingleTarget = (type: AllScenarioType): boolean =>
  type === 'failure' || type === 'scale'

// ─── Component ────────────────────────────────────────────────────────────────

export default function ScenarioForm({
  onRun,
  loading,
  scenarioType,
  onScenarioTypeChange,
  onServiceSelectionChange,
  onDepthChange,
}: ScenarioFormProps) {
  // ── Shared state ───────────────────────────────────────────────────────────
  const [serviceId, setServiceId] = useState('')
  const [maxDepth, setMaxDepth] = useState(1)
  const [currentPods, setCurrentPods] = useState(3)
  const [newPods, setNewPods] = useState(5)
  const [latencyMetric, setLatencyMetric] = useState<'p50' | 'p95' | 'p99'>('p95')
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('1w')

  // ── Service discovery state ────────────────────────────────────────────────
  const [discoveredServices, setDiscoveredServices] = useState<DiscoveredService[]>([])
  const [servicesLoading, setServicesLoading] = useState(false)
  const [servicesError, setServicesError] = useState<string | null>(null)
  const [servicesNotice, setServicesNotice] = useState<string | null>(null)
  const [servicesStale, setServicesStale] = useState(false)

  // ── Add-service state ──────────────────────────────────────────────────────
  const [addServiceName, setAddServiceName] = useState('')
  const [selectedNodeName, setSelectedNodeName] = useState('')
  const [cpuRequest, setCpuRequest] = useState(0.5)
  const [ramRequest, setRamRequest] = useState(256)
  const [nodes, setNodes] = useState<NodeWithResources[]>([])
  const [nodesLoading, setNodesLoading] = useState(false)
  const [nodesError, setNodesError] = useState<string | null>(null)

  // ── Service discovery ─────────────────────────────────────────────────────
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
      if (err instanceof Error && err.name === 'CanceledError') return
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

  useEffect(() => {
    const controller = new AbortController()
    fetchServices(controller.signal)
    return () => controller.abort()
  }, [fetchServices])

  // ── Node discovery (for add-service) ─────────────────────────────────────
  useEffect(() => {
    if (scenarioType !== 'add-service') return
    const controller = new AbortController()
    setNodesLoading(true)
    setNodesError(null)
    getNodes(controller.signal)
      .then(({ nodes: fetchedNodes }) => {
        if (!controller.signal.aborted) {
          setNodes(fetchedNodes)
          if (fetchedNodes.length > 0 && !selectedNodeName) {
            setSelectedNodeName(fetchedNodes[0].name)
          }
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setNodesError(
            err instanceof Error ? err.message : 'Could not load nodes. Check API connectivity.'
          )
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setNodesLoading(false)
      })
    return () => controller.abort()
  }, [scenarioType]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Context preview sync ──────────────────────────────────────────────────
  useEffect(() => {
    const selected = scenarioNeedsSingleTarget(scenarioType) ? serviceId.trim() : ''
    onServiceSelectionChange?.(selected)
  }, [scenarioType, serviceId, onServiceSelectionChange])

  useEffect(() => {
    onDepthChange?.(maxDepth)
  }, [maxDepth, onDepthChange])

  // ── Service ID validation ─────────────────────────────────────────────────
  const isServiceIdInGraph = (candidateServiceId: string): boolean => {
    if (discoveredServices.length === 0) return true
    return discoveredServices.some((s) => s.serviceId === candidateServiceId.trim())
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

  // ── Add-service resource check ────────────────────────────────────────────
  const selectedNode = nodes.find((n) => n.name === selectedNodeName) ?? null

  const availableCpu = selectedNode
    ? selectedNode.resources.cpu.cores * (1 - selectedNode.resources.cpu.usagePercent / 100)
    : null
  const availableRamMB = selectedNode
    ? selectedNode.resources.ram.totalMB - selectedNode.resources.ram.usedMB
    : null

  const cpuOk = availableCpu !== null && cpuRequest <= availableCpu
  const ramOk = availableRamMB !== null && ramRequest <= availableRamMB
  const resourcesOk = cpuOk && ramOk

  // ── Form validation ───────────────────────────────────────────────────────
  const isValid = (): boolean => {
    if (scenarioType === 'failure') {
      if (!isServiceIdValid(serviceId)) return false
      if (maxDepth < 1 || maxDepth > 3) return false
    }
    if (scenarioType === 'scale') {
      if (!isServiceIdValid(serviceId)) return false
      if (maxDepth < 1 || maxDepth > 3) return false
      if (currentPods < 1 || newPods < 1 || currentPods === newPods) return false
    }
    if (scenarioType === 'add-service') {
      if (!addServiceName.trim()) return false
      if (!selectedNodeName) return false
    }
    return true
  }

  // ── Combobox items ────────────────────────────────────────────────────────
  const serviceIdHint = getServiceIdHint(serviceId)

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

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!isValid()) return

    if (scenarioType === 'failure') {
      onRun({ type: 'failure', serviceId: serviceId.trim(), maxDepth, timeWindow })
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

    if (scenarioType === 'add-service') {
      onRun({
        type: 'add-service',
        serviceName: addServiceName.trim(),
        minCpuCores: cpuRequest,
        minRamMB: ramRequest,
        replicas: 1,
        dependencies: [],
        maxDepth: 1,
        timeWindow,
      })
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Scenario type */}
      <div>
        <label htmlFor="scenarioType" className={controlLabelClass}>
          Scenario Type
        </label>
        <Select
          id="scenarioType"
          value={scenarioType}
          onChange={(e) => {
            const next = e.target.value
            if (isAllScenarioType(next)) onScenarioTypeChange(next)
          }}
          className={controlInputMutedClass}
          suffixIcon={<FlaskConical className="h-4 w-4" />}
        >
          {SCENARIO_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>

      {/* Decision time period (all scenarios) */}
      <div>
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

      {/* ── Failure / Scale: single-target service picker ── */}
      {scenarioNeedsSingleTarget(scenarioType) && (
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
                {servicesLoading && (
                  <span className="ml-2 text-xs text-blue-400">Loading services...</span>
                )}
                {!servicesLoading && discoveredServices.length > 0 && (
                  <span className="ml-2 text-xs text-[var(--text-secondary)]">
                    {discoveredServices.length} service
                    {discoveredServices.length === 1 ? '' : 's'} available
                    {servicesStale && (
                      <span className="ml-1 text-amber-600">(stale source)</span>
                    )}
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
      )}

      {/* ── Impact range slider (failure + scale) ── */}
      {(scenarioType === 'failure' || scenarioType === 'scale') && (
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

      {/* ── Scale: pod counts + latency metric ── */}
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

      {/* ── Add a New Service fields ── */}
      {scenarioType === 'add-service' && (
        <div className="space-y-4">
          {/* Service name */}
          <div>
            <label htmlFor="addServiceName" className={controlLabelClass}>
              New Service Name
              <span className="ml-1 align-middle">
                <InfoHint text="Give your new service a name. This helps identify it in the cluster. Use lowercase letters and dashes only (e.g. my-api-service)." />
              </span>
            </label>
            <Input
              id="addServiceName"
              type="text"
              placeholder="e.g. my-api-service"
              value={addServiceName}
              onChange={(e) => setAddServiceName(e.target.value)}
              className={compactControlClass}
            />
          </div>

          {/* Deploy to node */}
          <div>
            <label htmlFor="selectedNode" className={controlLabelClass}>
              Deploy to Node
              <span className="ml-1 align-middle">
                <InfoHint text="Choose which server (node) you want to run this service on. Each node has a limited amount of CPU power and memory. The list is loaded live from your cluster." />
              </span>
              {nodesLoading && (
                <span className="ml-2 text-xs text-blue-400">Loading nodes...</span>
              )}
              {!nodesLoading && nodes.length > 0 && (
                <span className="ml-2 text-xs text-[var(--text-secondary)]">
                  {nodes.length} node{nodes.length === 1 ? '' : 's'} available
                </span>
              )}
            </label>
            {nodesError ? (
              <p className="rounded border border-rose-500/50 bg-rose-500/10 p-2 text-xs text-[var(--text-primary)]">
                {nodesError}
              </p>
            ) : (
              <Select
                id="selectedNode"
                value={selectedNodeName}
                onChange={(e) => setSelectedNodeName(e.target.value)}
                className={controlInputMutedClass}
                suffixIcon={<Server className="h-4 w-4" />}
                disabled={nodesLoading || nodes.length === 0}
              >
                {nodes.length === 0 && (
                  <option value="">No nodes available</option>
                )}
                {nodes.map((node) => {
                  const cpuPct = node.resources.cpu.usagePercent.toFixed(0)
                  const ramPct = node.resources.ram.totalMB > 0
                    ? ((node.resources.ram.usedMB / node.resources.ram.totalMB) * 100).toFixed(0)
                    : '0'
                  return (
                    <option key={node.name} value={node.name}>
                      {node.name} — CPU {cpuPct}% used, RAM {ramPct}% used
                    </option>
                  )
                })}
              </Select>
            )}
          </div>

          {/* CPU request */}
          <div>
            <label htmlFor="cpuRequest" className={controlLabelClass}>
              CPU Needed
              <span className="ml-1 align-middle">
                <InfoHint text="How much CPU power your new service needs to run. More complex services need more CPU. If you're unsure, start with 0.5 cores." />
              </span>
            </label>
            <Select
              id="cpuRequest"
              value={cpuRequest}
              onChange={(e) => setCpuRequest(Number(e.target.value))}
              className={controlInputMutedClass}
            >
              {CPU_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </div>

          {/* RAM request */}
          <div>
            <label htmlFor="ramRequest" className={controlLabelClass}>
              Memory (RAM) Needed
              <span className="ml-1 align-middle">
                <InfoHint text="How much memory your service needs. Memory is like a workspace — the more your service does at once, the more it needs. 256 MB is a good starting point for small services." />
              </span>
            </label>
            <Select
              id="ramRequest"
              value={ramRequest}
              onChange={(e) => setRamRequest(Number(e.target.value))}
              className={controlInputMutedClass}
            >
              {RAM_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </div>

          {/* Real-time resource check */}
          {selectedNode && (
            <div
              className={cn(
                'rounded-xl border-2 p-4',
                resourcesOk
                  ? 'border-emerald-500/60 bg-emerald-500/10'
                  : 'border-rose-500/60 bg-rose-500/10'
              )}
            >
              <div className="mb-3 flex items-center gap-2">
                {resourcesOk ? (
                  <CheckCircle className="h-5 w-5 shrink-0 text-emerald-600" />
                ) : (
                  <XCircle className="h-5 w-5 shrink-0 text-rose-600" />
                )}
                <p className="text-sm font-bold text-[var(--text-primary)]">
                  {resourcesOk
                    ? 'This node has enough room for your service'
                    : 'Not enough resources on this node'}
                </p>
              </div>

              <div className="space-y-2 text-xs">
                {/* CPU row */}
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[var(--text-secondary)]">CPU</span>
                  <span
                    className={cn(
                      'font-semibold',
                      cpuOk ? 'text-emerald-600' : 'text-rose-600'
                    )}
                  >
                    {cpuOk
                      ? `${availableCpu!.toFixed(2)} cores free — enough`
                      : `Needs ${cpuRequest} cores, only ${availableCpu!.toFixed(2)} free`}
                  </span>
                </div>
                {/* RAM row */}
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[var(--text-secondary)]">Memory</span>
                  <span
                    className={cn(
                      'font-semibold',
                      ramOk ? 'text-emerald-600' : 'text-rose-600'
                    )}
                  >
                    {ramOk
                      ? `${(availableRamMB! / 1024).toFixed(1)} GB free — enough`
                      : `Needs ${ramRequest >= 1024 ? (ramRequest / 1024).toFixed(1) + ' GB' : ramRequest + ' MB'}, only ${(availableRamMB! / 1024).toFixed(1)} GB free`}
                  </span>
                </div>
              </div>

              <p className="mt-3 text-xs text-[var(--text-secondary)]">
                {resourcesOk
                  ? 'Click Run Simulation below to get a full analysis of placement, dependencies, and risk.'
                  : 'Try selecting a different node, or request less CPU / RAM for your service.'}
              </p>
            </div>
          )}
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
