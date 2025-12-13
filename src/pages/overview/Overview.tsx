import { useState, useEffect, useCallback } from 'react'
import { RefreshCw } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import KPIStatCard from '@/components/layout/KPIStatCard'
import { getTelemetryMetrics, getServices } from '@/lib/api'
import { formatRps, formatPercent } from '@/lib/format'
import IncidentExplorer from '@/pages/overview/IncidentExplorer'
import { getGlossaryTerm } from '@/lib/glossary'

export default function Overview() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [kpiData, setKpiData] = useState<{
    totalServices: number
    avgRequestRate: number
    avgErrorRate: number
    avgP95: number
    avgAvailability: number
  } | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      // Fetch services
      const servicesResponse = await getServices()
      const services = servicesResponse.services

      // Fetch latest telemetry for all services (last 5 minutes)
      const now = new Date()
      const from = new Date(now.getTime() - 5 * 60 * 1000)

      const telemetryPromises = services.slice(0, 20).map((service) =>
        getTelemetryMetrics({
          service: service.name,
          from: from.toISOString(),
          to: now.toISOString(),
          step: 60,
        }).catch(() => null)
      )

      const telemetryResults = await Promise.all(telemetryPromises)

      // Calculate KPIs from latest datapoints
      let totalRequestRate = 0
      let totalErrorRate = 0
      let totalP95 = 0
      let totalAvailability = 0
      let count = 0

      services.forEach((service, idx) => {
        const telemetry = telemetryResults[idx]
        if (!telemetry || telemetry.datapoints.length === 0) {
          return
        }

        const latest = telemetry.datapoints.at(-1)
        if (!latest) return

        totalRequestRate += latest.requestRate
        totalErrorRate += latest.errorRate
        totalP95 += latest.p95
        totalAvailability += latest.availability
        count++
      })

      setKpiData({
        totalServices: services.length,
        avgRequestRate: count > 0 ? totalRequestRate : 0,
        avgErrorRate: count > 0 ? totalErrorRate / count : 0,
        avgP95: count > 0 ? totalP95 / count : 0,
        avgAvailability: count > 0 ? totalAvailability / count : 0,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load overview data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return (
    <div className="p-8 space-y-6">
      <PageHeader
        title="Overview"
        description="System health and top risks"
        actions={
          <button
            onClick={fetchData}
            disabled={loading}
            className="p-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 disabled:opacity-50 text-white rounded-lg transition-colors cursor-pointer"
            title="Refresh data"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        }
      />

      {/* Loading State */}
      {loading && !kpiData && (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-12 text-center">
          <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-slate-400">Loading overview...</p>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-red-900/20 border border-red-700 rounded-lg p-4">
          <p className="text-red-300">{error}</p>
        </div>
      )}

      {/* KPI Cards */}
      {kpiData && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <KPIStatCard
            label="Services Monitored"
            value={kpiData?.totalServices ?? 0}
            variant="default"
          />
          <KPIStatCard
            label={getGlossaryTerm('requestRate').label}
            value={formatRps(kpiData?.avgRequestRate ?? 0)}
            variant="default"
          />
          <KPIStatCard
            label={getGlossaryTerm('errorRate').label}
            value={formatPercent(kpiData?.avgErrorRate ?? 0)}
            variant={(() => {
              const rate = kpiData?.avgErrorRate ?? 0
              if (rate > 5) return 'danger'
              if (rate > 1) return 'warning'
              return 'success'
            })()}
          />
          <KPIStatCard
            label={getGlossaryTerm('p95').label}
            value={`${(kpiData?.avgP95 ?? 0).toFixed(0)}ms`}
            variant={(() => {
              const p95 = kpiData?.avgP95 ?? 0
              if (p95 > 1000) return 'danger'
              if (p95 > 500) return 'warning'
              return 'success'
            })()}
          />
          <KPIStatCard
            label={getGlossaryTerm('availability').label}
            value={formatPercent(kpiData?.avgAvailability ?? 0)}
            variant={(() => {
              const avail = kpiData?.avgAvailability ?? 0
              if (avail >= 99) return 'success'
              if (avail >= 95) return 'warning'
              return 'danger'
            })()}
          />
        </div>
      )}

      {/* Incident Explorer */}
      <div className="w-full">
        <IncidentExplorer />
      </div>
    </div>
  )
}
