import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router'
import { RefreshCw, Activity, Settings, Zap, Heart, Globe, Clock, ShieldCheck, AlertTriangle } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import Section from '@/components/layout/Section'
import EmptyState from '@/components/layout/EmptyState'
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

export default function Metrics() {
  const navigate = useNavigate()
  const [serviceName, setServiceName] = useState('')
  const [timeRange, setTimeRange] = useState('1h')
  const [data, setData] = useState<TelemetryMetricsResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [services, setServices] = useState<Array<{ name: string; namespace: string }>>([])

  const fetchData = async () => {
    setLoading(true)
    setError(null)

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
      setError(err instanceof Error ? err.message : 'Failed to fetch telemetry data')
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
      const latest = data.datapoints.at(-1)
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
      <div className="bg-slate-900/50 border border-slate-700/50 rounded-xl p-4 backdrop-blur-sm">
        <div className="flex gap-4 items-end">
          <div className="flex-1">
            <label htmlFor="service-select" className="block text-xs font-semibold text-slate-400 uppercase mb-2 tracking-wider">
              Focus Area (Service)
            </label>
            <div className="relative">
              <select
                id="service-select"
                value={serviceName}
                onChange={(e) => setServiceName(e.target.value)}
                className="w-full bg-slate-800 text-white border border-slate-600/50 rounded-lg px-4 py-3 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none appearance-none transition-all shadow-lg"
              >
                <option value="">Entire System (Global)</option>
                {services.map((service) => (
                  <option key={`${service.namespace}/${service.name}`} value={service.name}>
                    {service.name}
                  </option>
                ))}
              </select>
              <div className="absolute right-4 top-3.5 pointer-events-none text-slate-400">
                <Settings className="w-4 h-4" />
              </div>
            </div>
          </div>
          <div className="flex-1">
            <label htmlFor="time-range-select" className="block text-xs font-semibold text-slate-400 uppercase mb-2 tracking-wider">
              Time Horizon
            </label>
            <div className="relative">
              <select
                id="time-range-select"
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value)}
                className="w-full bg-slate-800 text-white border border-slate-600/50 rounded-lg px-4 py-3 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none appearance-none transition-all shadow-lg"
              >
                <option value="5m">Last 5 minutes (Real-time)</option>
                <option value="15m">Last 15 minutes</option>
                <option value="1h">Last 1 hour</option>
                <option value="6h">Last 6 hours</option>
                <option value="24h">Last 24 hours</option>
              </select>
              <div className="absolute right-4 top-3.5 pointer-events-none text-slate-400">
                <Clock className="w-4 h-4" />
              </div>
            </div>
          </div>
          <button
            onClick={fetchData}
            disabled={loading}
            className="p-3 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:bg-slate-700 disabled:opacity-50 text-white rounded-lg transition-all h-[46px] w-[46px] flex items-center justify-center cursor-pointer shadow-lg shadow-blue-900/20"
            title="Refresh Vital Signs"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/50 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="text-red-400 w-5 h-5" />
          <p className="text-red-200 text-sm font-medium">{error}</p>
        </div>
      )}

      {/* Vital Signs Cards */}
      {summaryStats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Traffic */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6 backdrop-blur-sm relative overflow-hidden group hover:border-blue-500/30 transition-colors">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <METRIC_LABELS.requestRate.icon className="w-16 h-16 text-blue-400" />
            </div>
            <div className="flex flex-col h-full justify-between relative z-10">
              <div>
                <h3 className="text-slate-400 text-sm font-medium uppercase tracking-wider mb-1">{METRIC_LABELS.requestRate.label}</h3>
                <p className="text-slate-500 text-xs mb-4">{METRIC_LABELS.requestRate.desc}</p>
              </div>
              <div>
                <div className="text-3xl font-bold text-white tracking-tight">
                  {formatRps(summaryStats.requestRate)}
                </div>
              </div>
            </div>
          </div>

          {/* Health (Inverse of Error Rate) */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6 backdrop-blur-sm relative overflow-hidden group hover:border-emerald-500/30 transition-colors">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <METRIC_LABELS.errorRate.icon className="w-16 h-16 text-emerald-400" />
            </div>
            <div className="flex flex-col h-full justify-between relative z-10">
              <div>
                <h3 className="text-slate-400 text-sm font-medium uppercase tracking-wider mb-1">{METRIC_LABELS.errorRate.label}</h3>
                <p className="text-slate-500 text-xs mb-4">{METRIC_LABELS.errorRate.desc}</p>
              </div>
              <div>
                <div className={`text-3xl font-bold tracking-tight ${summaryStats.healthScore > 99 ? 'text-emerald-400' :
                  summaryStats.healthScore > 95 ? 'text-amber-400' : 'text-rose-400'
                  }`}>
                  {formatPercent(summaryStats.healthScore)}
                </div>
                {summaryStats.healthScore < 100 && (
                  <p className="text-xs text-rose-300 mt-1">
                    {formatPercent(summaryStats.errorRate)} requests failing
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Speed (P95) */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6 backdrop-blur-sm relative overflow-hidden group hover:border-amber-500/30 transition-colors">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <METRIC_LABELS.p95.icon className="w-16 h-16 text-amber-400" />
            </div>
            <div className="flex flex-col h-full justify-between relative z-10">
              <div>
                <h3 className="text-slate-400 text-sm font-medium uppercase tracking-wider mb-1">{METRIC_LABELS.p95.label}</h3>
                <p className="text-slate-500 text-xs mb-4">{METRIC_LABELS.p95.desc}</p>
              </div>
              <div>
                <div className={`text-3xl font-bold tracking-tight ${summaryStats.p95 < 500 ? 'text-emerald-400' :
                  summaryStats.p95 < 1000 ? 'text-amber-400' : 'text-rose-400'
                  }`}>
                  {formatMs(summaryStats.p95)}
                </div>
              </div>
            </div>
          </div>

          {/* Uptime */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6 backdrop-blur-sm relative overflow-hidden group hover:border-purple-500/30 transition-colors">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <METRIC_LABELS.availability.icon className="w-16 h-16 text-purple-400" />
            </div>
            <div className="flex flex-col h-full justify-between relative z-10">
              <div>
                <h3 className="text-slate-400 text-sm font-medium uppercase tracking-wider mb-1">{METRIC_LABELS.availability.label}</h3>
                <p className="text-slate-500 text-xs mb-4">{METRIC_LABELS.availability.desc}</p>
              </div>
              <div>
                <div className={`text-3xl font-bold tracking-tight ${summaryStats.availability > 99.9 ? 'text-emerald-400' :
                  summaryStats.availability > 99 ? 'text-blue-400' : 'text-rose-400'
                  }`}>
                  {formatPercent(summaryStats.availability)}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Deep Dive Charts */}
      {data && data.datapoints.length > 0 && (
        <Section title="Deep Dive Analytics" description="Visualizing data over time" icon={Activity}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Traffic Chart */}
            <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700/50">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 bg-blue-500/20 rounded-lg">
                  <METRIC_LABELS.requestRate.icon className="w-4 h-4 text-blue-400" />
                </div>
                <h3 className="font-semibold text-slate-200">Traffic Trends</h3>
              </div>
              <TimeSeriesLineChart
                data={data.datapoints.map((d) => ({
                  timestamp: d.timestamp,
                  value: d.requestRate,
                }))}
                strokeColor="#3b82f6"
                fillColor="#3b82f6"
                valueFormatter={(v) => formatRps(v)}
              />
            </div>

            {/* Health Chart */}
            <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700/50">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 bg-rose-500/20 rounded-lg">
                  <METRIC_LABELS.errorRate.icon className="w-4 h-4 text-rose-400" />
                </div>
                <h3 className="font-semibold text-slate-200">Failure Rate Trends</h3>
              </div>
              <TimeSeriesLineChart
                data={data.datapoints.map((d) => ({
                  timestamp: d.timestamp,
                  value: d.errorRate,
                }))}
                strokeColor="#ef4444"
                fillColor="#ef4444"
                valueFormatter={(v) => formatPercent(v)}
              />
            </div>

            {/* Speed Chart */}
            <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700/50">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 bg-amber-500/20 rounded-lg">
                  <METRIC_LABELS.p95.icon className="w-4 h-4 text-amber-400" />
                </div>
                <h3 className="font-semibold text-slate-200">Response Speed (Latency)</h3>
              </div>
              <LatencyMultiLineChart
                data={data.datapoints.map((d) => ({
                  timestamp: d.timestamp,
                  p50: d.p50,
                  p95: d.p95,
                  p99: d.p99,
                }))}
              />
            </div>

            {/* Uptime Chart */}
            <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700/50">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 bg-emerald-500/20 rounded-lg">
                  <METRIC_LABELS.availability.icon className="w-4 h-4 text-emerald-400" />
                </div>
                <h3 className="font-semibold text-slate-200">Uptime Stability</h3>
              </div>
              <TimeSeriesLineChart
                data={data.datapoints.map((d) => ({
                  timestamp: d.timestamp,
                  value: d.availability ?? (100 - (d.errorRate || 0)),
                }))}
                strokeColor="#10b981"
                fillColor="#10b981"
                valueFormatter={(v) => formatPercent(v)}
              />
            </div>
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
          <div className="overflow-hidden bg-slate-800/50 border border-slate-700/50 rounded-xl">
            <table className="w-full">
              <thead className="bg-slate-900/80 border-b border-slate-700">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Component Name
                  </th>
                  <th className="px-6 py-4 text-right text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Traffic
                  </th>
                  <th className="px-6 py-4 text-right text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Success Rate
                  </th>
                  <th className="px-6 py-4 text-right text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Speed (P95)
                  </th>
                  <th className="px-6 py-4 text-right text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Uptime
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Quick Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {systemStatus.map((point) => (
                  <tr key={`${point.namespace}:${point.service}`} className="hover:bg-slate-700/30 transition-colors">
                    <td className="px-6 py-4 text-sm text-white font-medium">
                      <div className="flex flex-col">
                        <span className="text-base">{point.service}</span>
                        <span className="text-xs text-slate-500 font-mono">{point.namespace}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-300 text-right font-mono">
                      {formatRps(point.requestRate)}
                    </td>
                    <td className="px-6 py-4 text-sm text-right font-mono">
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
                    <td className="px-6 py-4 text-sm text-slate-300 text-right font-mono">
                      <span
                        className={
                          point.p95 < 500 ? 'text-slate-200' :
                            point.p95 < 1000 ? 'text-amber-400' : 'text-rose-400'
                        }
                      >
                        {formatMs(point.p95)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-right font-mono">
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
                    <td className="px-6 py-4 text-sm">
                      <button
                        onClick={() =>
                          navigate(`/metrics/offenders/${point.namespace}:${point.service}`)
                        }
                        className="text-blue-400 hover:text-blue-300 font-medium hover:underline decoration-blue-400/30 underline-offset-4"
                      >
                        Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-24 text-center backdrop-blur-sm">
          <div className="animate-spin w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-6" />
          <h3 className="text-xl font-medium text-white mb-2">Analyzing System Vital Signs...</h3>
          <p className="text-slate-400">Connecting to telemetry satellites</p>
        </div>
      )}
    </div>
  )
}
