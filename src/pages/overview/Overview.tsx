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
import MetricHighlightCard from '@/components/layout/MetricHighlightCard'
import SkeletonBlock from '@/components/common/SkeletonBlock'
import {
  cn,
  loadingCardClass,
  pageContainerClass,
  subtleIconButtonClass,
} from '@/components/common/uiClassTokens'
import { getTelemetryMetrics, getServices } from '@/lib/api'
import { formatRps, formatPercent } from '@/lib/format'
import IncidentExplorer from '@/pages/overview/IncidentExplorer'
import { getGlossaryTerm } from '@/lib/glossary'

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
            className={cn(subtleIconButtonClass)}
            title="Refresh data"
            aria-label="Refresh overview data"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        }
      />

      {/* Loading State */}
      {loading && !kpiData && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-5" aria-label="Loading overview metrics">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={`overview-skeleton-${index}`} className={cn(loadingCardClass, 'p-6 text-left')}>
              <SkeletonBlock variant="line" className="mb-3 w-2/3" />
              <SkeletonBlock variant="line" className="mb-4 w-5/6" />
              <SkeletonBlock variant="title" className="w-1/2" />
            </div>
          ))}
        </div>
      )}

      {/* KPI Cards */}
      {kpiData && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-5">
          <MetricHighlightCard
            label="Services Monitored"
            description="How many services are currently being observed?"
            icon={Layers3}
            value={kpiData?.totalServices ?? 0}
            valueClassName="text-indigo-200"
            tone="indigo"
          />
          <MetricHighlightCard
            label={getGlossaryTerm('requestRate').label}
            description="How many requests are arriving across the platform?"
            icon={Globe}
            value={formatRps(kpiData?.avgRequestRate ?? 0)}
            valueClassName="text-[var(--text-primary)]"
            tone="blue"
          />
          <MetricHighlightCard
            label={getGlossaryTerm('errorRate').label}
            description="Percentage of requests failing across observed services."
            icon={Heart}
            value={formatPercent(kpiData?.avgErrorRate ?? 0)}
            valueClassName={(() => {
              const rate = kpiData?.avgErrorRate ?? 0
              if (rate > 5) return 'text-rose-300'
              if (rate > 1) return 'text-amber-300'
              return 'text-emerald-300'
            })()}
            tone="rose"
          />
          <MetricHighlightCard
            label={getGlossaryTerm('p95').label}
            description="How quickly requests complete under higher load."
            icon={Zap}
            value={`${(kpiData?.avgP95 ?? 0).toFixed(0)}ms`}
            valueClassName={(() => {
              const p95 = kpiData?.avgP95 ?? 0
              if (p95 > 1000) return 'text-rose-300'
              if (p95 > 500) return 'text-amber-300'
              return 'text-emerald-300'
            })()}
            tone="amber"
          />
          <MetricHighlightCard
            label={getGlossaryTerm('availability').label}
            description="How consistently services stay reachable and responsive."
            icon={ShieldCheck}
            value={formatPercent(kpiData?.avgAvailability ?? 0)}
            valueClassName={(() => {
              const avail = kpiData?.avgAvailability ?? 0
              if (avail >= 99) return 'text-emerald-300'
              if (avail >= 95) return 'text-amber-300'
              return 'text-rose-300'
            })()}
            tone="emerald"
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
