import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Loader2,
  CheckCircle2,
  XCircle,
  FileText,
  Download,
  RotateCcw,
  Activity,
  ShieldCheck,
  ChevronRight,
  AlertTriangle,
  TimerReset,
  Wrench,
} from 'lucide-react'
import { type DrillRun, runDrill, abortDrillRun, getDrillRun, recoverDrillRun } from '@/lib/api/drills'
import { glassPanelClass, cn, primaryButtonClass, secondaryButtonClass } from '@/components/common/uiClassTokens'

const STEPS = [
  { id: 'Validate', label: 'Validate' },
  { id: 'Warmup', label: 'Snapshot' },
  { id: 'Action', label: 'Execute' },
  { id: 'Observation', label: 'Observe' },
  { id: 'Recovery', label: 'Recover' },
  { id: 'Finalize', label: 'Finalize' },
]

function getStatusBadgeClass(status: string): string {
  switch (status) {
    case 'Planned':
      return 'border-slate-400/30 bg-slate-500/10 text-[var(--text-primary)]'
    case 'Running':
      return 'border-sky-400/30 bg-sky-500/10 text-[var(--text-primary)]'
    case 'Observing':
      return 'border-amber-400/30 bg-amber-500/10 text-[var(--text-primary)]'
    case 'AwaitingRecovery':
      return 'border-rose-400/30 bg-rose-500/10 text-[var(--text-primary)]'
    case 'Recovering':
      return 'border-violet-400/30 bg-violet-500/10 text-[var(--text-primary)]'
    case 'Completed':
      return 'border-emerald-400/30 bg-emerald-500/10 text-[var(--text-primary)]'
    case 'Accepted':
      return 'border-teal-400/30 bg-teal-500/10 text-[var(--text-primary)]'
    case 'Aborted':
      return 'border-orange-400/30 bg-orange-500/10 text-[var(--text-primary)]'
    case 'Failed':
      return 'border-rose-500/40 bg-rose-500/15 text-[var(--text-primary)]'
    default:
      return 'border-[var(--border)] bg-[var(--surface-soft)] text-[var(--text-secondary)]'
  }
}

