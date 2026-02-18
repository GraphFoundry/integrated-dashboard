import { useEffect, useState, useRef } from 'react'
import { Link } from 'react-router'
import { bffApi, Incident, Overview, connectToAlertStream, WSMessage } from '@/lib/bffApiClient'
import StatusBadge from '@/components/common/StatusBadge'
import LoadingSpinner from '@/components/common/LoadingSpinner'
import EmptyState from '@/components/layout/EmptyState'
import {
  cn,
  controlInputMutedClass,
  controlLabelClass,
  loadingCardClass,
  pageContainerClass,
  subtleIconButtonClass,
  tableBodyRowClass,
  tableCellClass,
  tableHeadRowClass,
  tableHeadStickyClass,
  tableHeaderCellClass,
  tableShellClass,
} from '@/components/common/uiClassTokens'
import { formatDistanceToNow } from '@/lib/format'
import {
  AlertTriangle,
  CheckCircle2,
  Activity,
  Shield,
  TrendingUp,
  Clock,
  Zap,
  Users,
  X,
  Bell,
} from 'lucide-react'

interface Toast {
  id: string
  message: string
  type: 'info' | 'warning' | 'success'
}

interface OverviewStatCardProps {
  readonly accentContainerClass: string
  readonly borderClass: string
  readonly hoverBorderClass: string
  readonly hoverShadowClass: string
  readonly glowBaseClass: string
  readonly glowHoverClass: string
  readonly icon: React.ReactNode
  readonly topRight?: React.ReactNode
  readonly title: string
  readonly value: React.ReactNode
  readonly subtitle: React.ReactNode
}

function OverviewStatCard({
  accentContainerClass,
  borderClass,
  hoverBorderClass,
  hoverShadowClass,
  glowBaseClass,
  glowHoverClass,
  icon,
  topRight,
  title,
  value,
  subtitle,
}: OverviewStatCardProps) {
  return (
    <div
      className={`surface-glass interactive-soft group relative overflow-hidden rounded-[var(--radius-md)] border p-6 ${borderClass} ${hoverBorderClass} ${hoverShadowClass}`}
    >
      <div className="mb-4 flex items-start justify-between">
        <div className={`rounded-lg p-3 ${accentContainerClass}`}>{icon}</div>
        {topRight}
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-gray-300">{title}</p>
        <p className="text-4xl font-bold text-white">{value}</p>
        <p className="text-xs text-gray-400">{subtitle}</p>
      </div>
      <div
        className={`absolute bottom-0 right-0 h-32 w-32 rounded-full blur-2xl transition-all ${glowBaseClass} ${glowHoverClass}`}
      />
    </div>
  )
}

