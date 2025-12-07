import { useEffect, useState } from 'react'
import { useParams, useSearchParams, Link } from 'react-router'
import { bffApi, IncidentDetail, AlertEvent } from '@/lib/bffApiClient'
import StatusBadge from '@/components/common/StatusBadge'
import { formatDistanceToNow } from '@/lib/format'
import {
  ArrowLeft,
  Shield,
  AlertTriangle,
  Activity,
  Clock,
  CheckCircle2,
  Zap,
  TrendingUp,
  Server,
  ChevronDown,
  ChevronUp,
  ExternalLink
} from 'lucide-react'

export default function IncidentDetailPage() {
  const { dedupeKey } = useParams<{ dedupeKey: string }>()
  const [searchParams] = useSearchParams()
  const namespace = searchParams.get('namespace') || 'default'
  const service = searchParams.get('service') || ''

  const [incident, setIncident] = useState<IncidentDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!dedupeKey || !service) {
      setError('Missing required parameters')
      setLoading(false)
      return
    }

    loadIncidentDetail()
  }, [dedupeKey, namespace, service])

  const loadIncidentDetail = async () => {
    try {
      setLoading(true)
      const data = await bffApi.getIncidentDetail(dedupeKey!, namespace, service)
      setIncident(data)
      setError(null)
    } catch (err: any) {
      console.error('Failed to load incident detail:', err)
      setError(err.message || 'Failed to load incident')
    } finally {
      setLoading(false)
    }
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-500/20 text-red-400 border-red-500'
      case 'high':
        return 'bg-orange-500/20 text-orange-400 border-orange-500'
      case 'medium':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500'
      case 'low':
        return 'bg-blue-500/20 text-blue-400 border-blue-500'
      default:
        return 'bg-gray-500/20 text-gray-400 border-gray-500'
    }
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto">
        <div className="text-gray-400">Loading incident details...</div>
      </div>
    )
  }

  if (error || !incident) {
    return (
      <div className="max-w-7xl mx-auto">
        <div className="bg-red-900/20 border border-red-500 rounded-lg p-4 text-red-400">
          {error || 'Incident not found'}
        </div>
        <Link to="/alerts" className="text-blue-400 hover:text-blue-300 mt-4 inline-block">
          ← Back to Alerts
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header with gradient */}
      <div className="relative overflow-hidden bg-gradient-to-r from-purple-600/20 via-blue-600/20 to-cyan-600/20 rounded-2xl border border-gray-700/50 p-8">
        <div className="relative z-10">
          <Link 
            to="/alerts" 
            className="inline-flex items-center gap-2 text-blue-400 hover:text-blue-300 text-sm mb-4 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Alerts
          </Link>
          <div className="flex items-center gap-3 mb-2">
            <Shield className="w-8 h-8 text-blue-400" />
            <h1 className="text-4xl font-bold text-white">Incident Details</h1>
          </div>
          <div className="flex items-center gap-3 mt-3">
            <code className="text-sm text-gray-300 bg-gray-800/50 px-3 py-1.5 rounded-lg border border-gray-700">
              {incident.dedupe_key}
            </code>
          </div>
        </div>
        <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl"></div>
      </div>

      {/* Incident Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Decision Card - Primary focus */}
        <div className="group relative overflow-hidden bg-gradient-to-br from-green-500/10 to-emerald-500/10 backdrop-blur-sm rounded-xl border border-green-500/30 p-6 hover:border-green-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-green-500/20">
          <div className="flex items-start justify-between mb-4">
            <div className="p-3 bg-green-500/20 rounded-lg">
              <Zap className="w-6 h-6 text-green-400" />
            </div>
            {incident.auto && (
              <span className="px-3 py-1 bg-green-500/20 text-green-300 text-xs font-semibold rounded-full">
                AUTOMATED
              </span>
            )}
          </div>
          <h2 className="text-xl font-semibold text-white mb-4">Decision & Action</h2>
          <div className="space-y-4">
            <div>
              <div className="text-sm text-gray-400 mb-1">Action</div>
              <div className="text-2xl font-bold text-white">{incident.current_action}</div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-gray-400 mb-1">Automation</div>
                <div className="flex items-center gap-2">
                  {incident.auto ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-green-400" />
                      <span className="text-green-400 font-medium">Automated</span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-4 h-4 text-orange-400" />
                      <span className="text-orange-400 font-medium">Manual</span>
                    </>
                  )}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-400 mb-1">Priority</div>
                <span className={`inline-flex items-center px-3 py-1 rounded-md text-sm font-semibold ${
                  incident.current_priority === 'P1' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                  incident.current_priority === 'P2' ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' :
                  'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                }`}>
                  {incident.current_priority}
                </span>
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-400 mb-1">Risk Score</div>
              <div className="flex items-center gap-3">
                <div className="flex-1 bg-gray-700/50 rounded-full h-2 overflow-hidden">
                  <div 
                    className={`h-full transition-all ${
                      incident.risk_score >= 80 ? 'bg-red-500' :
                      incident.risk_score >= 50 ? 'bg-orange-500' :
                      'bg-yellow-500'
                    }`}
                    style={{ width: `${incident.risk_score}%` }}
                  />
                </div>
                <span className="text-lg font-bold text-white min-w-[3rem] text-right">
                  {incident.risk_score}
                </span>
              </div>
            </div>
            {incident.reason_codes.length > 0 && (
              <div>
                <div className="text-sm text-gray-400 mb-2">Reason Codes</div>
                <div className="flex flex-wrap gap-2">
                  {incident.reason_codes.map((code, idx) => (
                    <span
                      key={idx}
                      className="px-2.5 py-1 bg-blue-500/20 text-blue-300 rounded-md text-xs font-medium border border-blue-500/30"
                    >
                      {code}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="absolute bottom-0 right-0 w-32 h-32 bg-green-500/5 rounded-full blur-2xl group-hover:bg-green-500/10 transition-all"></div>
        </div>

        {/* Incident Metadata */}
        <div className="group relative overflow-hidden bg-gradient-to-br from-blue-500/10 to-purple-500/10 backdrop-blur-sm rounded-xl border border-blue-500/30 p-6 hover:border-blue-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-blue-500/20">
          <div className="flex items-start justify-between mb-4">
            <div className="p-3 bg-blue-500/20 rounded-lg">
              <Server className="w-6 h-6 text-blue-400" />
            </div>
          </div>
          <h2 className="text-xl font-semibold text-white mb-4">Service Information</h2>
          <div className="space-y-4">
            <div>
              <div className="text-sm text-gray-400 mb-1">Service</div>
              <div className="text-xl font-bold text-white">{incident.service}</div>
              <div className="text-sm text-gray-500 mt-0.5">{incident.namespace}</div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-gray-400 mb-1">Status</div>
                <StatusBadge variant={incident.status === 'OPEN' ? 'warning' : 'success'}>
                  {incident.status}
                </StatusBadge>
              </div>
              <div>
                <div className="text-sm text-gray-400 mb-2">Severity</div>
                <span className={`relative inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide ${
                  incident.current_severity === 'critical' 
                    ? 'bg-gradient-to-r from-red-500/30 to-red-600/30 text-red-300 border border-red-500/50 shadow-lg shadow-red-500/20' :
                  incident.current_severity === 'high' 
                    ? 'bg-gradient-to-r from-orange-500/30 to-orange-600/30 text-orange-300 border border-orange-500/50 shadow-lg shadow-orange-500/20' :
                  incident.current_severity === 'medium' 
                    ? 'bg-gradient-to-r from-yellow-500/30 to-yellow-600/30 text-yellow-300 border border-yellow-500/50 shadow-lg shadow-yellow-500/20' :
                  'bg-gradient-to-r from-blue-500/30 to-blue-600/30 text-blue-300 border border-blue-500/50 shadow-lg shadow-blue-500/20'
                }`}>
                  <span className={`relative flex h-2 w-2 ${
                    incident.current_severity === 'critical' ? 'animate-pulse' : ''
                  }`}>
                    <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${
                      incident.current_severity === 'critical' ? 'bg-red-400 animate-ping' :
                      incident.current_severity === 'high' ? 'bg-orange-400' :
                      incident.current_severity === 'medium' ? 'bg-yellow-400' :
                      'bg-blue-400'
                    }`}></span>
                    <span className={`relative inline-flex rounded-full h-2 w-2 ${
                      incident.current_severity === 'critical' ? 'bg-red-500' :
                      incident.current_severity === 'high' ? 'bg-orange-500' :
                      incident.current_severity === 'medium' ? 'bg-yellow-500' :
                      'bg-blue-500'
                    }`}></span>
                  </span>
                  {incident.current_severity}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-gray-400 mb-1">Event Count</div>
                <div className="flex items-center gap-2">
                  <div className="inline-flex items-center justify-center w-8 h-8 bg-gray-700/50 rounded-full">
                    <span className="text-sm font-semibold text-white">{incident.event_count}</span>
                  </div>
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-400 mb-1">Duration</div>
                <div className="flex items-center gap-1.5 text-sm text-white">
                  <Clock className="w-4 h-4 text-gray-500" />
                  {formatDistanceToNow(incident.first_observed_at)}
                </div>
              </div>
            </div>
            <div className="pt-3 border-t border-gray-700/50">
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">First Observed</span>
                <span className="text-gray-300">{formatDistanceToNow(incident.first_observed_at)}</span>
              </div>
              <div className="flex justify-between text-xs mt-2">
                <span className="text-gray-400">Last Update</span>
                <span className="text-gray-300">{formatDistanceToNow(incident.last_observed_at)}</span>
              </div>
            </div>
          </div>
          <div className="absolute bottom-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-2xl group-hover:bg-blue-500/10 transition-all"></div>
        </div>
      </div>

      {/* Quality Flags */}
      {incident.quality_flags.length > 0 && (
        <div className="relative overflow-hidden bg-gradient-to-r from-yellow-500/10 to-orange-500/10 border border-yellow-500/30 rounded-xl p-6 shadow-lg">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-yellow-500/20 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-yellow-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-yellow-400 mb-3">Data Quality Flags</h3>
              <div className="flex flex-wrap gap-2">
                {incident.quality_flags.map((flag, idx) => (
                  <span 
                    key={idx} 
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-yellow-500/20 text-yellow-300 rounded-md text-xs font-medium border border-yellow-500/30"
                  >
                    ⚠️ {flag.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="absolute bottom-0 right-0 w-32 h-32 bg-yellow-500/5 rounded-full blur-2xl"></div>
        </div>
      )}

      {/* Event Timeline */}
      <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700/50 overflow-hidden shadow-lg">
        <div className="bg-gray-700/30 px-6 py-4 border-b border-gray-700/50">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-semibold text-white">Event Timeline</h2>
            <span className="ml-auto text-sm text-gray-400">{incident.events.length} events</span>
          </div>
        </div>
        <div className="p-6 space-y-4">
          {incident.events.map((event, idx) => (
            <EventCard key={event.event_id} event={event} isLatest={idx === 0} />
          ))}
        </div>
      </div>
    </div>
  )
}

function EventCard({ event, isLatest }: { event: AlertEvent; isLatest: boolean }) {
  const [expanded, setExpanded] = useState(false)

  const getSeverityBadge = (severity: string) => {
    const config = {
      critical: { 
        gradient: 'bg-gradient-to-r from-red-500/30 to-red-600/30', 
        text: 'text-red-300', 
        border: 'border-red-500/50',
        shadow: 'shadow-lg shadow-red-500/20',
        dotBg: 'bg-red-400',
        dotPing: 'bg-red-400 animate-ping',
        dot: 'bg-red-500',
        pulse: true
      },
      high: { 
        gradient: 'bg-gradient-to-r from-orange-500/30 to-orange-600/30', 
        text: 'text-orange-300', 
        border: 'border-orange-500/50',
        shadow: 'shadow-lg shadow-orange-500/20',
        dotBg: 'bg-orange-400',
        dotPing: 'bg-orange-400',
        dot: 'bg-orange-500',
        pulse: false
      },
      medium: { 
        gradient: 'bg-gradient-to-r from-yellow-500/30 to-yellow-600/30', 
        text: 'text-yellow-300', 
        border: 'border-yellow-500/50',
        shadow: 'shadow-lg shadow-yellow-500/20',
        dotBg: 'bg-yellow-400',
        dotPing: 'bg-yellow-400',
        dot: 'bg-yellow-500',
        pulse: false
      },
      warning: { 
        gradient: 'bg-gradient-to-r from-yellow-500/30 to-yellow-600/30', 
        text: 'text-yellow-300', 
        border: 'border-yellow-500/50',
        shadow: 'shadow-lg shadow-yellow-500/20',
        dotBg: 'bg-yellow-400',
        dotPing: 'bg-yellow-400',
        dot: 'bg-yellow-500',
        pulse: false
      },
      low: { 
        gradient: 'bg-gradient-to-r from-blue-500/30 to-blue-600/30', 
        text: 'text-blue-300', 
        border: 'border-blue-500/50',
        shadow: 'shadow-lg shadow-blue-500/20',
        dotBg: 'bg-blue-400',
        dotPing: 'bg-blue-400',
        dot: 'bg-blue-500',
        pulse: false
      },
      info: { 
        gradient: 'bg-gradient-to-r from-blue-500/30 to-blue-600/30', 
        text: 'text-blue-300', 
        border: 'border-blue-500/50',
        shadow: 'shadow-lg shadow-blue-500/20',
        dotBg: 'bg-blue-400',
        dotPing: 'bg-blue-400',
        dot: 'bg-blue-500',
        pulse: false
      }
    }[severity] || { 
      gradient: 'bg-gradient-to-r from-gray-500/30 to-gray-600/30', 
      text: 'text-gray-300', 
      border: 'border-gray-500/50',
      shadow: 'shadow-lg shadow-gray-500/20',
      dotBg: 'bg-gray-400',
      dotPing: 'bg-gray-400',
      dot: 'bg-gray-500',
      pulse: false
    }

    return config
  }

  const badge = getSeverityBadge(event.alert.severity)

  return (
    <div className={`relative border ${expanded ? 'border-blue-500/50' : 'border-gray-700'} rounded-xl p-5 transition-all duration-200 ${
      isLatest ? 'bg-blue-500/5 border-blue-500/30' : 'bg-gray-700/20 hover:bg-gray-700/30'
    }`}>
      {isLatest && (
        <div className="absolute top-3 right-3">
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-500/20 text-blue-400 text-xs font-semibold rounded-full border border-blue-500/30">
            <TrendingUp className="w-3 h-3" />
            Latest
          </span>
        </div>
      )}
      
      <div className="flex justify-between items-start mb-3">
        <div className="flex-1 pr-20">
          <div className="flex items-center gap-2 mb-2">
            <span className={`relative inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide ${badge.gradient} ${badge.text} border ${badge.border} ${badge.shadow}`}>
              <span className={`relative flex h-2 w-2 ${badge.pulse ? 'animate-pulse' : ''}`}>
                <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  badge.pulse ? badge.dotPing : badge.dotBg
                }`}></span>
                <span className={`relative inline-flex rounded-full h-2 w-2 ${badge.dot}`}></span>
              </span>
              {event.alert.severity}
            </span>
            <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium ${
              event.alert.state === 'firing' 
                ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' 
                : 'bg-green-500/20 text-green-400 border border-green-500/30'
            }`}>
              {event.alert.state}
            </span>
            <span className="text-xs text-gray-400 bg-gray-700/50 px-2 py-1 rounded">
              {event.alert.type}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Clock className="w-3.5 h-3.5" />
            <span>{new Date(event.observed_at).toLocaleString()}</span>
            <span className="text-gray-600">•</span>
            <code className="text-gray-500">ID: {event.event_id}</code>
          </div>
        </div>
      </div>

      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-blue-400 hover:text-blue-300 text-sm font-medium transition-colors"
      >
        {expanded ? (
          <>
            <ChevronUp className="w-4 h-4" />
            Hide Details
          </>
        ) : (
          <>
            <ChevronDown className="w-4 h-4" />
            Show Details
          </>
        )}
      </button>

      {expanded && (
        <div className="mt-5 space-y-4 border-t border-gray-700/50 pt-5">
          {/* Decision */}
          <div>
            <h4 className="flex items-center gap-2 text-sm font-semibold text-gray-300 mb-3">
              <Zap className="w-4 h-4 text-green-400" />
              Decision
            </h4>
            <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700/50">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-400">Action:</span>{' '}
                  <span className="text-white font-medium">{event.decision.action}</span>
                </div>
                <div>
                  <span className="text-gray-400">Priority:</span>{' '}
                  <span className={`font-semibold ${
                    event.decision.priority === 'P1' ? 'text-red-400' :
                    event.decision.priority === 'P2' ? 'text-orange-400' :
                    'text-blue-400'
                  }`}>{event.decision.priority}</span>
                </div>
                <div>
                  <span className="text-gray-400">Automated:</span>{' '}
                  <span className={event.decision.auto ? 'text-green-400' : 'text-orange-400'}>
                    {event.decision.auto ? '✓ Yes' : '✗ No'}
                  </span>
                </div>
                {event.decision.risk_score !== undefined && (
                  <div>
                    <span className="text-gray-400">Risk Score:</span>{' '}
                    <span className={`font-semibold ${
                      event.decision.risk_score >= 80 ? 'text-red-400' :
                      event.decision.risk_score >= 50 ? 'text-orange-400' :
                      'text-yellow-400'
                    }`}>{event.decision.risk_score}</span>
                  </div>
                )}
              </div>
              {event.decision.reason_codes.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-700/50">
                  <span className="text-gray-400 text-sm">Reason Codes:</span>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {event.decision.reason_codes.map((code, idx) => (
                      <span key={idx} className="px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded text-xs">
                        {code}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Evidence */}
          {event.evidence && Object.keys(event.evidence).length > 0 && (
            <div>
              <h4 className="flex items-center gap-2 text-sm font-semibold text-gray-300 mb-3">
                <Activity className="w-4 h-4 text-purple-400" />
                Evidence
              </h4>
              <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700/50">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {Object.entries(event.evidence).map(([key, value]) => (
                    <div key={key} className="flex flex-col">
                      <span className="text-gray-400 text-xs mb-0.5">{key}:</span>
                      <span className="text-white font-mono text-xs">
                        {value === null || value === undefined 
                          ? '—' 
                          : typeof value === 'object'
                          ? JSON.stringify(value)
                          : String(value)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Impact */}
          {event.impact && Object.keys(event.impact).length > 0 && (
            <div>
              <h4 className="flex items-center gap-2 text-sm font-semibold text-gray-300 mb-3">
                <AlertTriangle className="w-4 h-4 text-orange-400" />
                Impact
              </h4>
              <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700/50">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {Object.entries(event.impact).map(([key, value]) => (
                    <div key={key} className="flex flex-col">
                      <span className="text-gray-400 text-xs mb-0.5">{key}:</span>
                      <span className="text-white font-mono text-xs">
                        {value === null || value === undefined 
                          ? '—' 
                          : typeof value === 'object'
                          ? JSON.stringify(value)
                          : String(value)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Context */}
          {event.context && Object.keys(event.context).length > 0 && (
            <div>
              <h4 className="flex items-center gap-2 text-sm font-semibold text-gray-300 mb-3">
                <Server className="w-4 h-4 text-blue-400" />
                Context
              </h4>
              <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700/50">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {Object.entries(event.context).map(([key, value]) => (
                    <div key={key} className="flex flex-col">
                      <span className="text-gray-400 text-xs mb-0.5">{key}:</span>
                      <span className="text-white font-mono text-xs">
                        {value === null || value === undefined 
                          ? '—' 
                          : typeof value === 'object'
                          ? JSON.stringify(value)
                          : String(value)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Links */}
          {event.links && (Object.keys(event.links).length > 0) && (
            <div>
              <h4 className="flex items-center gap-2 text-sm font-semibold text-gray-300 mb-3">
                <ExternalLink className="w-4 h-4 text-cyan-400" />
                Links
              </h4>
              <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700/50">
                <div className="space-y-2 text-sm">
                  {Object.entries(event.links).map(([key, value]) => (
                    value ? (
                      <div key={key} className="flex items-center gap-2">
                        <span className="text-gray-400 min-w-[100px]">{key}:</span>
                        <a 
                          href={value as string} 
                          className="text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors" 
                          target="_blank" 
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="w-3 h-3" />
                          {value as string}
                        </a>
                      </div>
                    ) : null
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
