import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router'
import { RefreshCw, Activity, Settings, Zap, Heart, Globe, Clock, ShieldCheck } from 'lucide-react'
import toast from 'react-hot-toast'
import PageHeader from '@/components/layout/PageHeader'
import Section from '@/components/layout/Section'
import EmptyState from '@/components/layout/EmptyState'
import MetricHighlightCard from '@/components/layout/MetricHighlightCard'
import LoadingSpinner from '@/components/common/LoadingSpinner'
import {
  cn,
  controlInputDarkClass,
  controlLabelCompactClass,
  subtleIconButtonClass,
  tableActionLinkClass,
  tableBodyRowClass,
  tableCellClass,
  tableHeadRowClass,
  tableHeadStickyClass,
  tableHeaderCellClass,
  tableShellClass,
} from '@/components/common/uiClassTokens'
import TimeSeriesLineChart from '@/components/charts/TimeSeriesLineChart'
import LatencyMultiLineChart from '@/components/charts/LatencyMultiLineChart'
import { getTelemetryMetrics, getServices } from '@/lib/api'
import { formatRps, formatPercent, formatMs } from '@/lib/format'
import { calculateServiceRisk } from '@/lib/risk'
import type { TelemetryDatapoint, TelemetryMetricsResponse } from '@/lib/types'

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

interface ChartPanelProps {
  readonly icon: React.ComponentType<{ className?: string }>
  readonly iconWrapperClassName: string
  readonly iconClassName: string
  readonly title: string
  readonly children: React.ReactNode
}

function ChartPanel({
  icon: Icon,
  iconWrapperClassName,
  iconClassName,
  title,
  children,
}: ChartPanelProps) {
  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-4">
      <div className="mb-4 flex items-center gap-2">
        <div className={`rounded-lg p-2 ${iconWrapperClassName}`}>
          <Icon className={`h-4 w-4 ${iconClassName}`} />
        </div>
        <h3 className="font-semibold text-slate-200">{title}</h3>
      </div>
      {children}
    </div>
  )
}

