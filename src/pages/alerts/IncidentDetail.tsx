import { useEffect, useState } from 'react'
import { useParams, useSearchParams, Link } from 'react-router'
import { bffApi, IncidentDetail, AlertEvent } from '@/lib/bffApiClient'
import StatusBadge from '@/components/common/StatusBadge'
import SkeletonBlock from '@/components/common/SkeletonBlock'
import ErrorBanner from '@/components/common/ErrorBanner'
import {
  cn,
  glassInteractiveCardClass,
  pageContainerClass,
  tableShellClass,
} from '@/components/common/uiClassTokens'
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
  ExternalLink,
  Check,
  X,
} from 'lucide-react'

function DetailField({
  label,
  children,
  className = '',
}: {
  readonly label: string
  readonly children: React.ReactNode
  readonly className?: string
}) {
  return (
    <div className={className}>
      <div className="mb-1 text-sm text-[var(--text-muted)]">{label}</div>
      {children}
    </div>
  )
}

interface EventObjectSectionProps {
  readonly title: string
  readonly icon: React.ComponentType<{ className?: string }>
  readonly iconClassName: string
  readonly data?: Record<string, unknown>
}

function EventObjectSection({ title, icon: Icon, iconClassName, data }: EventObjectSectionProps) {
  if (!data || Object.keys(data).length === 0) return null

  return (
    <div>
      <h4 className="flex items-center gap-2 text-sm font-semibold text-[var(--text-secondary)] mb-3">
        <Icon className={`h-4 w-4 ${iconClassName}`} />
        {title}
      </h4>
      <div className="surface-glass rounded-lg border border-[var(--border)] p-4">
        <div className="grid grid-cols-2 gap-3 text-sm">
          {Object.entries(data).map(([key, value]) => (
            <div key={key} className="flex flex-col">
              <span className="text-[var(--text-muted)] text-xs mb-0.5">{key}:</span>
              <span className="text-[var(--text-primary)] font-mono text-xs">
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
  )
}

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

  if (loading) {
    return (
      <div className={pageContainerClass} aria-busy="true">
        <div className="surface-panel relative overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] p-8">
          <div className="relative z-10">
            <SkeletonBlock variant="line" className="mb-4 h-6 w-40" />
            <div className="flex items-center gap-3 mb-2">
              <SkeletonBlock variant="line" className="h-8 w-8 rounded-full" />
              <SkeletonBlock variant="title" className="h-10 w-72" />
            </div>
            <SkeletonBlock variant="line" className="mt-3 h-8 w-64 rounded-lg" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {Array.from({ length: 2 }).map((_, index) => (
            <div
              key={`incident-card-skeleton-${index}`}
              className={cn(glassInteractiveCardClass, 'group relative border-[var(--border)]')}
            >
              <div className="flex items-start justify-between mb-4">
                <SkeletonBlock variant="line" className="h-12 w-12 rounded-lg" />
                <SkeletonBlock variant="line" className="h-6 w-24 rounded-full" />
              </div>
              <SkeletonBlock variant="title" className="mb-4 h-7 w-48" />
              <div className="space-y-4">
                <SkeletonBlock variant="line" className="h-8 w-3/4" />
                <div className="grid grid-cols-2 gap-4">
                  <SkeletonBlock variant="line" className="h-10 w-full" />
                  <SkeletonBlock variant="line" className="h-10 w-full" />
                </div>
                <SkeletonBlock variant="line" className="h-2 w-full rounded-full" />
              </div>
            </div>
          ))}
        </div>

        <div className={tableShellClass}>
          <div className="border-b border-[var(--border)] bg-[var(--surface-subtle)] px-6 py-4">
            <div className="flex items-center gap-2">
              <SkeletonBlock variant="line" className="h-5 w-48" />
              <SkeletonBlock variant="line" className="ml-auto h-4 w-20" />
            </div>
          </div>
          <div className="p-6 space-y-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={`incident-event-skeleton-${index}`}
                className="surface-glass relative rounded-[var(--radius-md)] border border-[var(--border)] p-5"
              >
                <SkeletonBlock variant="line" className="mb-3 h-7 w-32 rounded-full" />
                <SkeletonBlock variant="line" className="mb-2 h-5 w-3/4" />
                <SkeletonBlock variant="line" className="h-4 w-1/2" />
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error || !incident) {
    return (
      <div className={pageContainerClass}>
        <ErrorBanner message={error || 'Incident not found'} />
        <Link to="/alerts" className="text-blue-400 hover:text-blue-300 mt-4 inline-block">
          ← Back to Alerts
        </Link>
      </div>
    )
  }

  return (
    <div className={pageContainerClass}>
      {/* Header with gradient */}
      <div className="surface-panel relative overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] p-8">
        <div className="relative z-10">
          <Link
            to="/alerts"
            className="neon-focus-ring interactive-soft mb-4 inline-flex items-center gap-2 rounded-md px-2 py-1 text-sm text-cyan-300 hover:text-cyan-200"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Alerts
          </Link>
          <div className="flex items-center gap-3 mb-2">
            <Shield className="h-8 w-8 text-cyan-300" />
            <h1 className="text-4xl font-bold text-[var(--text-primary)]">Incident Details</h1>
          </div>
          <div className="flex items-center gap-3 mt-3">
            <code className="rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] px-3 py-1.5 text-sm text-[var(--text-secondary)]">
              {incident.dedupe_key}
            </code>
          </div>
        </div>
        <div className="absolute right-0 top-0 h-64 w-64 rounded-full bg-cyan-400/10 blur-3xl" />
      </div>

      {/* Incident Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Decision Card - Primary focus */}
        <div
          className={cn(
            glassInteractiveCardClass,
            'group relative border-emerald-300/26 bg-emerald-400/6 hover:border-emerald-300/40 hover:shadow-[0_18px_34px_rgba(16,185,129,0.2)]'
          )}
        >
          <div className="flex items-start justify-between mb-4">
            <div className="rounded-lg bg-emerald-400/18 p-3">
              <Zap className="w-6 h-6 text-green-400" />
            </div>
            {incident.auto && (
              <span className="rounded-full border border-emerald-300/35 bg-emerald-400/14 px-3 py-1 text-xs font-semibold text-emerald-200">
                AUTOMATED
              </span>
            )}
          </div>
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-4">Decision & Action</h2>
          <div className="space-y-4">
            <DetailField label="Action">
              <div className="text-2xl font-bold text-[var(--text-primary)]">{incident.current_action}</div>
            </DetailField>
            <div className="grid grid-cols-2 gap-4">
              <DetailField label="Automation">
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
              </DetailField>
              <DetailField label="Priority">
                <span
                  className={`inline-flex items-center px-3 py-1 rounded-md text-sm font-semibold ${
                    incident.current_priority === 'P1'
                      ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                      : incident.current_priority === 'P2'
                        ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                        : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                  }`}
                >
                  {incident.current_priority}
                </span>
              </DetailField>
            </div>
            <DetailField label="Risk Score">
              <div className="flex items-center gap-3">
                <div className="flex-1 bg-[var(--surface-soft)] rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      incident.risk_score >= 80
                        ? 'bg-red-500'
                        : incident.risk_score >= 50
                          ? 'bg-orange-500'
                          : 'bg-yellow-500'
                    }`}
                    style={{ width: `${incident.risk_score}%` }}
                  />
                </div>
                <span className="text-lg font-bold text-[var(--text-primary)] min-w-[3rem] text-right">
                  {incident.risk_score}
                </span>
              </div>
            </DetailField>
            {incident.reason_codes.length > 0 && (
              <DetailField label="Reason Codes">
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
              </DetailField>
            )}
          </div>
          <div className="absolute bottom-0 right-0 h-32 w-32 rounded-full bg-green-500/5 blur-2xl transition-all group-hover:bg-green-500/10" />
        </div>

        {/* Incident Metadata */}
        <div
          className={cn(
            glassInteractiveCardClass,
            'group relative border-blue-300/26 bg-blue-400/6 hover:border-blue-300/42 hover:shadow-[0_18px_34px_rgba(59,130,246,0.2)]'
          )}
        >
          <div className="flex items-start justify-between mb-4">
            <div className="rounded-lg bg-blue-400/18 p-3">
              <Server className="w-6 h-6 text-blue-400" />
            </div>
          </div>
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-4">Service Information</h2>
          <div className="space-y-4">
            <DetailField label="Service">
              <div className="text-xl font-bold text-[var(--text-primary)]">{incident.service}</div>
              <div className="text-sm text-[var(--text-dim)] mt-0.5">{incident.namespace}</div>
            </DetailField>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-[var(--text-muted)] mb-1">Status</div>
                <StatusBadge variant={incident.status === 'OPEN' ? 'warning' : 'success'}>
                  {incident.status}
                </StatusBadge>
              </div>
              <div>
                <div className="text-sm text-[var(--text-muted)] mb-2">Severity</div>
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
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-[var(--text-muted)] mb-1">Event Count</div>
                <div className="flex items-center gap-2">
                  <div className="inline-flex items-center justify-center w-8 h-8 bg-[var(--surface-soft)] rounded-full">
                    <span className="text-sm font-semibold text-[var(--text-primary)]">{incident.event_count}</span>
                  </div>
                </div>
              </div>
              <div>
                <div className="text-sm text-[var(--text-muted)] mb-1">Duration</div>
                <div className="flex items-center gap-1.5 text-sm text-[var(--text-primary)]">
                  <Clock className="w-4 h-4 text-[var(--text-dim)]" />
                  {formatDistanceToNow(incident.first_observed_at)}
                </div>
              </div>
            </div>
            <div className="pt-3 border-t border-[var(--border)]">
              <div className="flex justify-between text-xs">
                <span className="text-[var(--text-muted)]">First Observed</span>
                <span className="text-[var(--text-secondary)]">
                  {formatDistanceToNow(incident.first_observed_at)}
                </span>
              </div>
              <div className="flex justify-between text-xs mt-2">
                <span className="text-[var(--text-muted)]">Last Update</span>
                <span className="text-[var(--text-secondary)]">
                  {formatDistanceToNow(incident.last_observed_at)}
                </span>
              </div>
            </div>
          </div>
          <div className="absolute bottom-0 right-0 h-32 w-32 rounded-full bg-blue-500/5 blur-2xl transition-all group-hover:bg-blue-500/10" />
        </div>
      </div>

      {/* Quality Flags */}
      {incident.quality_flags.length > 0 && (
        <div className="surface-glass relative overflow-hidden rounded-[var(--radius-md)] border border-yellow-300/30 bg-yellow-400/7 p-6 shadow-[0_18px_34px_rgba(245,158,11,0.15)]">
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
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {flag.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="absolute bottom-0 right-0 h-32 w-32 rounded-full bg-yellow-500/5 blur-2xl" />
        </div>
      )}

      {/* Event Timeline */}
      <div className={tableShellClass}>
        <div className="border-b border-[var(--border)] bg-[var(--surface-subtle)] px-6 py-4">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Event Timeline</h2>
            <span className="ml-auto text-sm text-[var(--text-muted)]">{incident.events.length} events</span>
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
  const detailsPanelId = `event-details-${event.event_id}`

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
        pulse: true,
      },
      high: {
        gradient: 'bg-gradient-to-r from-orange-500/30 to-orange-600/30',
        text: 'text-orange-300',
        border: 'border-orange-500/50',
        shadow: 'shadow-lg shadow-orange-500/20',
        dotBg: 'bg-orange-400',
        dotPing: 'bg-orange-400',
        dot: 'bg-orange-500',
        pulse: false,
      },
      medium: {
        gradient: 'bg-gradient-to-r from-yellow-500/30 to-yellow-600/30',
        text: 'text-yellow-300',
        border: 'border-yellow-500/50',
        shadow: 'shadow-lg shadow-yellow-500/20',
        dotBg: 'bg-yellow-400',
        dotPing: 'bg-yellow-400',
        dot: 'bg-yellow-500',
        pulse: false,
      },
      warning: {
        gradient: 'bg-gradient-to-r from-yellow-500/30 to-yellow-600/30',
        text: 'text-yellow-300',
        border: 'border-yellow-500/50',
        shadow: 'shadow-lg shadow-yellow-500/20',
        dotBg: 'bg-yellow-400',
        dotPing: 'bg-yellow-400',
        dot: 'bg-yellow-500',
        pulse: false,
      },
      low: {
        gradient: 'bg-gradient-to-r from-blue-500/30 to-blue-600/30',
        text: 'text-blue-300',
        border: 'border-blue-500/50',
        shadow: 'shadow-lg shadow-blue-500/20',
        dotBg: 'bg-blue-400',
        dotPing: 'bg-blue-400',
        dot: 'bg-blue-500',
        pulse: false,
      },
      info: {
        gradient: 'bg-gradient-to-r from-blue-500/30 to-blue-600/30',
        text: 'text-blue-300',
        border: 'border-blue-500/50',
        shadow: 'shadow-lg shadow-blue-500/20',
        dotBg: 'bg-blue-400',
        dotPing: 'bg-blue-400',
        dot: 'bg-blue-500',
        pulse: false,
      },
    }[severity] || {
      gradient: 'bg-gradient-to-r from-gray-500/30 to-gray-600/30',
      text: 'text-[var(--text-secondary)]',
      border: 'border-[var(--border)]',
      shadow: 'shadow-lg shadow-gray-500/20',
      dotBg: 'bg-[var(--text-muted)]',
      dotPing: 'bg-[var(--text-muted)]',
      dot: 'bg-[var(--text-dim)]',
      pulse: false,
    }

    return config
  }

  const badge = getSeverityBadge(event.alert.severity)

  return (
    <div
      className={`surface-glass relative rounded-[var(--radius-md)] border p-5 transition-all duration-200 ${
        expanded ? 'border-cyan-300/42' : 'border-[var(--border)]'
      } ${
        isLatest ? 'bg-cyan-400/6 border-cyan-300/32' : 'bg-[var(--surface-subtle)] hover:bg-[var(--surface-soft)]'
      }`}
    >
      {isLatest && (
        <div className="absolute top-3 right-3">
          <span className="inline-flex items-center gap-1 rounded-full border border-cyan-300/35 bg-cyan-400/14 px-2 py-1 text-xs font-semibold text-cyan-200">
            <TrendingUp className="w-3 h-3" />
            Latest
          </span>
        </div>
      )}

      <div className="flex justify-between items-start mb-3">
        <div className="flex-1 pr-20">
          <div className="flex items-center gap-2 mb-2">
            <span
              className={`relative inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide ${badge.gradient} ${badge.text} border ${badge.border} ${badge.shadow}`}
            >
              <span className={`relative flex h-2 w-2 ${badge.pulse ? 'animate-pulse' : ''}`}>
                <span
                  className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${
                    badge.pulse ? badge.dotPing : badge.dotBg
                  }`}
                ></span>
                <span className={`relative inline-flex rounded-full h-2 w-2 ${badge.dot}`}></span>
              </span>
              {event.alert.severity}
            </span>
            <span
              className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium ${
                event.alert.state === 'firing'
                  ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                  : 'bg-green-500/20 text-green-400 border border-green-500/30'
              }`}
            >
              {event.alert.state}
            </span>
            <span className="text-xs text-[var(--text-muted)] bg-[var(--surface-soft)] px-2 py-1 rounded">
              {event.alert.type}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
            <Clock className="w-3.5 h-3.5" />
            <span>{new Date(event.observed_at).toLocaleString()}</span>
            <span className="text-[var(--text-dim)]">•</span>
            <code className="text-[var(--text-dim)]">ID: {event.event_id}</code>
          </div>
        </div>
      </div>

      <button type="button"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        aria-controls={detailsPanelId}
        className="neon-focus-ring interactive-soft mt-1 inline-flex items-center gap-2 rounded-md px-2 py-1 text-sm font-medium text-cyan-300 hover:text-cyan-200"
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
        <div id={detailsPanelId} className="mt-5 space-y-4 border-t border-[var(--border)] pt-5">
          {/* Decision */}
          <div>
            <h4 className="flex items-center gap-2 text-sm font-semibold text-[var(--text-secondary)] mb-3">
              <Zap className="w-4 h-4 text-green-400" />
              Decision
            </h4>
            <div className="bg-[var(--surface-subtle)] rounded-lg p-4 border border-[var(--border)]">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-[var(--text-muted)]">Action:</span>{' '}
                  <span className="text-[var(--text-primary)] font-medium">{event.decision.action}</span>
                </div>
                <div>
                  <span className="text-[var(--text-muted)]">Priority:</span>{' '}
                  <span
                    className={`font-semibold ${
                      event.decision.priority === 'P1'
                        ? 'text-red-400'
                        : event.decision.priority === 'P2'
                          ? 'text-orange-400'
                          : 'text-blue-400'
                    }`}
                  >
                    {event.decision.priority}
                  </span>
                </div>
                <div>
                  <span className="text-[var(--text-muted)]">Automated:</span>{' '}
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5',
                      event.decision.auto ? 'text-green-400' : 'text-orange-400'
                    )}
                  >
                    {event.decision.auto ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                    {event.decision.auto ? 'Yes' : 'No'}
                  </span>
                </div>
                {event.decision.risk_score !== undefined && (
                  <div>
                    <span className="text-[var(--text-muted)]">Risk Score:</span>{' '}
                    <span
                      className={`font-semibold ${
                        event.decision.risk_score >= 80
                          ? 'text-red-400'
                          : event.decision.risk_score >= 50
                            ? 'text-orange-400'
                            : 'text-yellow-400'
                      }`}
                    >
                      {event.decision.risk_score}
                    </span>
                  </div>
                )}
              </div>
              {event.decision.reason_codes.length > 0 && (
                <div className="mt-3 pt-3 border-t border-[var(--border)]">
                  <span className="text-[var(--text-muted)] text-sm">Reason Codes:</span>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {event.decision.reason_codes.map((code, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded text-xs"
                      >
                        {code}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <EventObjectSection
            title="Evidence"
            icon={Activity}
            iconClassName="text-purple-400"
            data={event.evidence}
          />

          <EventObjectSection
            title="Impact"
            icon={AlertTriangle}
            iconClassName="text-orange-400"
            data={event.impact}
          />

          <EventObjectSection
            title="Context"
            icon={Server}
            iconClassName="text-blue-400"
            data={event.context}
          />

          {/* Links */}
          {event.links && Object.keys(event.links).length > 0 && (
            <div>
              <h4 className="flex items-center gap-2 text-sm font-semibold text-[var(--text-secondary)] mb-3">
                <ExternalLink className="w-4 h-4 text-cyan-400" />
                Links
              </h4>
              <div className="bg-[var(--surface-subtle)] rounded-lg p-4 border border-[var(--border)]">
                <div className="space-y-2 text-sm">
                  {Object.entries(event.links).map(([key, value]) =>
                    value ? (
                      <div key={key} className="flex items-center gap-2">
                        <span className="text-[var(--text-muted)] min-w-[100px]">{key}:</span>
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
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