export default function AlertsPage() {
  const [overview, setOverview] = useState<Overview | null>(null)
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [loading, setLoading] = useState(true)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [filter, setFilter] = useState<{
    status: 'all' | 'open' | 'resolved'
    severity: string
  }>({
    status: 'open',
    severity: '',
  })

  // Track scroll position for restoration after updates
  const scrollPositionRef = useRef<number>(0)
  const isWebSocketUpdateRef = useRef<boolean>(false)
  const filterRef = useRef(filter)

  // Keep filter ref in sync with current filter state
  useEffect(() => {
    filterRef.current = filter
  }, [filter])

  // Load initial data
  useEffect(() => {
    // Don't save scroll position when filter changes (user intentional action)
    isWebSocketUpdateRef.current = false
    loadDataWithFilters(filter)
  }, [filter])

  // Restore scroll position after WebSocket updates
  useEffect(() => {
    if (isWebSocketUpdateRef.current && scrollPositionRef.current > 0 && !loading) {
      // Use requestAnimationFrame to ensure DOM is updated
      requestAnimationFrame(() => {
        window.scrollTo({
          top: scrollPositionRef.current,
          behavior: 'instant' as ScrollBehavior,
        })
        isWebSocketUpdateRef.current = false
      })
    }
  }, [incidents, loading])

  const loadDataWithFilters = async (filterToUse: typeof filter) => {
    try {
      setLoading(true)
      const [overviewData, incidentsData] = await Promise.all([
        bffApi.getOverview(),
        bffApi.getIncidents({
          status: filterToUse.status,
          severity: filterToUse.severity || undefined,
        }),
      ])
      setOverview(overviewData)
      setIncidents(incidentsData.incidents)
    } catch (error) {
      console.error('Failed to load alerts data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleWSMessage = async (message: WSMessage) => {
    if (message.type === 'incident_updated') {
      const { dedupe_key, namespace, service, state } = message.data

      // Save current scroll position before updating
      scrollPositionRef.current = window.scrollY
      isWebSocketUpdateRef.current = true

      // Use current filter values from ref to avoid stale closure
      const currentFilter = filterRef.current

      // Fetch the updated incident to check if it matches current filters
      try {
        const incidentDetail = await bffApi.getIncidentDetail(dedupe_key, namespace, service)
        const incident = incidentDetail

        // Check if incident matches current filters
        const statusMatches =
          currentFilter.status === 'all' ||
          (currentFilter.status === 'open' && incident.status === 'OPEN') ||
          (currentFilter.status === 'resolved' && incident.status === 'RESOLVED')

        const severityMatches =
          !currentFilter.severity || incident.current_severity === currentFilter.severity

        const matchesFilter = statusMatches && severityMatches

        // Show toast if incident doesn't match current filter
        if (!matchesFilter) {
          const toastMessage =
            state === 'resolved'
              ? `Incident resolved: ${service} (filtered out)`
              : `New incident update: ${service} (filtered out)`

          showToast(toastMessage, 'info')
        }
      } catch (error) {
        console.error('Failed to fetch incident details:', error)
      }

      // Always reload data with current filters
      loadDataWithFilters(currentFilter)
    }
  }

  // Stable ref so the WS callback always sees the latest closure without causing reconnects
  // Declared after handleWSMessage to avoid the temporal dead zone
  const handleWSMessageRef = useRef<(msg: WSMessage) => void>(() => {})
  handleWSMessageRef.current = handleWSMessage

  // Connect to WebSocket for real-time updates (auto-reconnect on disconnect)
  useEffect(() => {
    const cleanup = connectToAlertStream((msg) => handleWSMessageRef.current(msg))
    return cleanup
  }, [])

  const showToast = (message: string, type: Toast['type'] = 'info') => {
    const id = Date.now().toString()
    setToasts((prev) => [...prev, { id, message, type }])

    // Auto-dismiss after 5 seconds
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 5000)
  }

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }


  if (loading) {
    return (
      <div className={pageContainerClass}>
        <div className={loadingCardClass}>
          <LoadingSpinner fullHeight={false} message="Loading alerts dashboard..." />
        </div>
      </div>
    )
  }

  return (
    <div className={pageContainerClass}>
      {/* Header with gradient */}
      <div className="surface-panel relative overflow-hidden rounded-[var(--radius-lg)] border border-white/12 p-8">
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <Shield className="w-8 h-8 text-cyan-300" />
            <h1 className="text-4xl font-bold text-[var(--text-primary)]">Alerts Dashboard</h1>
          </div>
          <p className="text-lg text-[var(--text-secondary)]">
            Real-time incident monitoring and automated response tracking
          </p>
        </div>
        <div className="absolute top-0 right-0 h-64 w-64 rounded-full bg-cyan-400/10 blur-3xl"></div>
      </div>

      {/* Overview Stats with Enhanced Cards */}
      {overview && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <OverviewStatCard
            accentContainerClass="bg-orange-400/15"
            borderClass="border-orange-300/26 bg-orange-400/6"
            hoverBorderClass="hover:border-orange-300/42"
            hoverShadowClass="hover:shadow-[0_16px_30px_rgba(251,146,60,0.18)]"
            glowBaseClass="bg-orange-500/5"
            glowHoverClass="group-hover:bg-orange-500/10"
            icon={<AlertTriangle className="w-6 h-6 text-orange-400" />}
            topRight={
              <div className="flex items-center gap-1 text-xs text-gray-400">
                <Activity className="w-3 h-3" />
                <span>Live</span>
              </div>
            }
            title="Open Incidents"
            value={overview.open_incidents}
            subtitle={`${overview.total_incidents} total incidents`}
          />

          <OverviewStatCard
            accentContainerClass="bg-rose-400/15"
            borderClass="border-rose-300/28 bg-rose-400/6"
            hoverBorderClass="hover:border-rose-300/45"
            hoverShadowClass="hover:shadow-[0_16px_30px_rgba(244,63,94,0.2)]"
            glowBaseClass="bg-red-500/5"
            glowHoverClass="group-hover:bg-red-500/10"
            icon={<Zap className="w-6 h-6 text-red-400" />}
            topRight={
              overview.critical_count > 0 ? (
                <span className="rounded-full border border-rose-300/35 bg-rose-400/14 px-2 py-1 text-xs font-semibold text-rose-200">
                  URGENT
                </span>
              ) : undefined
            }
            title="Critical Alerts"
            value={overview.critical_count}
            subtitle={`${overview.high_count} high severity`}
          />

          <OverviewStatCard
            accentContainerClass="bg-emerald-400/15"
            borderClass="border-emerald-300/26 bg-emerald-400/6"
            hoverBorderClass="hover:border-emerald-300/42"
            hoverShadowClass="hover:shadow-[0_16px_30px_rgba(16,185,129,0.2)]"
            glowBaseClass="bg-green-500/5"
            glowHoverClass="group-hover:bg-green-500/10"
            icon={<CheckCircle2 className="w-6 h-6 text-green-400" />}
            topRight={
              <div className="flex items-center gap-1 text-xs text-green-400">
                <TrendingUp className="w-3 h-3" />
                <span>Automated</span>
              </div>
            }
            title="Auto Actions"
            value={overview.auto_actions_count}
            subtitle={`${overview.manual_actions_count} manual reviews`}
          />

          <OverviewStatCard
            accentContainerClass="bg-blue-400/15"
            borderClass="border-blue-300/26 bg-blue-400/6"
            hoverBorderClass="hover:border-blue-300/42"
            hoverShadowClass="hover:shadow-[0_16px_30px_rgba(59,130,246,0.2)]"
            glowBaseClass="bg-blue-500/5"
            glowHoverClass="group-hover:bg-blue-500/10"
            icon={<Users className="w-6 h-6 text-blue-400" />}
            title="Services Affected"
            value={overview.services_affected}
            subtitle="Active monitoring"
          />
        </div>
      )}

      {/* Filters */}
      <div className="surface-glass rounded-[var(--radius-md)] border border-white/12 p-6 shadow-[0_16px_30px_rgba(2,6,23,0.24)]">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-5 h-5 text-blue-400" />
          <h2 className="text-lg font-semibold text-white">Filter Incidents</h2>
        </div>
        <div className="flex flex-wrap gap-4">
          <div>
            <label htmlFor="alerts-status-filter" className={controlLabelClass}>
              Status
            </label>
            <select
              id="alerts-status-filter"
              value={filter.status}
              onChange={(e) => setFilter({ ...filter, status: e.target.value as any })}
              className={cn(controlInputMutedClass, 'appearance-none pr-11')}
            >
              <option value="all">All Statuses</option>
              <option value="open">Open</option>
              <option value="resolved">Resolved</option>
            </select>
          </div>

          <div>
            <label htmlFor="alerts-severity-filter" className={controlLabelClass}>
              Severity
            </label>
            <select
              id="alerts-severity-filter"
              value={filter.severity}
              onChange={(e) => setFilter({ ...filter, severity: e.target.value })}
              className={cn(controlInputMutedClass, 'appearance-none pr-11')}
            >
              <option value="">All Severities</option>
              <option value="critical">🔴 Critical</option>
              <option value="high">🟠 High</option>
              <option value="medium">🟡 Medium</option>
              <option value="low">🔵 Low</option>
            </select>
          </div>
        </div>
      </div>

      {/* Incidents Table */}
      <div className={tableShellClass}>
        <div className="border-b border-white/10 bg-white/[0.03] px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-400" />
              <h2 className="text-lg font-semibold text-white">Active Incidents</h2>
            </div>
            <div className="text-sm text-gray-400">
              {incidents.length} {incidents.length === 1 ? 'incident' : 'incidents'}
            </div>
          </div>
        </div>
        <div className="max-h-[620px] overflow-auto">
          <table className="w-full">
            <thead className={cn(tableHeadRowClass, tableHeadStickyClass)}>
              <tr>
                <th className={tableHeaderCellClass}>Service</th>
                <th className={tableHeaderCellClass}>Severity</th>
                <th className={tableHeaderCellClass}>Status</th>
                <th className={tableHeaderCellClass}>Action</th>
                <th className={tableHeaderCellClass}>Priority</th>
                <th className={tableHeaderCellClass}>Events</th>
                <th className={tableHeaderCellClass}>Last Update</th>
              </tr>
            </thead>
            <tbody>
              {incidents.length === 0 ? (
                <tr>
                  <td colSpan={7} className={cn(tableCellClass, 'py-16 text-center')}>
                    <EmptyState
                      icon={<CheckCircle2 className="h-12 w-12 text-gray-500" />}
                      title="No incidents found"
                      message={
                        filter.status === 'open'
                          ? 'All systems are operating normally.'
                          : 'No incidents match the current filter criteria.'
                      }
                      description={
                        filter.status === 'open'
                          ? 'No open incidents at this time.'
                          : undefined
                      }
                    />
                  </td>
                </tr>
              ) : (
                incidents.map((incident) => (
                  <tr
                    key={`${incident.dedupe_key}-${incident.service}`}
                    className={cn(tableBodyRowClass, 'transition-colors duration-150')}
                  >
                    <td className={tableCellClass}>
                      <Link
                        to={`/alerts/${encodeURIComponent(incident.dedupe_key)}?namespace=${incident.namespace}&service=${incident.service}`}
                        className="group flex flex-col"
                      >
                        <span className="text-blue-400 hover:text-blue-300 font-medium transition-colors group-hover:underline">
                          {incident.service}
                        </span>
                        <span className="text-xs text-gray-500 mt-0.5">{incident.namespace}</span>
                      </Link>
                    </td>
                    <td className={tableCellClass}>
                      <div className="inline-flex items-center gap-2">
                        <span
                          className={`relative inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide ${
                            incident.current_severity === 'critical'
                              ? 'bg-gradient-to-r from-red-500/30 to-red-600/30 text-red-300 border border-red-500/50 shadow-lg shadow-red-500/20'
                              : incident.current_severity === 'high'
                                ? 'bg-gradient-to-r from-orange-500/30 to-orange-600/30 text-orange-300 border border-orange-500/50 shadow-lg shadow-orange-500/20'
                                : incident.current_severity === 'medium'
                                  ? 'bg-gradient-to-r from-yellow-500/30 to-yellow-600/30 text-yellow-300 border border-yellow-500/50 shadow-lg shadow-yellow-500/20'
                                  : 'bg-gradient-to-r from-blue-500/30 to-blue-600/30 text-blue-300 border border-blue-500/50 shadow-lg shadow-blue-500/20'
                          }`}
                        >
                          <span
                            className={`relative flex h-2 w-2 ${
                              incident.current_severity === 'critical' ? 'animate-pulse' : ''
                            }`}
                          >
                            <span
                              className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${
                                incident.current_severity === 'critical'
                                  ? 'bg-red-400 animate-ping'
                                  : incident.current_severity === 'high'
                                    ? 'bg-orange-400'
                                    : incident.current_severity === 'medium'
                                      ? 'bg-yellow-400'
                                      : 'bg-blue-400'
                              }`}
                            ></span>
                            <span
                              className={`relative inline-flex rounded-full h-2 w-2 ${
                                incident.current_severity === 'critical'
                                  ? 'bg-red-500'
                                  : incident.current_severity === 'high'
                                    ? 'bg-orange-500'
                                    : incident.current_severity === 'medium'
                                      ? 'bg-yellow-500'
                                      : 'bg-blue-500'
                              }`}
                            ></span>
                          </span>
                          {incident.current_severity}
                        </span>
                      </div>
                    </td>
                    <td className={tableCellClass}>
                      <StatusBadge variant={incident.status === 'OPEN' ? 'warning' : 'success'}>
                        {incident.status}
                      </StatusBadge>
                    </td>
                    <td className={tableCellClass}>
                      <div className="flex flex-col gap-1">
                        <span className="text-sm font-medium text-white">
                          {incident.current_action}
                        </span>
                        <span className="text-xs text-gray-400 flex items-center gap-1">
                          {incident.auto ? (
                            <>
                              <span className="inline-block w-1.5 h-1.5 bg-green-400 rounded-full"></span>
                              Automated
                            </>
                          ) : (
                            <>
                              <span className="inline-block w-1.5 h-1.5 bg-orange-400 rounded-full"></span>
                              Manual
                            </>
                          )}
                        </span>
                      </div>
                    </td>
                    <td className={tableCellClass}>
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold ${
                          incident.current_priority === 'P1'
                            ? 'bg-red-500/20 text-red-400'
                            : incident.current_priority === 'P2'
                              ? 'bg-orange-500/20 text-orange-400'
                              : 'bg-blue-500/20 text-blue-400'
                        }`}
                      >
                        {incident.current_priority}
                      </span>
                    </td>
                    <td className={tableCellClass}>
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center justify-center w-7 h-7 bg-gray-700/50 rounded-full text-xs font-semibold text-gray-300">
                          {incident.event_count}
                        </span>
                      </div>
                    </td>
                    <td className={tableCellClass}>
                      <div className="flex items-center gap-1.5 text-sm text-gray-300">
                        <Clock className="w-3.5 h-3.5 text-gray-500" />
                        {formatDistanceToNow(incident.last_observed_at)}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Toast Notifications */}
      <div className="fixed bottom-4 right-4 z-50 space-y-2" aria-live="polite" aria-atomic="true">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="surface-glass flex min-w-[320px] max-w-md items-start gap-3 rounded-lg border border-white/14 p-4 shadow-xl animate-slide-in"
          >
            <div
              className={`flex-shrink-0 p-2 rounded-lg ${
                toast.type === 'success'
                  ? 'bg-green-500/20'
                  : toast.type === 'warning'
                    ? 'bg-orange-500/20'
                    : 'bg-blue-500/20'
              }`}
            >
              <Bell
                className={`w-5 h-5 ${
                  toast.type === 'success'
                    ? 'text-green-400'
                    : toast.type === 'warning'
                      ? 'text-orange-400'
                      : 'text-blue-400'
                }`}
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white">{toast.message}</p>
            </div>
            <button type="button"
              onClick={() => dismissToast(toast.id)}
              className={cn(subtleIconButtonClass, 'h-8 w-8 bg-white/5 text-gray-300')}
              aria-label="Dismiss notification"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