export default function Metrics() {
  const navigate = useNavigate()
  const [serviceName, setServiceName] = useState('')
  const [timeRange, setTimeRange] = useState('1h')
  const [data, setData] = useState<TelemetryMetricsResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [services, setServices] = useState<Array<{ name: string; namespace: string }>>([])

  const fetchData = async () => {
    setLoading(true)

    try {
      const now = new Date()
      const from = new Date(now.getTime() - getTimeRangeMs(timeRange))

      const result = await getTelemetryMetrics({
        service: serviceName,
        from: from.toISOString(),
        to: now.toISOString(),
        step: 60,
      })

      setData(result)
    } catch (err) {
      console.error('Fetch error:', err)
      toast.error(err instanceof Error ? err.message : 'Failed to fetch telemetry data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const fetchServices = async () => {
      try {
        const response = await getServices()
        setServices(response.services)
      } catch (err) {
        console.error('Failed to fetch services:', err)
      }
    }
    fetchServices()
  }, [])

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceName, timeRange])

  const getTimeRangeMs = (range: string): number => {
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
  }

  // Calculate summary stats from current datapoints
  const summaryStats = data?.datapoints.length
    ? (() => {
      const latest = data.datapoints[data.datapoints.length - 1]
      if (!latest) return null

      return {
        requestRate: latest.requestRate,
        // Invert error rate to show "Health" (Success Rate)
        healthScore: 100 - latest.errorRate,
        errorRate: latest.errorRate,
        p95: latest.p95,
        availability: latest.availability ?? (100 - (latest.errorRate || 0)),
      }
    })()
    : null

  // Group datapoints by service for "System Status" snapshot
  const systemStatus = data?.datapoints.length
    ? (() => {
      const byService = new Map<string, TelemetryDatapoint>()
      data.datapoints.forEach((point) => {
        const key = `${point.namespace}:${point.service}`
        if (!byService.has(key)) {
          byService.set(key, point)
        }
      })
      return Array.from(byService.values())
        .map((point) => ({
          ...point,
          risk: calculateServiceRisk(point.service, point.namespace, point),
        }))
        .sort((a, b) => b.errorRate - a.errorRate) // High error rate first
        .slice(0, 10)
    })()
    : []

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <PageHeader
        title="Mission Control Metrics"
        description="High-level overview of system vital signs"
        icon={Activity}
      />

      {/* Controls */}
      <div className="surface-glass rounded-[var(--radius-md)] border border-white/12 p-4">
        <div className="flex items-end gap-4">
          <div className="flex-1">
            <label htmlFor="service-select" className={controlLabelCompactClass}>
              Focus Area (Service)
            </label>
            <div className="relative">
              <select
                id="service-select"
                value={serviceName}
                onChange={(e) => setServiceName(e.target.value)}
                className={cn(controlInputDarkClass, 'appearance-none pr-11')}
              >
                <option value="">Entire System (Global)</option>
                {services.map((service) => (
                  <option key={`${service.namespace}/${service.name}`} value={service.name}>
                    {service.name}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute right-4 top-3.5 text-[var(--text-muted)]">
                <Settings className="w-4 h-4" />
              </div>
            </div>
          </div>
          <div className="flex-1">
            <label htmlFor="time-range-select" className={controlLabelCompactClass}>
              Time Horizon
            </label>
            <div className="relative">
              <select
                id="time-range-select"
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value)}
                className={cn(controlInputDarkClass, 'appearance-none pr-11')}
              >
                <option value="5m">Last 5 minutes (Real-time)</option>
                <option value="15m">Last 15 minutes</option>
                <option value="1h">Last 1 hour</option>
                <option value="6h">Last 6 hours</option>
                <option value="24h">Last 24 hours</option>
              </select>
              <div className="pointer-events-none absolute right-4 top-3.5 text-[var(--text-muted)]">
                <Clock className="w-4 h-4" />
              </div>
            </div>
          </div>
          <button type="button"
            onClick={fetchData}
            disabled={loading}
            className={cn(subtleIconButtonClass)}
            title="Refresh Vital Signs"
            aria-label="Refresh metrics"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
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
          />
          <MetricHighlightCard
            label={METRIC_LABELS.errorRate.label}
            description={METRIC_LABELS.errorRate.desc}
            icon={METRIC_LABELS.errorRate.icon}
            value={formatPercent(summaryStats.healthScore)}
            valueClassName={
              summaryStats.healthScore > 99
                ? 'text-emerald-300'
                : summaryStats.healthScore > 95
                  ? 'text-amber-300'
                  : 'text-rose-300'
            }
            note={
              summaryStats.healthScore < 100 ? (
                <p className="mt-1 text-xs text-rose-200">
                  {formatPercent(summaryStats.errorRate)} requests failing
                </p>
              ) : undefined
            }
            tone="emerald"
          />
          <MetricHighlightCard
            label={METRIC_LABELS.p95.label}
            description={METRIC_LABELS.p95.desc}
            icon={METRIC_LABELS.p95.icon}
            value={formatMs(summaryStats.p95)}
            valueClassName={
              summaryStats.p95 < 500
                ? 'text-emerald-300'
                : summaryStats.p95 < 1000
                  ? 'text-amber-300'
                  : 'text-rose-300'
            }
            tone="amber"
          />
          <MetricHighlightCard
            label={METRIC_LABELS.availability.label}
            description={METRIC_LABELS.availability.desc}
            icon={METRIC_LABELS.availability.icon}
            value={formatPercent(summaryStats.availability)}
            valueClassName={
              summaryStats.availability > 99.9
                ? 'text-emerald-300'
                : summaryStats.availability > 99
                  ? 'text-blue-300'
                  : 'text-rose-300'
            }
            tone="purple"
          />
        </div>
      )}

      {/* Deep Dive Charts */}
      {data && data.datapoints.length > 0 && (
        <Section title="Deep Dive Analytics" description="Visualizing data over time" icon={Activity}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Traffic Chart */}
            <ChartPanel
              icon={METRIC_LABELS.requestRate.icon}
              iconWrapperClassName="bg-blue-500/20"
              iconClassName="text-blue-400"
              title="Traffic Trends"
            >
              <TimeSeriesLineChart
                data={data.datapoints.map((d) => ({
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
            >
              <TimeSeriesLineChart
                data={data.datapoints.map((d) => ({
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
            >
              <LatencyMultiLineChart
                data={data.datapoints.map((d) => ({
                  timestamp: d.timestamp,
                  p50: d.p50,
                  p95: d.p95,
                  p99: d.p99,
                }))}
              />
            </ChartPanel>

            {/* Uptime Chart */}
            <ChartPanel
              icon={METRIC_LABELS.availability.icon}
              iconWrapperClassName="bg-emerald-500/20"
              iconClassName="text-emerald-400"
              title="Uptime Stability"
            >
              <TimeSeriesLineChart
                data={data.datapoints.map((d) => ({
                  timestamp: d.timestamp,
                  value: d.availability ?? (100 - (d.errorRate || 0)),
                }))}
                strokeColor="#10b981"
                fillColor="#10b981"
                valueFormatter={(v) => formatPercent(v)}
              />
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
                    Speed (P95)
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
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : point.errorRate <= 5
                            ? 'bg-amber-500/10 text-amber-400'
                            : 'bg-rose-500/10 text-rose-400'
                          }`}
                      >
                        {formatPercent(100 - point.errorRate)}
                      </span>
                    </td>
                    <td className={cn(tableCellClass, 'text-right font-mono')}>
                      <span
                        className={
                          point.p95 < 500 ? 'text-slate-200' :
                            point.p95 < 1000 ? 'text-amber-400' : 'text-rose-400'
                        }
                      >
                        {formatMs(point.p95)}
                      </span>
                    </td>
                    <td className={cn(tableCellClass, 'text-right font-mono')}>
                      <span
                        className={(() => {
                          const avail = point.availability ?? (100 - (point.errorRate || 0))
                          if (avail >= 99) return 'text-emerald-400'
                          if (avail >= 95) return 'text-amber-400'
                          return 'text-rose-400'
                        })()}
                      >
                        {formatPercent(point.availability ?? (100 - (point.errorRate || 0)))}
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
      {!loading && (!data || data.datapoints.length === 0) && (
        <EmptyState
          icon="📊"
          message="No active signals detected"
          description="We haven't received any data for this time period. The system might be idle."
        />
      )}

      {loading && (
        <div className="rounded-xl border border-firebase-border bg-firebase-card p-24 text-center backdrop-blur-sm">
          <LoadingSpinner
            fullHeight={false}
            size="lg"
            message={
              <span className="flex flex-col items-center gap-1">
                <span className="text-xl font-medium text-firebase-text-primary">
                  Analyzing System Vital Signs...
                </span>
                <span className="text-firebase-text-secondary">
                  Connecting to telemetry satellites
                </span>
              </span>
            }
          />
        </div>
      )}
    </div>
  )
}
