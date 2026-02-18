import { useState, useEffect, useCallback } from 'react'
import {
  RefreshCw,
  LayoutDashboard,
  Layers3,
  Globe,
  Heart,
  Zap,
  ShieldCheck,
} from 'lucide-react'
import toast from 'react-hot-toast'
import PageHeader from '@/components/layout/PageHeader'
import LoadingSpinner from '@/components/common/LoadingSpinner'
import {
  cn,
  iconActionButtonClass,
  loadingCardClass,
  pageContainerClass,
} from '@/components/common/uiClassTokens'
import { getTelemetryMetrics, getServices } from '@/lib/api'
import { formatRps, formatPercent } from '@/lib/format'
import IncidentExplorer from '@/pages/overview/IncidentExplorer'
import { getGlossaryTerm } from '@/lib/glossary'

interface OverviewMetricCardProps {
  label: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  iconClassName: string
  hoverBorderClass: string
  value: React.ReactNode
  valueClassName?: string
}

function OverviewMetricCard({
  label,
  description,
  icon: Icon,
  iconClassName,
  hoverBorderClass,
  value,
  valueClassName = 'text-white',
}: Readonly<OverviewMetricCardProps>) {
  return (
    <div
      className={`group relative overflow-hidden rounded-xl border border-slate-700/50 bg-slate-800/50 p-6 backdrop-blur-sm transition-colors ${hoverBorderClass}`}
    >
      <div className="absolute right-0 top-0 p-4 opacity-10 transition-opacity group-hover:opacity-20">
        <Icon className={`h-16 w-16 ${iconClassName}`} />
      </div>
      <div className="relative z-10 flex h-full flex-col justify-between">
        <div>
          <h3 className="mb-1 text-sm font-medium uppercase tracking-wider text-slate-400">{label}</h3>
          <p className="mb-4 text-xs text-slate-500">{description}</p>
        </div>
        <div className={`text-3xl font-bold tracking-tight ${valueClassName}`}>{value}</div>
      </div>
    </div>
  )
}

export default function Overview() {
  const [loading, setLoading] = useState(true)
  const [kpiData, setKpiData] = useState<{
    totalServices: number
    avgRequestRate: number
    avgErrorRate: number
    avgP95: number
    avgAvailability: number
  } | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)

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

      services.forEach((_, idx) => {
        const telemetry = telemetryResults[idx]
        if (!telemetry || telemetry.datapoints.length === 0) {
          return
        }

        const latest = telemetry.datapoints[telemetry.datapoints.length - 1]
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
      toast.error(err instanceof Error ? err.message : 'Failed to load overview data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return (
    <div className={pageContainerClass}>
      <PageHeader
        title="Overview"
        description="System health and top risks"
        icon={LayoutDashboard}
        actions={
          <button
            type="button"
            onClick={fetchData}
            disabled={loading}
            className={cn(
              iconActionButtonClass,
              'cursor-pointer p-2 disabled:bg-slate-600 disabled:opacity-50'
            )}
            title="Refresh data"
            aria-label="Refresh overview data"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        }
      />

      {/* Loading State */}
      {loading && !kpiData && (
        <div className={loadingCardClass}>
          <LoadingSpinner fullHeight={false} message="Loading overview..." />
        </div>
      )}

      {/* KPI Cards */}
      {kpiData && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-5">
          <OverviewMetricCard
            label="Services Monitored"
            description="How many services are currently being observed?"
            icon={Layers3}
            iconClassName="text-indigo-400"
            hoverBorderClass="hover:border-indigo-500/30"
            value={kpiData?.totalServices ?? 0}
            valueClassName="text-indigo-300"
          />
          <OverviewMetricCard
            label={getGlossaryTerm('requestRate').label}
            description="How many requests are arriving across the platform?"
            icon={Globe}
            iconClassName="text-blue-400"
            hoverBorderClass="hover:border-blue-500/30"
            value={formatRps(kpiData?.avgRequestRate ?? 0)}
            valueClassName="text-white"
          />
          <OverviewMetricCard
            label={getGlossaryTerm('errorRate').label}
            description="Percentage of requests failing across observed services."
            icon={Heart}
            iconClassName="text-rose-400"
            hoverBorderClass="hover:border-rose-500/30"
            value={formatPercent(kpiData?.avgErrorRate ?? 0)}
            valueClassName={(() => {
              const rate = kpiData?.avgErrorRate ?? 0
              if (rate > 5) return 'text-rose-400'
              if (rate > 1) return 'text-amber-400'
              return 'text-emerald-400'
            })()}
          />
          <OverviewMetricCard
            label={getGlossaryTerm('p95').label}
            description="How quickly requests complete under higher load."
            icon={Zap}
            iconClassName="text-amber-400"
            hoverBorderClass="hover:border-amber-500/30"
            value={`${(kpiData?.avgP95 ?? 0).toFixed(0)}ms`}
            valueClassName={(() => {
              const p95 = kpiData?.avgP95 ?? 0
              if (p95 > 1000) return 'text-rose-400'
              if (p95 > 500) return 'text-amber-400'
              return 'text-emerald-400'
            })()}
          />
          <OverviewMetricCard
            label={getGlossaryTerm('availability').label}
            description="How consistently services stay reachable and responsive."
            icon={ShieldCheck}
            iconClassName="text-emerald-400"
            hoverBorderClass="hover:border-emerald-500/30"
            value={formatPercent(kpiData?.avgAvailability ?? 0)}
            valueClassName={(() => {
              const avail = kpiData?.avgAvailability ?? 0
              if (avail >= 99) return 'text-emerald-400'
              if (avail >= 95) return 'text-amber-400'
              return 'text-rose-400'
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
