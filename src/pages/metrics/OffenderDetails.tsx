import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router'
import PageHeader from '@/components/layout/PageHeader'
import KPIStatCard from '@/components/layout/KPIStatCard'
import Section from '@/components/layout/Section'
import EmptyState from '@/components/layout/EmptyState'
import TimeSeriesLineChart from '@/components/charts/TimeSeriesLineChart'
import LatencyMultiLineChart from '@/components/charts/LatencyMultiLineChart'
import { getTelemetryMetrics } from '@/lib/api'
import { formatRps, formatPercent, formatMs } from '@/lib/format'
import type { TelemetryMetricsResponse, TelemetryDatapoint } from '@/lib/types'
import { getGlossaryTerm } from '@/lib/glossary'
import { ArrowLeft } from 'lucide-react'

export default function OffenderDetails() {
  const { serviceKey } = useParams() // Expects "namespace:serviceName"
  const navigate = useNavigate()

  // Parse service name and namespace
  const [namespace, serviceName] = (serviceKey || '').includes(':')
    ? (serviceKey || '').split(':')
    : ['default', serviceKey || '']

  const [timeRange] = useState('1h')
  const [data, setData] = useState<TelemetryMetricsResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!serviceName) return

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
        setError(err instanceof Error ? err.message : 'Failed to fetch offender data')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
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

  // Calculate summary stats from latest datapoint
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

  // Calculate delta (comparison) between first and second half of time window
  const deltaStats = data?.datapoints.length
    ? (() => {
        const midpoint = Math.floor(data.datapoints.length / 2)
        const firstHalf = data.datapoints.slice(0, midpoint)
        const secondHalf = data.datapoints.slice(midpoint)

        if (firstHalf.length === 0 || secondHalf.length === 0) return null

        const avg = (points: TelemetryDatapoint[], key: keyof TelemetryDatapoint) => {
          const sum = points.reduce((acc, p) => acc + (p[key] as number), 0)
          return sum / points.length
        }

        const firstAvg = {
          requestRate: avg(firstHalf, 'requestRate'),
          errorRate: avg(firstHalf, 'errorRate'),
          p95: avg(firstHalf, 'p95'),
          availability: avg(firstHalf, 'availability'),
        }

        const secondAvg = {
          requestRate: avg(secondHalf, 'requestRate'),
          errorRate: avg(secondHalf, 'errorRate'),
          p95: avg(secondHalf, 'p95'),
          availability: avg(secondHalf, 'availability'),
        }

        return {
          requestRate: secondAvg.requestRate - firstAvg.requestRate,
          errorRate: secondAvg.errorRate - firstAvg.errorRate,
          p95: secondAvg.p95 - firstAvg.p95,
          availability: secondAvg.availability - firstAvg.availability,
        }
      })()
    : null

  const handleOpenInSimulations = () => {
    navigate('/simulations', {
      state: { preselectedService: { name: serviceName, namespace } },
    })
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header with Breadcrumb */}
      <div className="space-y-4">
        <button
          onClick={() => navigate('/metrics')}
          className="flex items-center gap-2 text-slate-400 hover:text-slate-200 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm">Back to Metrics</span>
        </button>

        <PageHeader
          title={`Offender Details: ${serviceName}`}
          description={`Namespace: ${namespace} • Time range: ${timeRange}`}
        />
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-700 rounded-lg p-4">
          <p className="text-red-300">{error}</p>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-12 text-center">
          <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-slate-400">Loading offender details...</p>
        </div>
      )}

      {/* Health Summary (KPI Cards) */}
      {!loading && summaryStats && (
        <Section title="Health Summary" description="Current service performance indicators">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <KPIStatCard
              label="Traffic"
              tooltip="Requests per second"
              value={
                summaryStats.requestRate === undefined ? 'N/A' : formatRps(summaryStats.requestRate)
              }
              variant="default"
            />
            <KPIStatCard
              label="Failed Requests"
              tooltip="Percentage of requests that resulted in errors"
              value={
                summaryStats.errorRate === undefined ? 'N/A' : formatPercent(summaryStats.errorRate)
              }
              variant={(() => {
                if (summaryStats.errorRate === undefined) return 'default'
                const rate = summaryStats.errorRate
                if (rate > 5) return 'danger'
                if (rate > 1) return 'warning'
                return 'success'
              })()}
            />
            <KPIStatCard
              label="Slow Response Time"
              tooltip={`${getGlossaryTerm('p95').tooltip} (P95 latency)`}
              value={summaryStats.p95 === undefined ? 'N/A' : formatMs(summaryStats.p95)}
              variant={(() => {
                if (summaryStats.p95 === undefined) return 'default'
                const p95 = summaryStats.p95
                if (p95 > 1000) return 'danger'
                if (p95 > 500) return 'warning'
                return 'success'
              })()}
            />
            <KPIStatCard
              label="Uptime"
              tooltip="Service availability percentage"
              value={
                summaryStats.availability === undefined
                  ? 'N/A'
                  : formatPercent(summaryStats.availability)
              }
              variant={(() => {
                if (summaryStats.availability === undefined) return 'default'
                const avail = summaryStats.availability
                if (avail >= 99) return 'success'
                if (avail >= 95) return 'warning'
                return 'danger'
              })()}
            />
          </div>
        </Section>
      )}

      {/* What Changed (Delta Panel) */}
      {!loading && deltaStats && (
        <Section
          title="What Changed"
          description="Comparison: First half vs Second half of time window"
        >
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Traffic Delta */}
              <div>
                <div className="text-sm text-slate-400 mb-1">Traffic</div>
                <div
                  className={`text-2xl font-semibold ${(() => {
                    if (deltaStats.requestRate > 0) return 'text-blue-400'
                    if (deltaStats.requestRate < 0) return 'text-orange-400'
                    return 'text-slate-400'
                  })()}`}
                >
                  {deltaStats.requestRate > 0 ? '+' : ''}
                  {formatRps(Math.abs(deltaStats.requestRate))}
                </div>
              </div>

              {/* Failed Requests Delta */}
              <div>
                <div className="text-sm text-slate-400 mb-1">Failed Requests</div>
                <div
                  className={`text-2xl font-semibold ${(() => {
                    if (deltaStats.errorRate > 0) return 'text-red-400'
                    if (deltaStats.errorRate < 0) return 'text-green-400'
                    return 'text-slate-400'
                  })()}`}
                >
                  {deltaStats.errorRate > 0 ? '+' : ''}
                  {formatPercent(deltaStats.errorRate)}
                </div>
              </div>

              {/* Slow Response Time Delta */}
              <div>
                <div className="text-sm text-slate-400 mb-1">Slow Response Time</div>
                <div
                  className={`text-2xl font-semibold ${(() => {
                    if (deltaStats.p95 > 0) return 'text-red-400'
                    if (deltaStats.p95 < 0) return 'text-green-400'
                    return 'text-slate-400'
                  })()}`}
                >
                  {deltaStats.p95 > 0 ? '+' : ''}
                  {formatMs(Math.abs(deltaStats.p95))}
                </div>
              </div>

              {/* Uptime Delta */}
              <div>
                <div className="text-sm text-slate-400 mb-1">Uptime</div>
                <div
                  className={`text-2xl font-semibold ${(() => {
                    if (deltaStats.availability > 0) return 'text-green-400'
                    if (deltaStats.availability < 0) return 'text-red-400'
                    return 'text-slate-400'
                  })()}`}
                >
                  {deltaStats.availability > 0 ? '+' : ''}
                  {formatPercent(deltaStats.availability)}
                </div>
              </div>
            </div>
          </div>
        </Section>
      )}

      {/* Trends (Charts) */}
      {!loading && data && data.datapoints.length > 0 && (
        <Section title="Trends" description="Time-series performance visualization">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Traffic Trend */}
            <div>
              <h3 className="text-sm font-medium text-slate-300 mb-3">Traffic</h3>
              <TimeSeriesLineChart
                data={data.datapoints.map((d) => ({
                  timestamp: d.timestamp,
                  value: d.requestRate,
                }))}
                strokeColor="hsl(var(--primary))"
                fillColor="hsl(var(--primary))"
                valueFormatter={(v) => formatRps(v)}
              />
            </div>

            {/* Failures Trend */}
            <div>
              <h3 className="text-sm font-medium text-slate-300 mb-3">Failures</h3>
              <TimeSeriesLineChart
                data={data.datapoints.map((d) => ({
                  timestamp: d.timestamp,
                  value: d.errorRate,
                }))}
                strokeColor="hsl(var(--destructive))"
                fillColor="hsl(var(--destructive))"
                valueFormatter={(v) => formatPercent(v)}
              />
            </div>

            {/* Slow Response Time Trend (Latency) */}
            <div>
              <h3 className="text-sm font-medium text-slate-300 mb-3">
                Slow Response Time (P50/P95/P99)
              </h3>
              <LatencyMultiLineChart
                data={data.datapoints.map((d) => ({
                  timestamp: d.timestamp,
                  p50: d.p50,
                  p95: d.p95,
                  p99: d.p99,
                }))}
              />
            </div>

            {/* Uptime Trend */}
            <div>
              <h3 className="text-sm font-medium text-slate-300 mb-3">Uptime</h3>
              <TimeSeriesLineChart
                data={data.datapoints.map((d) => ({
                  timestamp: d.timestamp,
                  value: d.availability,
                }))}
                strokeColor="hsl(var(--success))"
                fillColor="hsl(var(--success))"
                valueFormatter={(v) => formatPercent(v)}
              />
            </div>
          </div>
        </Section>
      )}

      {/* Actions */}
      {!loading && data && data.datapoints.length > 0 && (
        <Section>
          <button
            onClick={handleOpenInSimulations}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
          >
            Open in Simulations
          </button>
        </Section>
      )}

      {/* Empty State */}
      {!loading && (!data || data.datapoints.length === 0) && (
        <EmptyState
          icon="📊"
          message="No telemetry data available for this service in the selected time range"
        />
      )}
    </div>
  )
}
