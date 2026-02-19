import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router'
import { RefreshCw, Activity, Settings, Zap, Heart, Globe, Clock, ShieldCheck, BarChart3, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import PageHeader from '@/components/layout/PageHeader'
import Section from '@/components/layout/Section'
import EmptyState from '@/components/layout/EmptyState'
import MetricHighlightCard from '@/components/layout/MetricHighlightCard'
import SkeletonBlock from '@/components/common/SkeletonBlock'
import InfoHint from '@/components/common/InfoHint'
import {
  cn,
  controlInputDarkClass,
  controlLabelCompactClass,
  loadingCardClass,
  subtleIconButtonClass,
  tableActionLinkClass,
  tableBodyRowClass,
  tableCellClass,
  tableHeadRowClass,
  tableHeadStickyClass,
  tableHeaderCellClass,
  tableShellClass,
} from '@/components/common/uiClassTokens'
import { Select } from '@/components/ui'
import TimeSeriesLineChart from '@/components/charts/TimeSeriesLineChart'
import LatencyMultiLineChart from '@/components/charts/LatencyMultiLineChart'
import {
  getDependencyGraphSnapshot,
  getResilientServices,
  getSeededServices,
  getSimulationOutcomesMetrics,
  getTelemetryMetrics,
  getServices,
} from '@/lib/api'
import { formatRps, formatPercent, formatMs } from '@/lib/format'
import { calculateServiceRisk } from '@/lib/risk'
import type { DiscoveredService, SimulationMetricsResponse, TelemetryDatapoint, TelemetryMetricsResponse } from '@/lib/types'
import { useGraphStream } from '@/lib/useGraphStream'

// High-level "Kid-Friendly" / Executive labels
const METRIC_LABELS = {
  requestRate: {
    label: 'Traffic Volume',
    desc: 'How many requests are coming in right now?',
    icon: Globe,
    color: 'text-blue-400',
    unit: 'req/sec'
  },
  errorRate: {
    label: 'System Health',
    desc: 'Percentage of successful requests (Health Score)',
    icon: Heart,
    color: 'text-rose-400',
    unit: '%'
  },
  p95: {
    label: 'Speed (Response Time)',
    desc: 'How fast are we answering requests?',
    icon: Zap,
    color: 'text-amber-400',
    unit: 'ms'
  },
  availability: {
    label: 'Uptime Reliability',
    desc: 'Is the system actually online?',
    icon: ShieldCheck,
    color: 'text-emerald-400',
    unit: '%'
  }
}

function toFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function toTimestampMs(value: string): number {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY
}

function average(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

interface ChartPanelProps {
  readonly icon: React.ComponentType<{ className?: string }>
  readonly iconWrapperClassName: string
  readonly iconClassName: string
  readonly title: string
  readonly tooltip?: string
  readonly children: React.ReactNode
}

function ChartPanel({
  icon: Icon,
  iconWrapperClassName,
  iconClassName,
  title,
  tooltip,
  children,
}: ChartPanelProps) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-4">
      <div className="mb-4 flex items-center gap-2">
        <div className={`rounded-lg p-2 ${iconWrapperClassName}`}>
          <Icon className={`h-4 w-4 ${iconClassName}`} />
        </div>
        <h3 className="font-semibold text-[var(--text-primary)]">
          {title}
          {tooltip ? (
            <span className="ml-1 inline-flex align-middle">
              <InfoHint text={tooltip} />
            </span>
          ) : null}
        </h3>
      </div>
      {children}
    </div>
  )
}

