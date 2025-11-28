import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router'
import PageHeader from '@/components/layout/PageHeader'
import KPIStatCard from '@/components/layout/KPIStatCard'
import Section from '@/components/layout/Section'
import EmptyState from '@/components/layout/EmptyState'
import RiskBadge from '@/components/layout/RiskBadge'
import { getTelemetryMetrics, getServices } from '@/lib/api'
import { calculateServiceRisk, sortByRisk, type ServiceRisk } from '@/lib/risk'
import { formatRps, formatPercent } from '@/lib/format'

export default function Overview() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [kpiData, setKpiData] = useState<{
    totalServices: number
    avgRequestRate: number
    avgErrorRate: number
    avgP95: number
    avgAvailability: number
  } | null>(null)
  const [topRisks, setTopRisks] = useState<ServiceRisk[]>([])

  useEffect(() => {
    const fetchOverviewData = async () => {
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

        const risks: ServiceRisk[] = []

        services.forEach((service, idx) => {
          const telemetry = telemetryResults[idx]
          if (!telemetry || telemetry.datapoints.length === 0) {
            risks.push(calculateServiceRisk(service.name, service.namespace, undefined))
            return
          }

          const latest = telemetry.datapoints.at(-1)
          if (!latest) return

          totalRequestRate += latest.requestRate
          totalErrorRate += latest.errorRate
          totalP95 += latest.p95
          totalAvailability += latest.availability
          count++

          risks.push(calculateServiceRisk(service.name, service.namespace, latest))
        })

        setKpiData({
          totalServices: services.length,
          avgRequestRate: count > 0 ? totalRequestRate : 0,
          avgErrorRate: count > 0 ? totalErrorRate / count : 0,
          avgP95: count > 0 ? totalP95 / count : 0,
          avgAvailability: count > 0 ? totalAvailability / count : 0,
        })

        setTopRisks(sortByRisk(risks).slice(0, 10))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load overview data')
      } finally {
        setLoading(false)
      }
    }

    fetchOverviewData()
  }, [])

  if (loading) {
    return (
      <div className="p-8">
        <PageHeader title="Overview" description="System health and top risks" />
        <div className="mt-6 bg-slate-800 border border-slate-700 rounded-lg p-12 text-center">
          <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-slate-400">Loading overview...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-8">
        <PageHeader title="Overview" description="System health and top risks" />
        <div className="mt-6 bg-red-900/20 border border-red-700 rounded-lg p-4">
          <p className="text-red-300">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 space-y-6">
      <PageHeader
        title="Overview"
        description="System health and top risks"
        actions={
          <button
            onClick={() => globalThis.location.reload()}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-colors text-sm"
          >
            Refresh
          </button>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <KPIStatCard
          label="Services Monitored"
          value={kpiData?.totalServices ?? 0}
          variant="default"
        />
        <KPIStatCard
          label="Total Req/s"
          value={formatRps(kpiData?.avgRequestRate ?? 0)}
          variant="default"
        />
        <KPIStatCard
          label="Avg Error Rate"
          value={formatPercent(kpiData?.avgErrorRate ?? 0)}
          variant={(() => {
            const rate = kpiData?.avgErrorRate ?? 0
            if (rate > 5) return 'danger'
            if (rate > 1) return 'warning'
            return 'success'
          })()}
        />
        <KPIStatCard
          label="Avg P95 Latency"
          value={`${(kpiData?.avgP95 ?? 0).toFixed(0)}ms`}
          variant={(() => {
            const p95 = kpiData?.avgP95 ?? 0
            if (p95 > 1000) return 'danger'
            if (p95 > 500) return 'warning'
            return 'success'
          })()}
        />
        <KPIStatCard
          label="Avg Availability"
          value={formatPercent(kpiData?.avgAvailability ?? 0)}
          variant={(() => {
            const avail = kpiData?.avgAvailability ?? 0
            if (avail >= 99) return 'success'
            if (avail >= 95) return 'warning'
            return 'danger'
          })()}
        />
      </div>

      {/* Top Risks */}
      <Section title="Top Risks" description="Services ranked by risk level">
        {topRisks.length === 0 ? (
          <EmptyState icon="✅" message="No services at risk. All systems stable." />
        ) : (
          <div className="space-y-3">
            {topRisks
              .filter((r) => r.riskLevel !== 'low')
              .map((risk) => (
                <div
                  key={`${risk.namespace}:${risk.service}`}
                  className="flex items-center justify-between p-4 bg-slate-900 rounded-lg border border-slate-700"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <span className="font-medium text-white">{risk.service}</span>
                      <span className="text-xs text-slate-500">{risk.namespace}</span>
                    </div>
                    <p className="text-sm text-slate-400 mt-1">{risk.reason}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <RiskBadge level={risk.riskLevel} />
                    <button
                      onClick={() =>
                        navigate(`/simulations?service=${risk.namespace}:${risk.service}`)
                      }
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium transition-colors"
                    >
                      Run Prediction
                    </button>
                  </div>
                </div>
              ))}
          </div>
        )}
      </Section>

      {/* Recommended Actions */}
      <Section title="Recommended Actions" description="Based on latest simulation results">
        <EmptyState
          icon="🔮"
          message="Run a simulation to get recommendations"
          action={
            <button
              onClick={() => navigate('/simulations')}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
            >
              Go to Simulations
            </button>
          }
        />
      </Section>
    </div>
  )
}