function formatCountdown(msRemaining: number): string {
  const safeMs = Math.max(0, msRemaining)
  const totalSeconds = Math.ceil(safeMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function getTargetSnapshotMetrics(snapshot: any, target: string) {
  if (!snapshot || !Array.isArray(snapshot.services)) return null
  const [namespaceMaybe, serviceMaybe] = String(target).split('/')
  const hasNamespace = Boolean(serviceMaybe)
  const serviceName = hasNamespace ? serviceMaybe : namespaceMaybe
  const namespace = hasNamespace ? namespaceMaybe : undefined

  const service = snapshot.services.find(
    (item: any) => item?.name === serviceName && (!namespace || item?.namespace === namespace)
  )
  if (!service) return null

  const availabilityRaw = service.availability
  const availabilityValue =
    typeof availabilityRaw === 'number'
      ? availabilityRaw
      : typeof availabilityRaw?.value === 'number'
        ? availabilityRaw.value
        : typeof availabilityRaw?.high === 'number'
          ? availabilityRaw.high
          : typeof availabilityRaw?.low === 'number'
            ? availabilityRaw.low
            : undefined

  return {
    availability:
      typeof availabilityValue === 'number' && Number.isFinite(availabilityValue)
        ? `${(availabilityValue * 100).toFixed(1)}%`
        : '--',
    rps: typeof service.rps === 'number' && Number.isFinite(service.rps) ? `${service.rps.toFixed(0)} req/s` : '--',
    errorRate:
      typeof service.errorRate === 'number' && Number.isFinite(service.errorRate)
        ? `${(service.errorRate * 100).toFixed(1)}%`
        : '--',
    p95: typeof service.p95 === 'number' && Number.isFinite(service.p95) ? `${service.p95.toFixed(0)}ms` : '--',
  }
}

function openEvidencePdfReport(run: DrillRun) {
  const popup = window.open('', '_blank', 'width=1100,height=900')
  if (!popup) {
    toast.error('Pop-up blocked. Allow pop-ups to export the PDF report.')
    return
  }

  const preMetrics = getTargetSnapshotMetrics(run.preSnapshot, run.target)
  const postMetrics = getTargetSnapshotMetrics(run.postSnapshot, run.target)
  const durationSeconds = (() => {
    const start = new Date(run.startTime).getTime()
    const end = run.endTime ? new Date(run.endTime).getTime() : Date.now()
    if (!Number.isFinite(start) || !Number.isFinite(end)) return '--'
    return `${Math.max(0, Math.round((end - start) / 1000))}s`
  })()

  const timeline = run.timeline || []
  const timelineRows = timeline
    .map(
      (step) => `
      <tr>
        <td>${escapeHtml(step.phase)}</td>
        <td>${escapeHtml(new Date(step.timestamp).toLocaleString())}</td>
        <td>${escapeHtml(step.status)}</td>
        <td>${escapeHtml(step.message)}</td>
      </tr>`
    )
    .join('')

  const errorStepCount = timeline.filter((step) => String(step.status).toLowerCase() === 'error').length
  const warningStepCount = timeline.filter((step) => String(step.status).toLowerCase() === 'warn').length

  const phaseDurationRows = timeline
    .map((step, index) => {
      const currentTs = new Date(step.timestamp).getTime()
      const nextTs = timeline[index + 1] ? new Date(timeline[index + 1].timestamp).getTime() : NaN
      const durationLabel =
        Number.isFinite(currentTs) && Number.isFinite(nextTs)
          ? `${Math.max(0, Math.round((nextTs - currentTs) / 1000))}s`
          : 'Terminal/Current'
      return `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(step.phase)}</td>
        <td>${escapeHtml(new Date(step.timestamp).toLocaleTimeString())}</td>
        <td>${escapeHtml(durationLabel)}</td>
        <td>${escapeHtml(step.status)}</td>
      </tr>`
    })
    .join('')

  const metricRows = [
    ['Availability', preMetrics?.availability ?? '--', postMetrics?.availability ?? '--'],
    ['Traffic (RPS)', preMetrics?.rps ?? '--', postMetrics?.rps ?? '--'],
    ['Error Rate', preMetrics?.errorRate ?? '--', postMetrics?.errorRate ?? '--'],
    ['P95 Latency', preMetrics?.p95 ?? '--', postMetrics?.p95 ?? '--'],
  ]
    .map(
      ([label, baseline, current]) => `
      <tr>
        <td>${escapeHtml(label)}</td>
        <td>${escapeHtml(baseline)}</td>
        <td>${escapeHtml(current)}</td>
      </tr>`
    )
    .join('')

  const statusPillClass = /fail|error/i.test(run.status)
    ? 'status-fail'
    : /abort/i.test(run.status)
      ? 'status-abort'
      : /awaiting|observ/i.test(run.status)
        ? 'status-watch'
        : /recover/i.test(run.status)
          ? 'status-recover'
          : 'status-ok'

  const verdictPillClass = /fail|error/i.test(run.verdict)
    ? 'verdict-fail'
    : /abort/i.test(run.verdict)
      ? 'verdict-abort'
      : /success/i.test(run.verdict)
        ? 'verdict-success'
        : 'verdict-neutral'

  const executiveFindings = [
    `Drill type: ${run.type} executed against ${run.target}.`,
    `Run completed with status ${run.status} and verdict ${run.verdict}.`,
    `Recovery path: ${run.recoverySource ?? 'not recorded'}${run.recoverySource === 'manual' ? ' (operator-triggered)' : ''}.`,
    `Timeline recorded ${timeline.length} events with ${warningStepCount} warnings and ${errorStepCount} errors.`,
    `Observation window configured for ${Number(run.config?.observeTokens ?? 15)} seconds.`,
  ]
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join('')

  const recommendations = [
    'Confirm alerts fired during Observation and were cleared after Recovery.',
    'Check dependent services for retry storms, queue buildup, and saturation.',
    'Compare final latency/error metrics with baseline to validate full recovery.',
    'If manual recovery was delayed, review operator runbook timing and approvals.',
  ]
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join('')

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Drill Evidence Pack - ${escapeHtml(run.id)}</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 24px; color: #0f172a; }
    h1,h2,h3 { margin: 0; }
    .header { margin-bottom: 20px; padding: 20px; border: 1px solid #cbd5e1; border-radius: 12px; background: #f8fafc; }
    .meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-top: 12px; }
    .meta-item { border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 12px; background: white; }
    .label { display: block; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: #475569; margin-bottom: 4px; }
    .value { font-size: 14px; font-weight: 700; color: #0f172a; }
    .section { margin-top: 18px; padding: 16px; border: 1px solid #e2e8f0; border-radius: 12px; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th, td { border: 1px solid #e2e8f0; padding: 8px 10px; text-align: left; vertical-align: top; font-size: 12px; }
    th { background: #f1f5f9; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: #334155; }
    .pill { display: inline-block; border-radius: 999px; padding: 4px 10px; font-size: 11px; font-weight: 700; }
    .pill.status-ok { background: #dcfce7; color: #166534; }
    .pill.status-watch { background: #fef3c7; color: #92400e; }
    .pill.status-recover { background: #ede9fe; color: #5b21b6; }
    .pill.status-abort { background: #ffedd5; color: #c2410c; }
    .pill.status-fail { background: #fee2e2; color: #b91c1c; }
    .pill.verdict-success { background: #dcfce7; color: #166534; }
    .pill.verdict-abort { background: #ffedd5; color: #c2410c; }
    .pill.verdict-fail { background: #fee2e2; color: #b91c1c; }
    .pill.verdict-neutral { background: #e2e8f0; color: #334155; }
    .muted { color: #64748b; font-size: 12px; }
    .two-col { display:grid; grid-template-columns: 1.1fr 1fr; gap:16px; }
    .list { margin: 10px 0 0; padding-left: 18px; }
    .list li { margin: 6px 0; font-size: 12px; line-height: 1.45; }
    .kpi-grid { display:grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-top: 10px; }
    .kpi { border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px; background:#fff; }
    .kpi .k { font-size: 10px; text-transform: uppercase; letter-spacing: .07em; color:#64748b; font-weight: 700; }
    .kpi .v { margin-top:4px; font-size: 13px; color:#0f172a; font-weight: 700; }
    @media (max-width: 900px) { .two-col { grid-template-columns: 1fr; } .kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media print { body { margin: 12mm; } .no-print { display: none; } }
  </style>
</head>
<body>
  <div class="header">
    <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:16px;">
      <div>
        <div class="muted">Drill Director Evidence Pack</div>
        <h1 style="margin-top:4px; font-size: 28px;">${escapeHtml(run.type)}</h1>
        <div class="muted" style="margin-top:6px;">Run #${escapeHtml(run.id.split('-')[0].toUpperCase())} • Target ${escapeHtml(run.target)}</div>
      </div>
      <div style="display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end;">
        <span class="pill ${statusPillClass}">${escapeHtml(run.status)}</span>
        <span class="pill ${verdictPillClass}">${escapeHtml(run.verdict)}</span>
      </div>
    </div>
    <div class="meta">
      <div class="meta-item"><span class="label">Start Time</span><span class="value">${escapeHtml(new Date(run.startTime).toLocaleString())}</span></div>
      <div class="meta-item"><span class="label">End Time</span><span class="value">${escapeHtml(run.endTime ? new Date(run.endTime).toLocaleString() : '--')}</span></div>
      <div class="meta-item"><span class="label">Duration</span><span class="value">${escapeHtml(durationSeconds)}</span></div>
      <div class="meta-item"><span class="label">Recovery Source</span><span class="value">${escapeHtml(run.recoverySource ?? 'n/a')}</span></div>
    </div>
  </div>

  <div class="section">
    <h2 style="font-size: 16px;">Executive Summary</h2>
    <div class="two-col">
      <div>
        <p class="muted">High-level findings for operators and reviewers.</p>
        <ul class="list">${executiveFindings}</ul>
      </div>
      <div>
        <div class="kpi-grid">
          <div class="kpi"><div class="k">Timeline Events</div><div class="v">${escapeHtml(String(timeline.length))}</div></div>
          <div class="kpi"><div class="k">Warnings</div><div class="v">${escapeHtml(String(warningStepCount))}</div></div>
          <div class="kpi"><div class="k">Errors</div><div class="v">${escapeHtml(String(errorStepCount))}</div></div>
          <div class="kpi"><div class="k">Recovery Source</div><div class="v">${escapeHtml(run.recoverySource ?? 'n/a')}</div></div>
        </div>
      </div>
    </div>
  </div>

  <div class="section">
    <h2 style="font-size: 16px;">Impact Summary</h2>
    <p class="muted">Baseline vs final snapshot for the target component.</p>
    <table>
      <thead><tr><th>Metric</th><th>Baseline</th><th>Final</th></tr></thead>
      <tbody>${metricRows}</tbody>
    </table>
  </div>

  <div class="section">
    <h2 style="font-size: 16px;">Phase Timing Breakdown</h2>
    <p class="muted">Elapsed time to the next phase (or terminal marker for the final step).</p>
    <table>
      <thead><tr><th>#</th><th>Phase</th><th>Start</th><th>Duration</th><th>Status</th></tr></thead>
      <tbody>${phaseDurationRows || '<tr><td colspan="5">No phase data recorded.</td></tr>'}</tbody>
    </table>
  </div>

  <div class="section">
    <h2 style="font-size: 16px;">Detailed Timeline</h2>
    <table>
      <thead><tr><th>Phase</th><th>Timestamp</th><th>Status</th><th>Message</th></tr></thead>
      <tbody>${timelineRows || '<tr><td colspan="4">No timeline events recorded.</td></tr>'}</tbody>
    </table>
  </div>

  <div class="section">
    <h2 style="font-size: 16px;">Recommended Follow-ups</h2>
    <ul class="list">${recommendations}</ul>
  </div>

  <script>
    window.addEventListener('load', () => {
      setTimeout(() => window.print(), 120)
    })
  </script>
</body>
</html>`

  popup.document.open()
  popup.document.write(html)
  popup.document.close()
}

export default function RunPanel({
  run,
  onUpdate,
  onClear,
}: {
  run: DrillRun
  onUpdate: (run: DrillRun) => void
  onClear: () => void
}) {
  const [isRecoverSubmitting, setIsRecoverSubmitting] = useState(false)
  const [countdownNow, setCountdownNow] = useState(Date.now())

  const isTerminal = ['Completed', 'Aborted', 'Failed', 'Accepted'].includes(run.status)
  const isAwaitingRecovery = run.status === 'AwaitingRecovery'
  const isActiveLifecycle = ['Running', 'Observing', 'AwaitingRecovery', 'Recovering'].includes(run.status)
  const isBusyVisual = ['Running', 'Observing', 'Recovering'].includes(run.status)
  const currentPhase = run.timeline?.[run.timeline.length - 1]?.phase || 'Pending'
  const observeSeconds = Number(run.config?.observeTokens ?? 15)

  useEffect(() => {
    if (!isActiveLifecycle) {
      return
    }

    let interval = 0
    const pollRun = async () => {
      try {
        const updated = await getDrillRun(run.id)
        onUpdate(updated)
      } catch (e) {
        console.error('Failed to poll run', e)
      }
    }

    interval = window.setInterval(() => {
      void pollRun()
    }, 2000)

    return () => {
      clearInterval(interval)
    }
  }, [isActiveLifecycle, onUpdate, run.id])

  useEffect(() => {
    if (!isAwaitingRecovery || !run.recoveryDeadline) {
      return
    }

    setCountdownNow(Date.now())
    const interval = window.setInterval(() => {
      setCountdownNow(Date.now())
    }, 1000)

    return () => {
      clearInterval(interval)
    }
  }, [isAwaitingRecovery, run.recoveryDeadline])

  const handleStart = async () => {
    try {
      await runDrill(run.id)
      onUpdate({ ...run, status: 'Running' })
    } catch (e: any) {
      console.error(e)
      const status = e?.response?.status
      const body = e?.response?.data || ''
      if (status === 412 || (typeof body === 'string' && body.includes('preflight failed'))) {
        toast.error('Cluster unreachable — open an SSH tunnel to your Kubernetes API server first, then retry.', { duration: 6000 })
      } else {
        toast.error('Failed to start drill')
      }
    }
  }

  const handleAbort = async () => {
    try {
      await abortDrillRun(run.id)
      if (run.status === 'AwaitingRecovery') {
        onUpdate({ ...run, status: 'Recovering', canRecover: false, recoverySource: 'abort' })
      }
    } catch (e) {
      console.error(e)
      toast.error('Failed to trigger emergency rollback')
    }
  }

  const handleRecover = async () => {
    setIsRecoverSubmitting(true)
    try {
      await recoverDrillRun(run.id)
      onUpdate({ ...run, status: 'Recovering', canRecover: false, recoverySource: 'manual' })
    } catch (e) {
      console.error(e)
      toast.error(e instanceof Error ? e.message : 'Failed to start recovery')
    } finally {
      setIsRecoverSubmitting(false)
    }
  }

  const handleLocalReset = () => {
    onUpdate({
      ...run,
      status: 'Planned',
      verdict: 'Pending',
      timeline: [],
      endTime: undefined,
      postSnapshot: undefined,
      canRecover: false,
      recoveryDeadline: undefined,
      recoverySource: undefined,
    })
  }

  const recoveryDeadlineMs = run.recoveryDeadline ? new Date(run.recoveryDeadline).getTime() : NaN
  const hasRecoveryDeadline = Number.isFinite(recoveryDeadlineMs)
  const remainingRecoveryMs = hasRecoveryDeadline ? recoveryDeadlineMs - countdownNow : 0

  return (
    <Card
      data-testid="drill-run-panel"
      data-run-id={run.id}
      className={cn(glassPanelClass, 'relative flex h-full min-h-[720px] flex-col overflow-hidden')}
    >
      {isActiveLifecycle && (
        <div
          className={cn(
            'absolute left-0 top-0 z-20 h-1 w-full animate-pulse',
            isAwaitingRecovery ? 'bg-rose-500' : 'bg-emerald-500'
          )}
        />
      )}

      <CardHeader className="border-b border-[var(--border)] bg-[var(--surface-soft)]/30 px-6 pb-6 pt-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="mb-1 flex items-center gap-2">
              <Activity className="h-3.5 w-3.5 text-emerald-500" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                Active Sequence
              </span>
            </div>
            <CardTitle className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
              {run.type}
            </CardTitle>
          </div>
          <Badge
            variant="outline"
            data-testid="drill-run-status"
            className={cn('px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider', getStatusBadgeClass(run.status))}
          >
            {run.status}
          </Badge>
        </div>
        <div className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface-solid)] p-3">
          <div className="flex min-w-0 flex-col">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              Target
            </span>
            <code className="truncate font-mono text-xs font-bold text-emerald-600">{run.target}</code>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              Run ID
            </span>
            <span className="font-mono text-xs font-bold text-[var(--text-secondary)]">
              #{run.id.split('-')[0].toUpperCase()}
            </span>
          </div>
        </div>
        {typeof run.bannerVerified === 'boolean' && (
          <div
            data-testid="drill-banner-verification"
            className="mt-3 flex items-center justify-between rounded-lg border border-[var(--border)]/80 bg-[var(--surface-soft)] px-3 py-2"
          >
            <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              Scenario Banner
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
              {run.bannerVerified ? 'Verified' : 'Not Verified'}
            </span>
          </div>
        )}
      </CardHeader>

      <CardContent className="flex-1 space-y-6 overflow-y-auto px-6 py-7">
        <div className="mt-2 rounded-2xl border border-[var(--border)]/70 bg-[var(--surface-soft)]/15 p-4 pt-6">
          <div className="relative px-2">
            <div className="absolute left-6 right-6 top-4 h-0.5 bg-[var(--border)]" />
            <div className="relative z-10 flex justify-between gap-2">
              {STEPS.map((step, idx) => {
                const isPast = run.timeline?.some((s) => s.phase === step.id)
                const isCurrent = currentPhase === step.id
                return (
                  <div key={step.id} className="flex min-w-0 flex-1 flex-col items-center gap-2 text-center">
                    <div
                      className={cn(
                        'flex h-8 w-8 items-center justify-center rounded-full border-2 bg-[var(--surface-solid)] transition-all duration-300',
                        isPast ? 'border-emerald-500 text-emerald-400' : 'border-[var(--border)] text-[var(--text-muted)]',
                        isCurrent && 'scale-110 border-sky-500 text-sky-400 shadow-sm'
                      )}
                    >
                      {isPast && !isCurrent ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : (
                        <span className="text-xs font-bold">{idx + 1}</span>
                      )}
                    </div>
                    <span
                      className={cn(
                        'text-[9px] font-bold uppercase tracking-wider leading-tight',
                        isCurrent
                          ? 'text-sky-600'
                          : isPast
                            ? 'text-emerald-600'
                            : 'text-[var(--text-muted)]'
                      )}
                    >
                      {step.label}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {run.status === 'Planned' && (
          <div className="animate-in fade-in rounded-xl border border-sky-500/10 bg-sky-500/5 p-5 text-sm text-[var(--text-secondary)] duration-500">
            <h4 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-sky-700">
              <ShieldCheck className="h-4 w-4" /> Readiness Checklist
            </h4>
            <ul className="space-y-2.5 text-[var(--text-secondary)]">
              <li className="flex items-center gap-2 text-xs font-medium">
                <ChevronRight className="h-3 w-3 text-sky-400" /> Action:{' '}
                {run.type === 'ServiceShutdown' ? 'Service Termination' : 'Resource Modification'}
              </li>
              <li className="flex items-center gap-2 text-xs font-medium">
                <ChevronRight className="h-3 w-3 text-sky-400" /> Recovery: Operator controlled (5m failsafe)
              </li>
              <li className="flex items-center gap-2 text-xs font-medium">
                <ChevronRight className="h-3 w-3 text-sky-400" /> Observation: {observeSeconds}s window
              </li>
            </ul>
          </div>
        )}

        {isBusyVisual && (
          <div className="animate-in zoom-in rounded-2xl border border-[var(--border)] border-dashed bg-[var(--surface-soft)]/20 p-8 duration-500">
            <div className="flex flex-col items-center justify-center space-y-4 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
              <div>
                <span className="block text-sm font-bold uppercase tracking-wider text-[var(--text-primary)]">
                  {run.status === 'Recovering' ? 'Rollback In Progress' : 'Sequence Engaged'}
                </span>
                <span className="text-[10px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
                  {run.status === 'Recovering'
                    ? 'Restoring target state and capturing final snapshot...'
                    : 'Applying state changes and collecting telemetry...'}
                </span>
              </div>
            </div>
          </div>
        )}

        {isAwaitingRecovery && (
          <div className="animate-in fade-in space-y-4 rounded-2xl border border-rose-500/20 bg-rose-500/8 p-5 duration-500">
            <div className="flex items-start gap-3">
              <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-2">
                <AlertTriangle className="h-5 w-5 text-rose-400" />
              </div>
              <div className="space-y-1">
                <h4 className="text-xs font-bold uppercase tracking-wider text-rose-700">
                  Recovery Decision Required
                </h4>
                <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
                  The drill observation window has ended. The target may remain impacted until you
                  recover it or the failsafe timer expires.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-rose-500/15 bg-[var(--surface-solid)]/60 p-3">
                <span className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  Recovery Mode
                </span>
                <span className="text-sm font-bold text-[var(--text-primary)]">Manual + 5m Failsafe</span>
              </div>
              <div className="rounded-xl border border-rose-500/15 bg-[var(--surface-solid)]/60 p-3">
                <span className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  Failsafe Countdown
                </span>
                <span className="inline-flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
                  <TimerReset className="h-4 w-4 text-rose-600" />
                  {hasRecoveryDeadline ? formatCountdown(remainingRecoveryMs) : '--:--'}
                </span>
              </div>
            </div>

            <Button
              data-testid="drill-recover-service"
              onPress={handleRecover}
              isDisabled={isRecoverSubmitting}
              className="h-11 w-full rounded-lg border border-emerald-300/20 bg-gradient-to-r from-emerald-500 to-green-500 text-xs font-bold uppercase tracking-widest text-white"
            >
              {isRecoverSubmitting ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Starting Recovery
                </span>
              ) : (
                <span className="inline-flex items-center gap-2">
                  <Wrench className="h-4 w-4" /> Recover Service
                </span>
              )}
            </Button>
          </div>
        )}

        {isTerminal && (
          <div className="animate-in fade-in space-y-6 duration-500">
            <div
              className={cn(
                'flex items-start gap-4 rounded-xl border p-5 text-sm shadow-sm',
                run.verdict === 'Success'
                  ? 'border-emerald-500/10 bg-emerald-500/5 text-[var(--text-secondary)]'
                  : 'border-rose-500/10 bg-rose-500/5 text-[var(--text-secondary)]'
              )}
            >
              <div
                className={cn(
                  'rounded-lg p-2',
                  run.verdict === 'Success' ? 'bg-emerald-500/10' : 'bg-rose-500/10'
                )}
              >
                {run.verdict === 'Success' ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                ) : (
                  <XCircle className="h-5 w-5 text-rose-400" />
                )}
              </div>
              <div>
                <h4 className="mb-1 text-base font-bold uppercase tracking-tight">
                  Sequence {run.verdict}
                </h4>
                <p className="text-xs font-medium leading-relaxed opacity-90">
                  The drill sequence has concluded. Recovery source:{' '}
                  <strong className="uppercase">{run.recoverySource ?? 'n/a'}</strong>. Final state
                  verification and evidence snapshots are available below.
                </p>
              </div>
            </div>

            <div className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)]/50 p-5">
              <h4 className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                <FileText className="h-3.5 w-3.5" /> Evidence Pack
              </h4>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-solid)] p-3">
                  <span className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                    Observation Window
                  </span>
                  <span className="text-sm font-bold text-[var(--text-primary)]">{observeSeconds}s</span>
                </div>
                <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-solid)] p-3">
                  <span className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                    Export Status
                  </span>
                  <span className="text-sm font-bold uppercase text-emerald-400">Ready</span>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-10 w-full rounded-lg bg-[var(--surface-solid)] text-[10px] font-bold uppercase tracking-wider"
                onPress={() => openEvidencePdfReport(run)}
              >
                <Download className="mr-2 h-3.5 w-3.5" /> Export PDF Report
              </Button>
            </div>
          </div>
        )}
      </CardContent>

      <CardFooter className="mt-auto flex flex-col gap-3 border-t border-[var(--border)] bg-[var(--surface-soft)]/20 p-6 pt-5">
        {run.status === 'Planned' && (
          <Button onPress={handleStart} className={cn(primaryButtonClass, 'h-12 w-full text-xs uppercase tracking-widest')}>
            Initiate Sequence
          </Button>
        )}

        {(run.status === 'Running' || run.status === 'Observing') && (
          <Button
            onPress={handleAbort}
            className="h-12 w-full rounded-lg border border-rose-200 bg-rose-500 text-xs font-bold uppercase tracking-widest text-white hover:bg-rose-600"
          >
            Abort Observation & Recover
          </Button>
        )}

        {isAwaitingRecovery && (
          <Button
            onPress={handleAbort}
            variant="outline"
            className="h-11 w-full rounded-lg border border-rose-500/20 bg-rose-500/5 text-xs font-bold uppercase tracking-widest text-rose-700 hover:bg-rose-500/10"
          >
            Emergency Recover (Abort)
          </Button>
        )}

        {isTerminal && (
          <div className="grid w-full grid-cols-1 gap-3 pt-1 sm:grid-cols-2">
            <Button
              variant="outline"
              data-testid="drill-exit-room"
              className={secondaryButtonClass}
              onPress={onClear}
            >
              Exit Room
            </Button>
            <Button
              variant="secondary"
              className={cn(secondaryButtonClass, 'flex gap-2')}
              onPress={handleLocalReset}
            >
              <RotateCcw className="h-4 w-4" /> Reset
            </Button>
          </div>
        )}
      </CardFooter>
    </Card>
  )
}
