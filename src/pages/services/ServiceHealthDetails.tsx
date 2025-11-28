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
import { TelemetryMetricsResponse } from '@/lib/types'
import { getGlossaryTerm } from '@/lib/glossary'

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
                setError(err instanceof Error ? err.message : 'Failed to fetch service data')
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
    const summary = data?.datapoints.at(-1)

    if (!serviceName) {
        return <EmptyState message="Service not found" />
    }

    return (
        <div className="p-8 space-y-6">
            <PageHeader
                title={serviceName}
                description={`Service Health • Namespace: ${namespace}`}
                actions={
                    <div className="flex gap-3">
                        <select
                            value={timeRange}
                            onChange={(e) => setTimeRange(e.target.value)}
                            className="bg-slate-800 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 outline-none"
                        >
                            <option value="1h">Last 1 hour</option>
                            <option value="6h">Last 6 hours</option>
                            <option value="24h">Last 24 hours</option>
                            <option value="7d">Last 7 days</option>
                        </select>
                        <button
                            onClick={() => navigate(`/simulations?service=${namespace}:${serviceName}`)}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors text-sm"
                        >
                            Open in Simulations
                        </button>
                    </div>
                }
            />

            {error && (
                <div className="bg-red-900/20 border border-red-700 rounded-lg p-4 text-red-300">
                    {error}
                </div>
            )}

            {loading && !data && (
                <div className="h-64 flex items-center justify-center">
                    <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
                </div>
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
                            <h3 className="text-sm font-medium text-slate-300 mb-3">{getGlossaryTerm('requestRate').label}</h3>
                            <TimeSeriesLineChart
                                data={data.datapoints.map(d => ({ timestamp: d.timestamp, value: d.requestRate }))}
                                strokeColor="#3b82f6"
                                fillColor="#3b82f6"
                                valueFormatter={formatRps}
                            />
                        </div>
                        <div>
                            <h3 className="text-sm font-medium text-slate-300 mb-3">{getGlossaryTerm('errorRate').label}</h3>
                            <TimeSeriesLineChart
                                data={data.datapoints.map(d => ({ timestamp: d.timestamp, value: d.errorRate }))}
                                strokeColor="#ef4444"
                                fillColor="#ef4444"
                                valueFormatter={formatPercent}
                            />
                        </div>
                        <div className="lg:col-span-2">
                            <h3 className="text-sm font-medium text-slate-300 mb-3">Response Time (Latency)</h3>
                            <LatencyMultiLineChart
                                data={data.datapoints.map(d => ({
                                    timestamp: d.timestamp,
                                    p50: d.p50,
                                    p95: d.p95,
                                    p99: d.p99
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
