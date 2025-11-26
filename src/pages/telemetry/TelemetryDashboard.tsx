import { useState, useEffect } from 'react'
import { getTelemetryMetrics, getServices } from '@/lib/api'

interface TelemetryDatapoint {
  timestamp: string
  service: string
  namespace: string
  requestRate: number
  errorRate: number
  p50: number
  p95: number
  p99: number
  availability: number
}

interface TelemetryResponse {
  service: string
  from: string
  to: string
  step: number
  datapoints: TelemetryDatapoint[]
}

export default function TelemetryDashboard() {
  const [serviceName, setServiceName] = useState('')
  const [timeRange, setTimeRange] = useState('1h')
  const [data, setData] = useState<TelemetryResponse | null>(null)
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

  const formatTimestamp = (ts: string) => {
    return new Date(ts).toLocaleString()
  }

  const formatMetric = (value: number | undefined) => {
    if (value === undefined || value === null) return 'N/A'
    return value.toFixed(2)
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white">Service Telemetry</h1>
        <p className="text-slate-400 mt-1">Time-series metrics from InfluxDB</p>
      </div>

      {/* Controls */}
      <div className="bg-slate-800 rounded-lg p-6">
        <div className="flex gap-4 items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-slate-300 mb-2">Service Name</label>
            <select
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
            <label className="block text-sm font-medium text-slate-300 mb-2">Time Range</label>
            <select
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
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-900/20 border border-red-700 rounded-lg p-4">
          <p className="text-red-300">{error}</p>
        </div>
      )}

      {/* Data Table */}
      {data && data.datapoints.length > 0 && (
        <div className="bg-slate-800 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-900 border-b border-slate-700">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase">
                    Timestamp
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase">
                    Service
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-300 uppercase">
                    Req/s
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-300 uppercase">
                    Error %
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-300 uppercase">
                    P50
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-300 uppercase">
                    P95
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-300 uppercase">
                    P99
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-300 uppercase">
                    Avail %
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {data.datapoints.map((point, idx) => (
                  <tr key={idx} className="hover:bg-slate-700/50">
                    <td className="px-4 py-3 text-sm text-slate-300">
                      {formatTimestamp(point.timestamp)}
                    </td>
                    <td className="px-4 py-3 text-sm text-white font-mono">{point.service}</td>
                    <td className="px-4 py-3 text-sm text-slate-300 text-right font-mono">
                      {formatMetric(point.requestRate)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-mono">
                      <span
                        className={
                          point.errorRate > 5
                            ? 'text-red-400'
                            : point.errorRate > 1
                              ? 'text-yellow-400'
                              : 'text-green-400'
                        }
                      >
                        {formatMetric(point.errorRate)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300 text-right font-mono">
                      {formatMetric(point.p50)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300 text-right font-mono">
                      {formatMetric(point.p95)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300 text-right font-mono">
                      {formatMetric(point.p99)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-mono">
                      <span
                        className={
                          point.availability >= 99
                            ? 'text-green-400'
                            : point.availability >= 95
                              ? 'text-yellow-400'
                              : 'text-red-400'
                        }
                      >
                        {formatMetric(point.availability)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty State */}
      {data && data.datapoints.length === 0 && (
        <div className="bg-slate-800 rounded-lg p-12 text-center">
          <p className="text-slate-400">No data available for the selected time range</p>
        </div>
      )}
    </div>
  )
}
