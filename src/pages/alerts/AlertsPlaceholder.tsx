import { useEffect, useState, useRef } from 'react'
import { Link } from 'react-router'
import { bffApi, Incident, Overview, connectToAlertStream, WSMessage } from '@/lib/bffApiClient'
import StatusBadge from '@/components/common/StatusBadge'
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

  // Connect to WebSocket for real-time updates
  useEffect(() => {
    const ws = connectToAlertStream(handleWSMessage)
    return () => ws.close()
  }, [])

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
        const incident = incidentDetail.incident

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

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'text-red-500'
      case 'high':
        return 'text-orange-500'
      case 'medium':
        return 'text-yellow-500'
      case 'low':
        return 'text-blue-500'
      default:
        return 'text-gray-500'
    }
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-6">Alerts Dashboard</h1>
        <div className="text-gray-400">Loading...</div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header with gradient */}
      <div className="relative overflow-hidden bg-gradient-to-r from-blue-600/20 via-purple-600/20 to-pink-600/20 rounded-2xl border border-gray-700/50 p-8">
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <Shield className="w-8 h-8 text-blue-400" />
            <h1 className="text-4xl font-bold text-white">Alerts Dashboard</h1>
          </div>
          <p className="text-gray-300 text-lg">
            Real-time incident monitoring and automated response tracking
          </p>
        </div>
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl"></div>
      </div>

      {/* Overview Stats with Enhanced Cards */}
      {overview && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Open Incidents Card */}
          <div className="group relative overflow-hidden bg-gradient-to-br from-orange-500/10 to-red-500/10 backdrop-blur-sm rounded-xl border border-orange-500/30 p-6 hover:border-orange-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-orange-500/20">
            <div className="flex items-start justify-between mb-4">
              <div className="p-3 bg-orange-500/20 rounded-lg">
                <AlertTriangle className="w-6 h-6 text-orange-400" />
              </div>
              <div className="flex items-center gap-1 text-xs text-gray-400">
                <Activity className="w-3 h-3" />
                <span>Live</span>
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-gray-300">Open Incidents</p>
              <p className="text-4xl font-bold text-white">{overview.open_incidents}</p>
              <p className="text-xs text-gray-400">{overview.total_incidents} total incidents</p>
            </div>
            <div className="absolute bottom-0 right-0 w-32 h-32 bg-orange-500/5 rounded-full blur-2xl group-hover:bg-orange-500/10 transition-all"></div>
          </div>

          {/* Critical Alerts Card */}
          <div className="group relative overflow-hidden bg-gradient-to-br from-red-500/10 to-pink-500/10 backdrop-blur-sm rounded-xl border border-red-500/30 p-6 hover:border-red-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-red-500/20">
            <div className="flex items-start justify-between mb-4">
              <div className="p-3 bg-red-500/20 rounded-lg">
                <Zap className="w-6 h-6 text-red-400" />
              </div>
              {overview.critical_count > 0 && (
                <span className="px-2 py-1 bg-red-500/20 text-red-300 text-xs font-semibold rounded-full">
                  URGENT
                </span>
              )}
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-gray-300">Critical Alerts</p>
              <p className="text-4xl font-bold text-white">{overview.critical_count}</p>
              <p className="text-xs text-gray-400">{overview.high_count} high severity</p>
            </div>
            <div className="absolute bottom-0 right-0 w-32 h-32 bg-red-500/5 rounded-full blur-2xl group-hover:bg-red-500/10 transition-all"></div>
          </div>

          {/* Auto Actions Card */}
          <div className="group relative overflow-hidden bg-gradient-to-br from-green-500/10 to-emerald-500/10 backdrop-blur-sm rounded-xl border border-green-500/30 p-6 hover:border-green-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-green-500/20">
            <div className="flex items-start justify-between mb-4">
              <div className="p-3 bg-green-500/20 rounded-lg">
                <CheckCircle2 className="w-6 h-6 text-green-400" />
              </div>
              <div className="flex items-center gap-1 text-xs text-green-400">
                <TrendingUp className="w-3 h-3" />
                <span>Automated</span>
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-gray-300">Auto Actions</p>
              <p className="text-4xl font-bold text-white">{overview.auto_actions_count}</p>
              <p className="text-xs text-gray-400">
                {overview.manual_actions_count} manual reviews
              </p>
            </div>
            <div className="absolute bottom-0 right-0 w-32 h-32 bg-green-500/5 rounded-full blur-2xl group-hover:bg-green-500/10 transition-all"></div>
          </div>

          {/* Services Affected Card */}
          <div className="group relative overflow-hidden bg-gradient-to-br from-blue-500/10 to-cyan-500/10 backdrop-blur-sm rounded-xl border border-blue-500/30 p-6 hover:border-blue-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-blue-500/20">
            <div className="flex items-start justify-between mb-4">
              <div className="p-3 bg-blue-500/20 rounded-lg">
                <Users className="w-6 h-6 text-blue-400" />
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-gray-300">Services Affected</p>
              <p className="text-4xl font-bold text-white">{overview.services_affected}</p>
              <p className="text-xs text-gray-400">Active monitoring</p>
            </div>
            <div className="absolute bottom-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-2xl group-hover:bg-blue-500/10 transition-all"></div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700/50 p-6 shadow-lg">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-5 h-5 text-blue-400" />
          <h2 className="text-lg font-semibold text-white">Filter Incidents</h2>
        </div>
        <div className="flex flex-wrap gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Status</label>
            <select
              value={filter.status}
              onChange={(e) => setFilter({ ...filter, status: e.target.value as any })}
              className="bg-gray-700/70 text-white border border-gray-600/50 rounded-lg px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
            >
              <option value="all">All Statuses</option>
              <option value="open">Open</option>
              <option value="resolved">Resolved</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Severity</label>
            <select
              value={filter.severity}
              onChange={(e) => setFilter({ ...filter, severity: e.target.value })}
              className="bg-gray-700/70 text-white border border-gray-600/50 rounded-lg px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
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
      <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700/50 overflow-hidden shadow-lg">
        <div className="bg-gray-700/30 px-6 py-4 border-b border-gray-700/50">
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
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-700/20">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">
                  Service
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">
                  Severity
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">
                  Action
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">
                  Priority
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">
                  Events
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">
                  Last Update
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/50">
              {incidents.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center justify-center space-y-3">
                      <div className="p-4 bg-gray-700/30 rounded-full">
                        <CheckCircle2 className="w-12 h-12 text-gray-500" />
                      </div>
                      <div className="text-lg font-medium text-gray-400">No incidents found</div>
                      <p className="text-sm text-gray-500 max-w-md">
                        {filter.status === 'open'
                          ? 'All systems are operating normally. No open incidents at this time.'
                          : 'No incidents match the current filter criteria.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                incidents.map((incident) => (
                  <tr
                    key={`${incident.dedupe_key}-${incident.service}`}
                    className="hover:bg-gray-700/30 transition-colors duration-150"
                  >
                    <td className="px-6 py-4">
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
                    <td className="px-6 py-4">
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
                    <td className="px-6 py-4">
                      <StatusBadge variant={incident.status === 'OPEN' ? 'warning' : 'success'}>
                        {incident.status}
                      </StatusBadge>
                    </td>
                    <td className="px-6 py-4">
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
                    <td className="px-6 py-4">
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
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center justify-center w-7 h-7 bg-gray-700/50 rounded-full text-xs font-semibold text-gray-300">
                          {incident.event_count}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
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
      <div className="fixed bottom-4 right-4 z-50 space-y-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="flex items-start gap-3 bg-gray-800 border border-gray-700 rounded-lg shadow-xl p-4 min-w-[320px] max-w-md animate-slide-in"
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
            <button
              onClick={() => dismissToast(toast.id)}
              className="flex-shrink-0 text-gray-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