export default function Metrics() {
  const navigate = useNavigate()
  const [selectedServiceId, setSelectedServiceId] = useState('')
  const [timeRange, setTimeRange] = useState('1h')
  const [data, setData] = useState<TelemetryMetricsResponse | null>(null)
  const [simulationMetrics, setSimulationMetrics] = useState<SimulationMetricsResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [services, setServices] = useState<DiscoveredService[]>([])
  const [servicesNotice, setServicesNotice] = useState<string | null>(null)
  const { lastUpdated } = useGraphStream()

  const getTimeRangeMs = useCallback((range: string): number => {
    const units: Record<string, number> = {
      '30s': 30 * 1000,
      '1m': 60 * 1000,
      '5m': 5 * 60 * 1000,
      '15m': 15 * 60 * 1000,
      '30m': 30 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      '6h': 6 * 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
    }
    return units[range] || units['1h']
  }, [])

  const fetchData = useCallback(async (background = false) => {
    if (!background) setLoading(true)

    try {
      const now = new Date()
      const from = new Date(now.getTime() - getTimeRangeMs(timeRange))
      const serviceNameForQuery = selectedServiceId
        ? selectedServiceId.split(':').slice(1).join(':') || selectedServiceId
        : ''

      const [telemetryResult, simulationResult] = await Promise.all([
        getTelemetryMetrics({
          service: serviceNameForQuery,
          from: from.toISOString(),
          to: now.toISOString(),
          step: 60,
        }),
        getSimulationOutcomesMetrics('7d').catch(() => null),
      ])

      setData(telemetryResult)
      if (simulationResult) {
        setSimulationMetrics(simulationResult)
      }
    } catch (err) {
      console.error('Fetch error:', err)
      if (!background) {
        toast.error(err instanceof Error ? err.message : 'Failed to fetch telemetry data')
      }
    } finally {
      if (!background) setLoading(false)
    }
  }, [getTimeRangeMs, selectedServiceId, timeRange])

  useEffect(() => {
    const fetchServices = async () => {
      try {
        const [serviceResponse, graphSnapshot] = await Promise.all([
          getServices().catch(() => null),
          getDependencyGraphSnapshot().catch(() => null),
        ])

        const graphServices: DiscoveredService[] = (graphSnapshot?.nodes ?? [])
          .filter((node) => Boolean(node.name))
          .map((node) => ({
            serviceId: `${node.namespace || 'default'}:${node.name}`,
            name: node.name,
            namespace: node.namespace || 'default',
            podCount: typeof node.podCount === 'number' ? node.podCount : undefined,
            availability: typeof node.availability === 'number' ? node.availability : undefined,
          }))

        const mergedServices = getResilientServices(
          [...(serviceResponse?.services ?? []), ...graphServices],
          { includeSeeded: false }
        )
        setServices(mergedServices)

        if (serviceResponse?.stale || graphSnapshot?.metadata?.stale) {
          setServicesNotice('Service list is stale. Showing latest available snapshot.')
        } else {
          setServicesNotice(null)
        }
      } catch {
        setServices(getResilientServices([], { includeSeeded: false }))
        setServicesNotice('Live service list unavailable. Live options are cached; demo options are listed separately.')
      }
    }
    fetchServices()
  }, [])

  useEffect(() => {
    fetchData(false)
  }, [fetchData])

  useEffect(() => {
    if (!lastUpdated) return
    fetchData(true)
  }, [lastUpdated, fetchData])

  const sortedDatapoints = useMemo((): TelemetryDatapoint[] => {
    const datapoints = data?.datapoints ?? []
    return datapoints
      .map((point, index) => ({
        point,
        index,
        timestampMs: Date.parse(point.timestamp),
      }))
      .sort((a, b) => {
        const aIsValid = Number.isFinite(a.timestampMs)
        const bIsValid = Number.isFinite(b.timestampMs)
        if (aIsValid && bIsValid) {
          return a.timestampMs - b.timestampMs || a.index - b.index
        }
        if (aIsValid) return -1
        if (bIsValid) return 1
        return a.index - b.index
      })
      .map(({ point }) => point)
  }, [data?.datapoints])

  // Latest datapoint per service in the selected window.
  const latestPerService = useMemo((): TelemetryDatapoint[] => {
    if (sortedDatapoints.length === 0) return []

    const byService = new Map<string, TelemetryDatapoint>()
    for (const point of sortedDatapoints) {
      const key = `${point.namespace}:${point.service}`
      const previous = byService.get(key)
      if (!previous || toTimestampMs(point.timestamp) >= toTimestampMs(previous.timestamp)) {
        byService.set(key, point)
      }
    }

    return Array.from(byService.values())
  }, [sortedDatapoints])

  // Summary cards: global mode aggregates latest per service; service mode reflects selected scope.
  const summaryStats = useMemo(() => {
    if (latestPerService.length === 0) return null

    const requestRates = latestPerService
      .map((point) => toFiniteNumber(point.requestRate))
      .filter((value): value is number => value !== null)
    const requestRate = requestRates.length
      ? requestRates.reduce((sum, value) => sum + value, 0)
      : null

    const weightedErrorPairs = latestPerService
      .map((point) => {
        const rate = toFiniteNumber(point.requestRate)
        const error = toFiniteNumber(point.errorRate)
        if (rate === null || error === null || rate <= 0) return null
        return { rate, error }
      })
      .filter((pair): pair is { rate: number; error: number } => pair !== null)

    const weightedRateTotal = weightedErrorPairs.reduce((sum, pair) => sum + pair.rate, 0)
    const weightedErrorSum = weightedErrorPairs.reduce((sum, pair) => sum + pair.rate * pair.error, 0)
    const fallbackErrorAvg = average(
      latestPerService
        .map((point) => toFiniteNumber(point.errorRate))
        .filter((value): value is number => value !== null)
    )
    const errorRate = weightedRateTotal > 0
      ? weightedErrorSum / weightedRateTotal
      : fallbackErrorAvg

    const p95Values = latestPerService
      .map((point) => toFiniteNumber(point.p95))
      .filter((value): value is number => value !== null)
    const p95 = p95Values.length ? Math.max(...p95Values) : null

    const availabilityValues = latestPerService
      .map((point) => toFiniteNumber((point as { availability?: unknown }).availability))
      .filter((value): value is number => value !== null)
    const availability = average(availabilityValues)

    return {
      requestRate,
      healthScore: errorRate === null ? null : 100 - errorRate,
      errorRate,
      p95,
      availability,
      isGlobalScope: selectedServiceId === '',
      servicesInScope: latestPerService.length,
    }
  }, [latestPerService, selectedServiceId])

  const systemStatus = useMemo(() => {
    if (latestPerService.length === 0) return []

    return latestPerService
      .map((point) => {
        const availability = toFiniteNumber((point as { availability?: unknown }).availability)
        return {
          ...point,
          risk: calculateServiceRisk(point.service, point.namespace, {
            ...point,
            availability: availability ?? Number.NaN,
          }),
        }
      })
      .sort((a, b) => b.errorRate - a.errorRate)
      .slice(0, 10)
  }, [latestPerService])

  const getDisplayUptime = useCallback((point: TelemetryDatapoint): number | null => {
    return toFiniteNumber((point as { availability?: unknown }).availability)
  }, [])

  const focusOptionGroups = useMemo((): {
    liveOptions: DiscoveredService[]
    demoSeededOptions: DiscoveredService[]
  } => {
    const telemetryServices: DiscoveredService[] = sortedDatapoints.map((point) => ({
      serviceId: `${point.namespace}:${point.service}`,
      name: point.service,
      namespace: point.namespace,
    }))
    const liveOptions = getResilientServices([...services, ...telemetryServices], { includeSeeded: false })
    const liveServiceIds = new Set(liveOptions.map((service) => service.serviceId))
    const demoSeededOptions = getSeededServices().filter((service) => !liveServiceIds.has(service.serviceId))
    return { liveOptions, demoSeededOptions }
  }, [sortedDatapoints, services])

  const latencySeries = useMemo(
    () =>
      sortedDatapoints.map((d) => ({
        timestamp: d.timestamp,
        p50: toFiniteNumber((d as { p50?: unknown }).p50) ?? undefined,
        p95: toFiniteNumber(d.p95) ?? undefined,
        p99: toFiniteNumber((d as { p99?: unknown }).p99) ?? undefined,
      })),
    [sortedDatapoints]
  )

  const hasP50Data = useMemo(
    () => latencySeries.some((point) => typeof point.p50 === 'number'),
    [latencySeries]
  )
  const hasP99Data = useMemo(
    () => latencySeries.some((point) => typeof point.p99 === 'number'),
    [latencySeries]
  )

  const availabilitySeries = useMemo(
    () =>
      sortedDatapoints
        .map((point) => ({
          timestamp: point.timestamp,
          value: toFiniteNumber((point as { availability?: unknown }).availability),
        }))
        .filter((point): point is { timestamp: string; value: number } => point.value !== null),
    [sortedDatapoints]
  )

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <PageHeader
        title="Mission Control Metrics"
        description="High-level overview of system vital signs"
        icon={Activity}
      />

      {/* Controls */}
      <div className="surface-glass rounded-[var(--radius-md)] border border-[var(--border)] p-4">
        <div className="flex items-end gap-4">
          <div className="flex-1">
            <label htmlFor="service-select" className={controlLabelCompactClass}>
              Focus Area (Service)
            </label>
            <Select
              id="service-select"
              value={selectedServiceId}
              onChange={(e) => setSelectedServiceId(e.target.value)}
              className={controlInputDarkClass}
              suffixIcon={<Settings className="h-4 w-4" />}
            >
              <option value="">Entire System (Global)</option>
              {focusOptionGroups.liveOptions.length > 0 && (
                <optgroup label="Live services">
                  {focusOptionGroups.liveOptions.map((service) => (
                    <option key={`${service.namespace}/${service.name}`} value={service.serviceId}>
                      {service.name} ({service.namespace})
                    </option>
                  ))}
                </optgroup>
              )}
              {focusOptionGroups.demoSeededOptions.length > 0 && (
                <optgroup label="Demo dataset (seeded)">
                  {focusOptionGroups.demoSeededOptions.map((service) => (
                    <option key={`demo-${service.namespace}/${service.name}`} value={service.serviceId}>
                      {service.name} ({service.namespace})
                    </option>
                  ))}
                </optgroup>
              )}
            </Select>
          </div>
          <div className="flex-1">
            <label htmlFor="time-range-select" className={controlLabelCompactClass}>
              Time Horizon
            </label>
            <Select
              id="time-range-select"
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className={controlInputDarkClass}
              suffixIcon={<Clock className="h-4 w-4" />}
            >
              <option value="5m">Last 5 minutes (Real-time)</option>
              <option value="15m">Last 15 minutes</option>
              <option value="1h">Last 1 hour</option>
              <option value="6h">Last 6 hours</option>
              <option value="24h">Last 24 hours</option>
            </Select>
          </div>
          <button type="button"
            onClick={() => fetchData(false)}
            disabled={loading}
            className={cn(subtleIconButtonClass)}
            title="Refresh Vital Signs"
            aria-label="Refresh metrics"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        {servicesNotice && (
          <p className="mt-2 text-xs text-[var(--text-muted)]">{servicesNotice}</p>
        )}
        {focusOptionGroups.demoSeededOptions.length > 0 && (
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Seeded `default:*` services are isolated under the demo section and excluded from live scope.
          </p>
        )}
      </div>

      {/* Vital Signs Cards */}
      {summaryStats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <MetricHighlightCard
            label={METRIC_LABELS.requestRate.label}
            description={METRIC_LABELS.requestRate.desc}
            icon={METRIC_LABELS.requestRate.icon}
            value={formatRps(summaryStats.requestRate)}
            valueClassName="text-[var(--text-primary)]"
            tone="blue"
            note={
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                {summaryStats.isGlobalScope
                  ? `Aggregate: SUM of latest request rate across ${summaryStats.servicesInScope} services`
                  : 'Scope: selected service(s) latest datapoint'}
              </p>
            }
            tooltip="How many requests are reaching the system each second. Global mode uses SUM across latest per-service datapoints."
          />
          <MetricHighlightCard
            label={METRIC_LABELS.errorRate.label}
            description={METRIC_LABELS.errorRate.desc}
            icon={METRIC_LABELS.errorRate.icon}
            value={formatPercent(summaryStats.healthScore)}
            valueClassName={
              summaryStats.healthScore === null
                ? 'text-[var(--text-muted)]'
                : summaryStats.healthScore > 99
                ? 'text-emerald-700'
                : summaryStats.healthScore > 95
                  ? 'text-amber-700'
                  : 'text-rose-700'
            }
            note={
              summaryStats.healthScore === null ? (
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  N/A: error-rate telemetry unavailable in this window
                </p>
              ) : summaryStats.healthScore < 100 ? (
                <p className="mt-1 text-xs text-rose-700">
                  {formatPercent(summaryStats.errorRate)} requests failing
                </p>
              ) : undefined
            }
            tone="emerald"
            tooltip="Overall success score. Global mode uses request-rate-weighted average error rate across latest per-service datapoints."
          />
          <MetricHighlightCard
            label={METRIC_LABELS.p95.label}
            description={METRIC_LABELS.p95.desc}
            icon={METRIC_LABELS.p95.icon}
            value={formatMs(summaryStats.p95)}
            valueClassName={
              summaryStats.p95 === null
                ? 'text-[var(--text-muted)]'
                : summaryStats.p95 < 500
                ? 'text-emerald-700'
                : summaryStats.p95 < 1000
                  ? 'text-amber-700'
                  : 'text-rose-700'
            }
            note={
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                {summaryStats.isGlobalScope
                  ? 'Aggregate: MAX of latest P95 values across in-scope services'
                  : 'Scope: selected service(s) latest datapoint'}
              </p>
            }
            tone="amber"
            tooltip="How slow responses become during heavier periods. Global mode uses MAX latest P95 to surface the slowest service."
          />
          <MetricHighlightCard
            label={METRIC_LABELS.availability.label}
            description={METRIC_LABELS.availability.desc}
            icon={METRIC_LABELS.availability.icon}
            value={formatPercent(summaryStats.availability)}
            valueClassName={
              summaryStats.availability === null
                ? 'text-[var(--text-muted)]'
                : summaryStats.availability > 99.9
                ? 'text-emerald-700'
                : summaryStats.availability > 99
                  ? 'text-blue-700'
                  : 'text-rose-700'
            }
            note={
              summaryStats.availability === null ? (
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  N/A: availability telemetry is not available for this window
                </p>
              ) : (
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  {summaryStats.isGlobalScope
                    ? 'Aggregate: AVG of latest availability across services with availability data'
                    : 'Scope: selected service(s) latest datapoint'}
                </p>
              )
            }
            tone="purple"
            tooltip="How often services stay online and reachable. Renders N/A when availability is missing; no fallback values are fabricated."
          />
        </div>
      )}

      {/* Component 4 Outcomes */}
      {simulationMetrics && (
        <Section
          title="Simulation Outcomes"
          description="Summary of recent simulation runs, shown separately from live telemetry"
          icon={BarChart3}
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-6">
            <MetricHighlightCard
              label="Runs (7d)"
              description="Total simulation runs"
              icon={BarChart3}
              value={simulationMetrics.runs}
              tone="blue"
              tooltip="Total number of simulation runs completed in the last 7 days. This shows overall simulation activity."
            />
            <MetricHighlightCard
              label="Failure Runs"
              description="Failure impact simulations"
              icon={AlertCircle}
              value={simulationMetrics.failureRuns}
              tone="amber"
              tooltip="How many failure scenarios were tested in the selected period. Useful for tracking resilience test coverage."
            />
            <MetricHighlightCard
              label="Scale Runs"
              description="Scaling speed simulations"
              icon={Zap}
              value={simulationMetrics.scaleRuns}
              tone="emerald"
              tooltip="How many scaling scenarios were tested in the selected period. This helps track performance tuning activity."
            />
            <MetricHighlightCard
              label="Avg Affected"
              description="Average impacted services"
              icon={Activity}
              value={simulationMetrics.avgAffectedServices.toFixed(2)}
              tone="blue"
              tooltip="Average number of services affected per run. Higher values suggest broader impact across the system."
            />
            <MetricHighlightCard
              label="Avg Latency Δ"
              description="Average delta from scaling runs"
              icon={Clock}
              value={`${simulationMetrics.avgLatencyDeltaMs >= 0 ? '+' : ''}${simulationMetrics.avgLatencyDeltaMs.toFixed(2)} ms`}
              tone={simulationMetrics.avgLatencyDeltaMs <= 0 ? 'emerald' : 'amber'}
              tooltip="Average response-time change after scaling actions. Negative means faster on average; positive means slower on average."
            />
            <MetricHighlightCard
              label="Low Confidence"
              description="Runs with stale/uncertain inputs"
              icon={ShieldCheck}
              value={simulationMetrics.lowConfidenceRuns}
              tone={simulationMetrics.lowConfidenceRuns > 0 ? 'amber' : 'emerald'}
              tooltip="Runs where source data was stale, incomplete, or uncertain. Treat these results as directional guidance, not exact truth."
            />
          </div>

          <div className="mt-4">
            <h3 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Run Trend</h3>
            {simulationMetrics.trend.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">No simulation runs in the selected window.</p>
            ) : (
              <div className={tableShellClass}>
                <div className="max-h-56 overflow-auto">
                  <table className="w-full">
                    <thead className={cn(tableHeadRowClass, tableHeadStickyClass)}>
                      <tr>
                        <th className={cn(tableHeaderCellClass, 'text-[var(--text-secondary)]')}>Date</th>
                        <th className={cn(tableHeaderCellClass, 'text-right')}>Runs</th>
                        <th className={cn(tableHeaderCellClass, 'text-right')}>Failure</th>
                        <th className={cn(tableHeaderCellClass, 'text-right')}>Scale</th>
                      </tr>
                    </thead>
                    <tbody>
                      {simulationMetrics.trend.map((point) => (
                        <tr key={point.date} className={tableBodyRowClass}>
                          <td className={cn(tableCellClass, 'font-semibold text-[var(--text-primary)]')}>{point.date}</td>
                          <td className={cn(tableCellClass, 'text-right font-mono font-semibold text-[var(--text-primary)]')}>{point.runs}</td>
                          <td className={cn(tableCellClass, 'text-right font-mono text-[var(--text-secondary)]')}>{point.failureRuns}</td>
                          <td className={cn(tableCellClass, 'text-right font-mono text-[var(--text-secondary)]')}>{point.scaleRuns}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </Section>
      )}

      {/* Deep Dive Charts */}
      {data && sortedDatapoints.length > 0 && (
        <Section title="Deep Dive Analytics" description="Visualizing data over time" icon={Activity}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Traffic Chart */}
            <ChartPanel
              icon={METRIC_LABELS.requestRate.icon}
              iconWrapperClassName="bg-blue-500/20"
              iconClassName="text-blue-400"
              title="Traffic Trends"
              tooltip="Shows how request traffic rises and falls over time. Spikes may indicate peak usage windows or sudden demand changes."
            >
              <TimeSeriesLineChart
                data={sortedDatapoints.map((d) => ({
                  timestamp: d.timestamp,
                  value: d.requestRate,
                }))}
                strokeColor="#3b82f6"
                fillColor="#3b82f6"
                valueFormatter={(v) => formatRps(v)}
              />
            </ChartPanel>

            {/* Health Chart */}
            <ChartPanel
              icon={METRIC_LABELS.errorRate.icon}
              iconWrapperClassName="bg-rose-500/20"
              iconClassName="text-rose-400"
              title="Failure Rate Trends"
              tooltip="Shows how the request failure percentage changes over time. Rising trends may indicate incidents or degradations."
            >
              <TimeSeriesLineChart
                data={sortedDatapoints.map((d) => ({
                  timestamp: d.timestamp,
                  value: d.errorRate,
                }))}
                strokeColor="#ef4444"
                fillColor="#ef4444"
                valueFormatter={(v) => formatPercent(v)}
              />
            </ChartPanel>

            {/* Speed Chart */}
            <ChartPanel
              icon={METRIC_LABELS.p95.icon}
              iconWrapperClassName="bg-amber-500/20"
              iconClassName="text-amber-400"
              title="Response Speed (Latency)"
              tooltip="Shows latency trends by percentile. P50/P99 render as N/A when telemetry does not provide those fields."
            >
              {(!hasP50Data || !hasP99Data) && (
                <p className="mb-3 text-xs text-[var(--text-muted)]">
                  P50: {hasP50Data ? 'available' : 'N/A'} | P99: {hasP99Data ? 'available' : 'N/A'}
                  <span className="ml-1 inline-flex align-middle">
                    <InfoHint text="Telemetry currently persists P95 only for this dataset. Missing percentile fields are shown as N/A instead of 0." />
                  </span>
                </p>
              )}
              <LatencyMultiLineChart
                data={latencySeries}
              />
            </ChartPanel>

            {/* Uptime Chart */}
            <ChartPanel
              icon={METRIC_LABELS.availability.icon}
              iconWrapperClassName="bg-emerald-500/20"
              iconClassName="text-emerald-400"
              title="Uptime Stability"
              tooltip="Shows how consistently services stay online and reachable over time. Renders N/A when availability telemetry is missing."
            >
              {availabilitySeries.length > 0 ? (
                <TimeSeriesLineChart
                  data={availabilitySeries}
                  strokeColor="#10b981"
                  fillColor="#10b981"
                  valueFormatter={(v) => formatPercent(v)}
                />
              ) : (
                <p className="text-sm text-[var(--text-muted)]">
                  N/A
                  <span className="ml-1 inline-flex align-middle">
                    <InfoHint text="Availability is not present in telemetry for the selected scope/time window." />
                  </span>
                </p>
              )}
            </ChartPanel>
          </div>
        </Section>
      )}

      {/* System Health Status Table */}
      {systemStatus.length > 0 && (
        <Section
          title="System Components Status"
          description="Detailed breakdown of every service"
          icon={ShieldCheck}
        >
          <div className={tableShellClass}>
            <div className="max-h-[560px] overflow-auto">
              <table className="w-full">
                <thead className={cn(tableHeadRowClass, tableHeadStickyClass)}>
                <tr>
                  <th className={tableHeaderCellClass}>
                    Component Name
                  </th>
                  <th className={cn(tableHeaderCellClass, 'text-right')}>
                    Traffic
                  </th>
                  <th className={cn(tableHeaderCellClass, 'text-right')}>
                    Success Rate
                  </th>
                  <th className={cn(tableHeaderCellClass, 'text-right')}>
                    Slow-end response time
                  </th>
                  <th className={cn(tableHeaderCellClass, 'text-right')}>
                    Uptime
                  </th>
                  <th className={tableHeaderCellClass}>
                    Quick Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {systemStatus.map((point) => (
                  <tr
                    key={`${point.namespace}:${point.service}`}
                    className={cn(tableBodyRowClass, 'transition-colors')}
                  >
                    <td className={cn(tableCellClass, 'font-medium text-[var(--text-primary)]')}>
                      <div className="flex flex-col">
                        <span className="text-base">{point.service}</span>
                        <span className="font-mono text-xs text-[var(--text-muted)]">{point.namespace}</span>
                      </div>
                    </td>
                    <td className={cn(tableCellClass, 'text-right font-mono')}>
                      {formatRps(point.requestRate)}
                    </td>
                    <td className={cn(tableCellClass, 'text-right font-mono')}>
                      <span
                        className={`inline-flex items-center px-2 py-1 rounded text-xs font-bold ${point.errorRate <= 1
                          ? 'bg-emerald-500/12 text-emerald-700'
                          : point.errorRate <= 5
                            ? 'bg-amber-500/12 text-amber-700'
                            : 'bg-rose-500/12 text-rose-700'
                          }`}
                      >
                        {formatPercent(100 - point.errorRate)}
                      </span>
                    </td>
                    <td className={cn(tableCellClass, 'text-right font-mono')}>
                      <span
                        className={
                          point.p95 < 500 ? 'text-[var(--text-primary)]' :
                            point.p95 < 1000 ? 'text-amber-700' : 'text-rose-700'
                        }
                      >
                        {formatMs(point.p95)}
                      </span>
                    </td>
                    <td className={cn(tableCellClass, 'text-right font-mono')}>
                      <span
                        className={(() => {
                          const avail = getDisplayUptime(point)
                          if (avail === null) return 'text-[var(--text-muted)]'
                          if (avail >= 99) return 'text-emerald-700'
                          if (avail >= 95) return 'text-amber-700'
                          return 'text-rose-700'
                        })()}
                      >
                        {(() => {
                          const avail = getDisplayUptime(point)
                          if (avail === null) {
                            return (
                              <span className="inline-flex items-center gap-1">
                                N/A
                                <InfoHint text="Availability is not available in telemetry for this service/time window." />
                              </span>
                            )
                          }
                          return formatPercent(avail)
                        })()}
                      </span>
                    </td>
                    <td className={tableCellClass}>
                      <button type="button"
                        onClick={() =>
                          navigate(`/metrics/offenders/${point.namespace}:${point.service}`)
                        }
                        className={tableActionLinkClass}
                      >
                        Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              </table>
            </div>
          </div>
        </Section>
      )}

      {/* Empty State */}
      {!loading && (!data || sortedDatapoints.length === 0) && (
        <EmptyState
          icon={<BarChart3 className="h-12 w-12 text-[var(--color-emerald-300)]" />}
          message="No active signals detected"
          description="We haven't received any data for this time period. The system might be idle."
        />
      )}

      {loading && (
        <div className={cn(loadingCardClass, 'space-y-4 p-6 text-left')} aria-label="Loading metrics">
          <SkeletonBlock variant="title" className="w-1/3" />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <SkeletonBlock variant="card" className="h-28" />
            <SkeletonBlock variant="card" className="h-28" />
          </div>
          <SkeletonBlock variant="line" className="w-full" />
          <SkeletonBlock variant="line" className="w-5/6" />
        </div>
      )}
    </div>
  )
}
