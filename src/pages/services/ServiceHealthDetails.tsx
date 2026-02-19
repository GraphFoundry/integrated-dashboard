import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router'
import toast from 'react-hot-toast'
import PageHeader from '@/components/layout/PageHeader'
import KPIStatCard from '@/components/layout/KPIStatCard'
import Section from '@/components/layout/Section'
import EmptyState from '@/components/layout/EmptyState'
import SkeletonBlock from '@/components/common/SkeletonBlock'
import {
  controlInputMutedClass,
  pageContainerClass,
  primaryButtonClass,
  cn,
  glassSurfaceClass,
} from '@/components/common/uiClassTokens'
import { Select } from '@/components/ui'
import TimeSeriesLineChart from '@/components/charts/TimeSeriesLineChart'
import LatencyMultiLineChart from '@/components/charts/LatencyMultiLineChart'
import { getTelemetryMetrics } from '@/lib/api'
import { formatRps, formatPercent, formatMs } from '@/lib/format'
import { TelemetryMetricsResponse } from '@/lib/types'
import { getGlossaryTerm } from '@/lib/glossary'

function KpiCardSkeleton() {
  return (
    <div className={cn(glassSurfaceClass, 'interactive-soft rounded-[var(--radius-md)] p-4')}>
      <SkeletonBlock variant="line" className="mb-2 h-3 w-2/5" />
      <div className="flex items-baseline gap-2">
        <SkeletonBlock variant="title" className="h-8 w-1/2" />
      </div>
    </div>
  )
}

export default function ServiceHealthDetails() {
  const { serviceId } = useParams() // Expects "namespace:serviceName" or just "serviceName"
  const navigate = useNavigate()

  // Parse service name and namespace
  const [namespace, serviceName] = (serviceId || '').includes(':')
    ? (serviceId || '').split(':')
    : ['default', serviceId || '']

  const [timeRange, setTimeRange] = useState('1h')
  const [data, setData] = useState<TelemetryMetricsResponse | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!serviceName) return

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
        toast.error(err instanceof Error ? err.message : 'Failed to fetch service data')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [serviceName, timeRange])

  const getTimeRangeMs = (range: string): number => {
    const units: Record<string, number> = {
      '1h': 60 * 60 * 1000,
      '6h': 6 * 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
    }
    return units[range] || units['1h']
  }

  // Summary Stats
  const summary = data?.datapoints[data.datapoints.length - 1]

  if (!serviceName) {
    return <EmptyState message="Service not found" />
  }

  return (
    <div className={pageContainerClass} aria-busy={loading && !data}>
      <PageHeader
        title={serviceName}
        description={`Service Health • Namespace: ${namespace}`}
        actions={
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-end">
            <Select
              aria-label="Telemetry time range"
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className={cn(controlInputMutedClass, 'w-full min-w-[16rem] appearance-none pr-11')}
            >
              <option value="1h">Last 1 hour</option>
              <option value="6h">Last 6 hours</option>
              <option value="24h">Last 24 hours</option>
              <option value="7d">Last 7 days</option>
            </Select>
            <button type="button"
              onClick={() => navigate(`/simulations?service=${namespace}:${serviceName}`)}
              className={`${primaryButtonClass} text-sm`}
            >
              Open in Simulations
            </button>
          </div>
        }
      />


      {loading && !data && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4" aria-busy="true">
            {Array.from({ length: 4 }).map((_, index) => (
              <KpiCardSkeleton key={`service-health-kpi-skeleton-${index}`} />
            ))}
          </div>
          <Section title="Performance Trends">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <SkeletonBlock variant="line" className="mb-3 h-4 w-2/5" />
                <SkeletonBlock variant="card" className="h-[200px] w-full rounded-lg" />
              </div>
              <div>
                <SkeletonBlock variant="line" className="mb-3 h-4 w-2/5" />
                <SkeletonBlock variant="card" className="h-[200px] w-full rounded-lg" />
              </div>
              <div className="lg:col-span-2">
                <SkeletonBlock variant="line" className="mb-3 h-4 w-1/3" />
                <SkeletonBlock variant="card" className="h-[200px] w-full rounded-lg" />
              </div>
            </div>
          </Section>
        </>
      )}

      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <KPIStatCard
            label={getGlossaryTerm('requestRate').label}
            tooltip={getGlossaryTerm('requestRate').tooltip}
            value={formatRps(summary.requestRate)}
            variant="default"
          />
          <KPIStatCard
            label={getGlossaryTerm('errorRate').label}
            tooltip={getGlossaryTerm('errorRate').tooltip}
            value={formatPercent(summary.errorRate)}
            variant={summary.errorRate > 1 ? 'danger' : 'success'}
          />
          <KPIStatCard
            label={getGlossaryTerm('p95').label}
            tooltip={getGlossaryTerm('p95').tooltip}
            value={formatMs(summary.p95)}
            variant={summary.p95 > 500 ? 'warning' : 'success'}
          />
          <KPIStatCard
            label={getGlossaryTerm('availability').label}
            tooltip={getGlossaryTerm('availability').tooltip}
            value={formatPercent(summary.availability)}
            variant={summary.availability < 99.9 ? 'warning' : 'success'}
          />
        </div>
      )}

      {data && data.datapoints.length > 0 && (
        <Section title="Performance Trends">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm font-medium text-slate-300 mb-3">
                {getGlossaryTerm('requestRate').label}
              </h3>
              <TimeSeriesLineChart
                data={data.datapoints.map((d) => ({
                  timestamp: d.timestamp,
                  value: d.requestRate,
                }))}
                strokeColor="#3b82f6"
                fillColor="#3b82f6"
                valueFormatter={formatRps}
              />
            </div>
            <div>
              <h3 className="text-sm font-medium text-slate-300 mb-3">
                {getGlossaryTerm('errorRate').label}
              </h3>
              <TimeSeriesLineChart
                data={data.datapoints.map((d) => ({ timestamp: d.timestamp, value: d.errorRate }))}
                strokeColor="#ef4444"
                fillColor="#ef4444"
                valueFormatter={formatPercent}
              />
            </div>
            <div className="lg:col-span-2">
              <h3 className="text-sm font-medium text-slate-300 mb-3">Response Time (Latency)</h3>
              <LatencyMultiLineChart
                data={data.datapoints.map((d) => ({
                  timestamp: d.timestamp,
                  p50: d.p50,
                  p95: d.p95,
                  p99: d.p99,
                }))}
              />
            </div>
          </div>
        </Section>
      )}

      {!loading && (!data || data.datapoints.length === 0) && (
        <EmptyState message="No telemetry data available." />
      )}
    </div>
  )
}
