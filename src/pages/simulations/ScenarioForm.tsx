import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  FlaskConical,
  CalendarClock,
  Gauge,
  CheckCircle,
  XCircle,
  Server,
  Plus,
  Trash2,
  Workflow,
} from 'lucide-react'
import type { Scenario, DiscoveredService, TimeWindow, NodeWithResources } from '@/lib/types'
import { getDependencyGraphSnapshot, getNodes, getResilientServices, getServices } from '@/lib/api'
import InfoHint from '@/components/common/InfoHint'
import {
  cn,
  controlInputMutedClass,
  controlLabelClass,
  primaryButtonClass,
  secondaryButtonClass,
} from '@/components/common/uiClassTokens'
import { Combobox, Field, Input, Select, Slider } from '@/components/ui'
import {
  buildDependencyChainPayload,
  buildDependencyChainPreview,
  getDependencyChainErrors,
  getLiveServiceIdHint,
  normalizeLiveServiceInput,
} from './addServiceHelpers'

type LockedScenario = Exclude<Scenario, { type: 'add-service' }>
type LockedScenarioType = LockedScenario['type']
export type AllScenarioType = LockedScenarioType | 'add-service'

const SCENARIO_OPTIONS: ReadonlyArray<{ value: AllScenarioType; label: string }> = [
  { value: 'failure', label: 'Failure / Service Shutdown' },
  { value: 'scale', label: 'Scaling Up / Down' },
  { value: 'add-service', label: 'Add a New Service' },
]

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

interface ScenarioFormProps {
  readonly onRun: (scenario: Scenario) => void
  readonly loading: boolean
  readonly scenarioType: AllScenarioType
  readonly onScenarioTypeChange: (type: AllScenarioType) => void
  readonly onServiceSelectionChange?: (serviceId: string) => void
  readonly onDepthChange?: (depth: number) => void
}

const compactControlClass =
  'neon-focus-ring interactive-soft h-11 w-full rounded-[var(--radius-sm)] border border-[var(--color-emerald-300)]/45 bg-[var(--surface-subtle)] px-4 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] hover:border-[var(--color-emerald-300)] focus:border-[var(--color-emerald-300)]'

const scenarioNeedsSingleTarget = (type: AllScenarioType): boolean =>
  type === 'failure' || type === 'scale'

function isAllScenarioType(value: string): value is AllScenarioType {
  return SCENARIO_OPTIONS.some((option) => option.value === value)
}

