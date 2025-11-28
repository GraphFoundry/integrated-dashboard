import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router'
import PageHeader from '@/components/layout/PageHeader'
import KPIStatCard from '@/components/layout/KPIStatCard'
import Section from '@/components/layout/Section'
import EmptyState from '@/components/layout/EmptyState'
import TimeSeriesLineChart from '@/components/charts/TimeSeriesLineChart'
import LatencyMultiLineChart from '@/components/charts/LatencyMultiLineChart'
import { getTelemetryMetrics, getServices } from '@/lib/api'
import { formatRps, formatPercent, formatMs } from '@/lib/format'
import { calculateServiceRisk } from '@/lib/risk'
import type { TelemetryDatapoint, TelemetryMetricsResponse } from '@/lib/types'
import { getGlossaryTerm } from '@/lib/glossary'

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
        errorRate: latest.errorRate,
        p95: latest.p95,
        availability: latest.availability,
      }
    })()
    : null

  // Group datapoints by service for "Top Offenders" snapshot
  const topOffenders = data?.datapoints.length
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
        .sort((a, b) => b.errorRate - a.errorRate)
        .slice(0, 10)
    })()
    : []

  return (
    <div className="p-8 space-y-6">
      <PageHeader title="Metrics" description="Service telemetry and performance indicators" />

      {/* Controls */}
      <Section>
        <div className="flex gap-4 items-end">
          <div className="flex-1">
            <label
              htmlFor="service-select"
              className="block text-sm font-medium text-slate-300 mb-2"
            >
              Service Name
            </label>
            <select
              id="service-select"
              value={serviceName}
              onChange={(e) => setServiceName(e.target.value)}
              className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Services</option>
              {services.map((service) => (
                <option key={`${service.namespace}/${service.name}`} value={service.name}>
                  {service.name} ({service.namespace})
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label
              htmlFor="time-range-select"
              className="block text-sm font-medium text-slate-300 mb-2"
            >
              Time Range
            </label>
            <select
              id="time-range-select"
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="30s">Last 30 seconds</option>
              <option value="1m">Last 1 minute</option>
              <option value="5m">Last 5 minutes</option>
              <option value="15m">Last 15 minutes</option>
              <option value="30m">Last 30 minutes</option>
              <option value="1h">Last 1 hour</option>
              <option value="6h">Last 6 hours</option>
              <option value="24h">Last 24 hours</option>
              <option value="7d">Last 7 days</option>
            </select>
          </div>
          <button
            onClick={fetchData}
            disabled={loading}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 text-white rounded-lg font-medium transition-colors whitespace-nowrap h-[42px]"
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </Section>

      {error && (
        <div className="bg-red-900/20 border border-red-700 rounded-lg p-4">
          <p className="text-red-300">{error}</p>
        </div>
      )}

      {/* Summary Cards */}
      {summaryStats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPIStatCard
            label={getGlossaryTerm('requestRate').label}
            tooltip={getGlossaryTerm('requestRate').tooltip}
            value={formatRps(summaryStats.requestRate)}
            variant="default"
          />
          <KPIStatCard
            label={getGlossaryTerm('errorRate').label}
            tooltip={getGlossaryTerm('errorRate').tooltip}
            value={formatPercent(summaryStats.errorRate)}
            variant={(() => {
              const rate = summaryStats.errorRate
              if (rate > 5) return 'danger'
              if (rate > 1) return 'warning'
              return 'success'
            })()}
          />
          <KPIStatCard
            label={getGlossaryTerm('p95').label}
            tooltip={getGlossaryTerm('p95').tooltip}
            value={formatMs(summaryStats.p95)}
            variant={(() => {
              const p95 = summaryStats.p95
              if (p95 > 1000) return 'danger'
              if (p95 > 500) return 'warning'
              return 'success'
            })()}
          />
          <KPIStatCard
            label={getGlossaryTerm('availability').label}
            tooltip={getGlossaryTerm('availability').tooltip}
            value={formatPercent(summaryStats.availability)}
            variant={(() => {
              const avail = summaryStats.availability
              if (avail >= 99) return 'success'
              if (avail >= 95) return 'warning'
              return 'danger'
            })()}
          />
        </div>
      )}

      {/* Trends Charts */}
      {data && data.datapoints.length > 0 && (
        <Section title="Trends" description="Time-series metrics visualization">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Request Rate Chart */}
            <div>
              <h3 className="text-sm font-medium text-slate-300 mb-3">Request Rate</h3>
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

            {/* Error Rate Chart */}
            <div>
              <h3 className="text-sm font-medium text-slate-300 mb-3">Error Rate</h3>
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

            {/* Latency Chart (Multi-line) */}
            <div>
              <h3 className="text-sm font-medium text-slate-300 mb-3">Latency (P50/P95/P99)</h3>
              <LatencyMultiLineChart
                data={data.datapoints.map((d) => ({
                  timestamp: d.timestamp,
                  p50: d.p50,
                  p95: d.p95,
                  p99: d.p99,
                }))}
              />
            </div>

            {/* Availability Chart */}
            <div>
              <h3 className="text-sm font-medium text-slate-300 mb-3">Availability</h3>
              <TimeSeriesLineChart
                data={data.datapoints.map((d) => ({
                  timestamp: d.timestamp,
                  value: d.availability,
                }))}
                strokeColor="#10b981"
                fillColor="#10b981"
                valueFormatter={(v) => formatPercent(v)}
              />
            </div>
          </div>
        </Section>
      )}

      {/* Top Offenders Snapshot */}
      {topOffenders.length > 0 && (
        <Section
          title="Top Offenders (Current Snapshot)"
          description="Services with highest error rates"
        >
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-900 border-b border-slate-700">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase">
                    Service
                  </th>
                  <th
                    className="px-4 py-3 text-right text-xs font-semibold text-slate-300 uppercase cursor-help"
                    title={getGlossaryTerm('requestRate').tooltip}
                  >
                    Traffic
                  </th>
                  <th
                    className="px-4 py-3 text-right text-xs font-semibold text-slate-300 uppercase cursor-help"
                    title={getGlossaryTerm('errorRate').tooltip}
                  >
                    Failed %
                  </th>
                  <th
                    className="px-4 py-3 text-right text-xs font-semibold text-slate-300 uppercase cursor-help"
                    title={getGlossaryTerm('p95').tooltip}
                  >
                    Slow (P95)
                  </th>
                  <th
                    className="px-4 py-3 text-right text-xs font-semibold text-slate-300 uppercase cursor-help"
                    title={getGlossaryTerm('availability').tooltip}
                  >
                    Uptime
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {topOffenders.map((point) => (
                  <tr key={`${point.namespace}:${point.service}`} className="hover:bg-slate-700/50">
                    <td className="px-4 py-3 text-sm text-white font-medium">
                      {point.service}
                      <div className="text-xs text-slate-500">{point.namespace}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300 text-right font-mono">
                      {formatRps(point.requestRate)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-mono">
                      <span
                        className={(() => {
                          const rate = point.errorRate
                          if (rate > 5) return 'text-red-400'
                          if (rate > 1) return 'text-yellow-400'
                          return 'text-green-400'
                        })()}
                      >
                        {formatPercent(point.errorRate)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300 text-right font-mono">
                      {formatMs(point.p95)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-mono">
                      <span
                        className={(() => {
                          const avail = point.availability
                          if (avail >= 99) return 'text-green-400'
                          if (avail >= 95) return 'text-yellow-400'
                          return 'text-red-400'
                        })()}
                      >
                        {formatPercent(point.availability)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <button
                        onClick={() =>
                          navigate(`/services/${point.namespace}:${point.service}`)
                        }
                        className="text-blue-400 hover:text-blue-300 font-medium"
                      >
                        View Details
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
        <EmptyState icon="📊" message="No telemetry data available for the selected time range" />
      )}

      {loading && (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-12 text-center">
          <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-slate-400">Loading metrics...</p>
        </div>
      )}
    </div>
  )
}