export default function ScenarioForm({
  onRun,
  loading,
  scenarioType,
  onScenarioTypeChange,
  onServiceSelectionChange,
  onDepthChange,
}: ScenarioFormProps) {
  const [serviceId, setServiceId] = useState('')
  const [maxDepth, setMaxDepth] = useState(1)
  const [currentPods, setCurrentPods] = useState(3)
  const [newPods, setNewPods] = useState(5)
  const [latencyMetric, setLatencyMetric] = useState<'p50' | 'p95' | 'p99'>('p95')
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('1w')

  const [discoveredServices, setDiscoveredServices] = useState<DiscoveredService[]>([])
  const [servicesLoading, setServicesLoading] = useState(false)
  const [servicesError, setServicesError] = useState<string | null>(null)
  const [servicesNotice, setServicesNotice] = useState<string | null>(null)
  const [servicesStale, setServicesStale] = useState(false)

  const [addServiceName, setAddServiceName] = useState('')
  const [selectedNodeName, setSelectedNodeName] = useState('')
  const [cpuRequest, setCpuRequest] = useState(0.5)
  const [ramRequest, setRamRequest] = useState(256)
  const [dependencyChain, setDependencyChain] = useState<string[]>([])
  const [nodes, setNodes] = useState<NodeWithResources[]>([])
  const [nodesLoading, setNodesLoading] = useState(false)
  const [nodesError, setNodesError] = useState<string | null>(null)

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
      const sourcesAreStale = Boolean(serviceResponse?.stale || graphSnapshot?.metadata?.stale)

      setDiscoveredServices(resilientServices)
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
    } catch (error) {
      if (error instanceof Error && error.name === 'CanceledError') return

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

  useEffect(() => {
    if (scenarioType !== 'add-service') return

    const controller = new AbortController()
    setNodesLoading(true)
    setNodesError(null)

    getNodes(controller.signal)
      .then(({ nodes: fetchedNodes }) => {
        if (controller.signal.aborted) return

        setNodes(fetchedNodes)
        if (fetchedNodes.length === 0) {
          setSelectedNodeName('')
          return
        }

        const selectedStillExists = fetchedNodes.some((node) => node.name === selectedNodeName)
        if (!selectedStillExists) {
          setSelectedNodeName(fetchedNodes[0].name)
        }
      })
      .catch((error) => {
        if (controller.signal.aborted) return
        setNodesError(
          error instanceof Error ? error.message : 'Could not load nodes. Check API connectivity.'
        )
      })
      .finally(() => {
        if (!controller.signal.aborted) setNodesLoading(false)
      })

    return () => controller.abort()
  }, [scenarioType, selectedNodeName])

  useEffect(() => {
    const selected = scenarioNeedsSingleTarget(scenarioType) ? serviceId.trim() : ''
    onServiceSelectionChange?.(selected)
  }, [scenarioType, serviceId, onServiceSelectionChange])

  useEffect(() => {
    onDepthChange?.(maxDepth)
  }, [maxDepth, onDepthChange])

  const discoveredServiceIdSet = useMemo(
    () => new Set(discoveredServices.map((service) => service.serviceId)),
    [discoveredServices]
  )

  const serviceIdHint = getLiveServiceIdHint(serviceId, discoveredServiceIdSet)
  const dependencyErrors = getDependencyChainErrors(dependencyChain, discoveredServiceIdSet)
  const hasDependencyErrors = dependencyErrors.some(Boolean)

  const selectedNode = nodes.find((node) => node.name === selectedNodeName) ?? null
  const availableCpu = selectedNode
    ? selectedNode.resources.cpu.cores * (1 - selectedNode.resources.cpu.usagePercent / 100)
    : null
  const availableRamMB = selectedNode
    ? selectedNode.resources.ram.totalMB - selectedNode.resources.ram.usedMB
    : null

  const cpuOk = availableCpu !== null && cpuRequest <= availableCpu
  const ramOk = availableRamMB !== null && ramRequest <= availableRamMB
  const resourcesOk = cpuOk && ramOk

  const serviceComboboxItems = useMemo(
    () =>
      discoveredServices.map((service) => {
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
      }),
    [discoveredServices]
  )

  const commonServiceHelperText =
    servicesNotice ||
    (!servicesLoading && discoveredServices.length === 0 && !servicesError
      ? 'No live services are currently discoverable. Enter a service as namespace:name or verify the configured workload namespace.'
      : undefined)

  const chainPreview = useMemo(
    () => buildDependencyChainPreview(addServiceName, dependencyChain),
    [addServiceName, dependencyChain]
  )

  const isValid = (): boolean => {
    if (scenarioType === 'failure') {
      return !serviceIdHint && maxDepth >= 1 && maxDepth <= 3
    }
    if (scenarioType === 'scale') {
      return (
        !serviceIdHint &&
        maxDepth >= 1 &&
        maxDepth <= 3 &&
        currentPods >= 1 &&
        newPods >= 1 &&
        currentPods !== newPods
      )
    }
    if (scenarioType === 'add-service') {
      return Boolean(addServiceName.trim()) && Boolean(selectedNodeName) && !hasDependencyErrors
    }
    return true
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
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

    onRun({
      type: 'add-service',
      serviceName: addServiceName.trim(),
      targetNodeName: selectedNodeName,
      minCpuCores: cpuRequest,
      minRamMB: ramRequest,
      replicas: 1,
      dependencies: buildDependencyChainPayload(dependencyChain),
      maxDepth: 1,
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
          onChange={(event) => {
            const next = event.target.value
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

      <div>
        <label htmlFor="timeWindow" className={controlLabelClass}>
          Decision Time Period
        </label>
        <Select
          id="timeWindow"
          value={timeWindow}
          onChange={(event) => setTimeWindow(event.target.value as TimeWindow)}
          className={controlInputMutedClass}
          suffixIcon={<CalendarClock className="h-4 w-4" />}
        >
          <option value="5d">5 Days</option>
          <option value="1w">1 Week</option>
          <option value="2w">2 Weeks</option>
          <option value="1m">1 Month</option>
        </Select>
      </div>

      {scenarioNeedsSingleTarget(scenarioType) && (
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
            onChange={(event) => setServiceId(normalizeLiveServiceInput(event.target.value))}
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
      )}

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
            onChange={(event) => setMaxDepth(Number(event.target.value))}
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
                onChange={(event) => setCurrentPods(Number(event.target.value))}
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
                onChange={(event) => setNewPods(Number(event.target.value))}
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
              onChange={(event) => setLatencyMetric(event.target.value as 'p50' | 'p95' | 'p99')}
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

      {scenarioType === 'add-service' && (
        <div className="space-y-4">
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
              onChange={(event) => setAddServiceName(event.target.value)}
              className={compactControlClass}
            />
          </div>

          <div>
            <label htmlFor="selectedNode" className={controlLabelClass}>
              Deploy to Node
              <span className="ml-1 align-middle">
                <InfoHint text="Choose which server (node) you want to run this service on. Placement is scored per node, not from a shared machine pool." />
              </span>
              {nodesLoading && <span className="ml-2 text-xs text-blue-400">Loading nodes...</span>}
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
                onChange={(event) => setSelectedNodeName(event.target.value)}
                className={controlInputMutedClass}
                suffixIcon={<Server className="h-4 w-4" />}
                disabled={nodesLoading || nodes.length === 0}
              >
                {nodes.length === 0 && <option value="">No nodes available</option>}
                {nodes.map((node) => {
                  const cpuPct = node.resources.cpu.usagePercent.toFixed(0)
                  const ramPct =
                    node.resources.ram.totalMB > 0
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

          <div>
            <label htmlFor="cpuRequest" className={controlLabelClass}>
              CPU Needed
              <span className="ml-1 align-middle">
                <InfoHint text="How much CPU power your new service needs to run. If you're unsure, start with 0.5 cores." />
              </span>
            </label>
            <Select
              id="cpuRequest"
              value={cpuRequest}
              onChange={(event) => setCpuRequest(Number(event.target.value))}
              className={controlInputMutedClass}
            >
              {CPU_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label htmlFor="ramRequest" className={controlLabelClass}>
              Memory (RAM) Needed
              <span className="ml-1 align-middle">
                <InfoHint text="How much memory your service needs. 256 MB is a good starting point for a small service." />
              </span>
            </label>
            <Select
              id="ramRequest"
              value={ramRequest}
              onChange={(event) => setRamRequest(Number(event.target.value))}
              className={controlInputMutedClass}
            >
              {RAM_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-solid)] p-4">
            <div className="mb-3">
              <p className="text-sm font-semibold text-[var(--text-primary)]">Dependency Chain</p>
              <button
                type="button"
                onClick={() => setDependencyChain((current) => [...current, ''])}
                className={cn(secondaryButtonClass, 'mt-3 inline-flex w-full items-center justify-center gap-2 px-3 py-2')}
              >
                <Plus className="h-4 w-4" />
                Add dependency
              </button>
            </div>

            {dependencyChain.length === 0 ? (
              <p className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface-soft)] px-3 py-4 text-xs text-[var(--text-secondary)]">
                No dependency chain yet. Add one or more existing services if the new service relies
                on them.
              </p>
            ) : (
              <div className="space-y-3">
                {dependencyChain.map((value, index) => (
                  <Field
                    key={`dependency-${index}`}
                    id={`dependency-${index}`}
                    label={`Dependency ${index + 1}`}
                    helperText={
                      dependencyErrors[index]
                        ? dependencyErrors[index]
                        : index === 0
                          ? 'First hop called directly by the new service.'
                          : 'This service is evaluated as the next hop in the chain.'
                    }
                    helperClassName={cn(
                      dependencyErrors[index] ? 'text-amber-600' : 'text-[var(--text-dim)]'
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex-1">
                        <Combobox
                          id={`dependency-${index}`}
                          value={value}
                          onChange={(event) => {
                            const nextValue = normalizeLiveServiceInput(event.target.value)
                            setDependencyChain((current) =>
                              current.map((entry, entryIndex) =>
                                entryIndex === index ? nextValue : entry
                              )
                            )
                          }}
                          items={serviceComboboxItems}
                          placeholder="Select or type service..."
                          className={cn(
                            compactControlClass,
                            dependencyErrors[index] && 'border-amber-500/70'
                          )}
                          aria-label={`Dependency ${index + 1}`}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setDependencyChain((current) =>
                            current.filter((_, entryIndex) => entryIndex !== index)
                          )
                        }
                        className={cn(
                          secondaryButtonClass,
                          'inline-flex h-11 items-center justify-center px-3'
                        )}
                        aria-label={`Remove dependency ${index + 1}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </Field>
                ))}
              </div>
            )}

            <div className="mt-4 rounded-lg border border-emerald-500/25 bg-emerald-500/10 p-3">
              <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                <Workflow className="h-4 w-4 text-emerald-600" />
                Chain Preview
              </div>
              <p className="text-xs text-[var(--text-secondary)]">
                {chainPreview.length > 0
                  ? chainPreview.join(' → ')
                  : 'Add a service name to preview the chain.'}
              </p>
              {commonServiceHelperText && (
                <p className="mt-2 text-xs text-[var(--text-dim)]">{commonServiceHelperText}</p>
              )}
            </div>
          </div>

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
                    : 'This node is currently short on resources'}
                </p>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[var(--text-secondary)]">CPU</span>
                  <span
                    className={cn('font-semibold', cpuOk ? 'text-emerald-600' : 'text-rose-600')}
                  >
                    {cpuOk
                      ? `${availableCpu!.toFixed(2)} cores free — enough`
                      : `Needs ${cpuRequest} cores, only ${availableCpu!.toFixed(2)} free`}
                  </span>
                </div>
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[var(--text-secondary)]">Memory</span>
                  <span
                    className={cn('font-semibold', ramOk ? 'text-emerald-600' : 'text-rose-600')}
                  >
                    {ramOk
                      ? `${(availableRamMB! / 1024).toFixed(1)} GB free — enough`
                      : `Needs ${ramRequest >= 1024 ? `${(ramRequest / 1024).toFixed(1)} GB` : `${ramRequest} MB`}, only ${(availableRamMB! / 1024).toFixed(1)} GB free`}
                  </span>
                </div>
              </div>

              <p className="mt-3 text-xs text-[var(--text-secondary)]">
                {resourcesOk
                  ? 'The backend will still rank every node individually and suggest a better node if it preserves more headroom.'
                  : 'Run the simulation anyway to compare this node against the rest of the cluster and get a fallback recommendation.'}
              </p>
            </div>
          )}

          {nodes.length > 0 && (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-4">
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                Node Resources
                <span className="ml-2 text-xs font-normal text-[var(--text-secondary)]">
                  {nodes.length} node{nodes.length === 1 ? '' : 's'}
                </span>
              </p>
              <div className="mt-3 space-y-3">
                {nodes.map((node) => {
                  const nodeCpuUsed = node.resources.cpu.cores * (node.resources.cpu.usagePercent / 100)
                  const nodeCpuFree = Math.max(0, node.resources.cpu.cores - nodeCpuUsed)
                  const nodeRamFree = Math.max(0, node.resources.ram.totalMB - node.resources.ram.usedMB)
                  return (
                    <div key={node.name} className="rounded-lg border border-[var(--border)] bg-[var(--surface-solid)] p-3">
                      <p className="text-xs font-semibold text-[var(--text-primary)]">{node.name}</p>
                      <div className="mt-2 space-y-1 text-xs text-[var(--text-secondary)]">
                        <div className="flex items-start justify-between gap-2">
                          <span>CPU</span>
                          <span className="font-semibold text-[var(--text-primary)]">
                            {nodeCpuFree.toFixed(2)} free of {node.resources.cpu.cores} cores
                          </span>
                        </div>
                        <div className="flex items-start justify-between gap-2">
                          <span>Memory</span>
                          <span className="font-semibold text-[var(--text-primary)]">
                            {(nodeRamFree / 1024).toFixed(1)} GB free of{' '}
                            {(node.resources.ram.totalMB / 1024).toFixed(1)} GB
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
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
