import { useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle,
  Info,
  Zap,
  ShieldAlert,
  BarChart3,
} from 'lucide-react'
import type { DrillRun } from '@/lib/api/drills'
import { Switch } from '@/components/ui/Switch'
import { cn, glassSurfaceClass } from '@/components/common/uiClassTokens'

type ServiceMetricSnapshot = {
  availability?: number
  rps?: number
  errorRate?: number
  p95?: number
}

function getAvailabilityValue(raw: any): number | undefined {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw
  }
  if (typeof raw?.value === 'number' && Number.isFinite(raw.value)) {
    return raw.value
  }
  if (typeof raw?.high === 'number' && Number.isFinite(raw.high)) {
    return raw.high
  }
  if (typeof raw?.low === 'number' && Number.isFinite(raw.low)) {
    return raw.low
  }
  return undefined
}

function getNumberValue(raw: any): number | undefined {
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : undefined
}

function getMetricsForService(snapshot: any, serviceTag: string): ServiceMetricSnapshot | null {
  if (!snapshot || !Array.isArray(snapshot.services)) return null

  const [namespaceMaybe, nameMaybe] = String(serviceTag).split('/')
  const namespace = nameMaybe ? namespaceMaybe : undefined
  const name = nameMaybe ?? namespaceMaybe

  const service = snapshot.services.find(
    (s: any) => s?.name === name && (!namespace || s?.namespace === namespace)
  )
  if (!service) return null

  return {
    availability: getAvailabilityValue(service.availability),
    rps: getNumberValue(service.rps),
    errorRate: getNumberValue(service.errorRate),
    p95: getNumberValue(service.p95),
  }
}

function formatPercent(value?: number): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : '--'
}

function formatReq(value?: number): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(0)} req/s` : '--'
}

function formatMs(value?: number): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(0)}ms` : '--'
}

export default function LiveMetricsStrip({ run }: { run: DrillRun }) {
  const [isExplainMode, setIsExplainMode] = useState(true)

  const isObservingImpact = ['Observing', 'AwaitingRecovery', 'Recovering'].includes(run.status)
  const isCompleted = ['Completed', 'Aborted'].includes(run.status)

  const baseline = getMetricsForService(run.preSnapshot, run.target)
  const recovered = getMetricsForService(run.postSnapshot, run.target)

  const metrics = [
    {
      label: 'Availability',
      icon: <ShieldAlert className="h-3.5 w-3.5" />,
      baseline: formatPercent(baseline?.availability),
      current: isObservingImpact ? '0.0%' : formatPercent(isCompleted ? recovered?.availability : baseline?.availability),
      degraded: isObservingImpact || (typeof recovered?.availability === 'number' && recovered.availability < 0.95),
      explanation:
        'Measures the percentage of successful health checks. Drops toward zero during total service failure.',
      trendInfinite: false,
    },
    {
      label: 'Traffic (RPS)',
      icon: <Activity className="h-3.5 w-3.5" />,
      baseline: formatReq(baseline?.rps),
      current: isObservingImpact ? '0 req/s' : formatReq(isCompleted ? recovered?.rps : baseline?.rps),
      degraded: isObservingImpact,
      explanation:
        'Requests per second. Confirms whether the component is still receiving or processing incoming demand.',
      trendInfinite: false,
    },
    {
      label: 'Error Rate',
      icon: <Zap className="h-3.5 w-3.5" />,
      baseline: formatPercent(baseline?.errorRate),
      current: isObservingImpact ? '100.0%' : formatPercent(isCompleted ? recovered?.errorRate : baseline?.errorRate),
      degraded: isObservingImpact || (typeof recovered?.errorRate === 'number' && recovered.errorRate > 0.05),
      explanation:
        'Percentage of failed requests. 100% indicates upstream dependencies are fully rejecting traffic.',
      trendInfinite: false,
    },
    {
      label: 'P95 Latency',
      icon: <BarChart3 className="h-3.5 w-3.5" />,
      baseline: formatMs(baseline?.p95),
      current: isObservingImpact ? '∞' : formatMs(isCompleted ? recovered?.p95 : baseline?.p95),
      degraded: isObservingImpact,
      explanation:
        'Tail response time. Infinity suggests connection attempts are timing out or being actively refused.',
      trendInfinite: true,
    },
  ]

  return (
    <Card
      className={cn(
        glassSurfaceClass,
        'relative overflow-hidden rounded-[var(--radius-lg)] bg-[var(--surface-contrast)]/30 backdrop-blur-xl'
      )}
    >
      {isObservingImpact && <div className="absolute left-0 top-0 z-20 h-1 w-full animate-pulse bg-rose-500" />}

      <CardHeader className="flex flex-row items-center justify-between gap-4 border-b border-[var(--border)] bg-[var(--surface-soft)]/20 px-6 py-6 pb-6">
        <div className="flex items-center gap-3">
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-2 shadow-sm">
            <Activity className="h-5 w-5 text-emerald-500" />
          </div>
          <div>
            <CardTitle className="text-lg font-bold tracking-tight text-[var(--text-primary)]">
              Impact Analysis
            </CardTitle>
            <p className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
              Real-time Telemetry Delta
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-solid)] px-3 py-1.5 shadow-inner">
          <Switch
            id="explain-mode"
            checked={isExplainMode}
            onChange={() => setIsExplainMode(!isExplainMode)}
            label={
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                Explain Mode
              </span>
            }
          />
        </div>
      </CardHeader>

      <CardContent className="p-6">
        <div className="grid auto-rows-fr grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {metrics.map((metric) => (
            <article key={metric.label} className="flex h-full min-h-[248px] flex-col gap-3">
              <div
                className={cn(
                  'flex flex-1 flex-col gap-4 rounded-xl border p-5 transition-all duration-300',
                  metric.degraded
                    ? 'border-rose-500/20 bg-rose-500/5 shadow-sm'
                    : 'border-[var(--border)] bg-[var(--surface-soft)]/50 hover:border-emerald-500/20'
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-wider',
                      metric.degraded
                        ? 'border-rose-400/20 bg-rose-500/8 text-[var(--text-secondary)]'
                        : 'border-emerald-400/15 bg-emerald-500/5 text-[var(--text-secondary)]'
                    )}
                  >
                    {metric.icon}
                    {metric.label}
                  </span>
                </div>

                <div className="flex flex-1 flex-col gap-2.5">
                  <div className="flex items-center justify-between gap-4 rounded-lg border border-[var(--border)]/70 bg-[var(--surface-solid)]/40 p-3">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                      Baseline
                    </span>
                    <span className="truncate font-mono text-sm font-bold tabular-nums text-[var(--text-secondary)]">
                      {metric.baseline}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-4 rounded-lg border border-[var(--border)]/70 bg-[var(--surface-solid)]/40 p-3">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                      Current
                    </span>
                    <span
                      className={cn(
                        'inline-flex max-w-[70%] items-center justify-end gap-1 truncate font-mono text-xl font-bold tabular-nums tracking-tight',
                        metric.degraded ? 'text-rose-600' : 'text-emerald-600'
                      )}
                    >
                      <span className="truncate">{metric.current}</span>
                      {metric.degraded ? (
                        <ArrowDownRight className="h-4 w-4 shrink-0" />
                      ) : metric.current === '--' || (metric.trendInfinite && metric.current === '∞') ? null : isCompleted ? (
                        <CheckCircle className="h-4 w-4 shrink-0 opacity-70" />
                      ) : (
                        <ArrowUpRight className="h-4 w-4 shrink-0 opacity-40" />
                      )}
                    </span>
                  </div>
                </div>
              </div>

              {isExplainMode && (
                <div className="flex min-h-[68px] items-start gap-2 px-2 text-[10px] font-medium italic leading-relaxed text-[var(--text-muted)] animate-in fade-in duration-300">
                  <Info className="mt-0.5 h-3 w-3 shrink-0 text-sky-400" />
                  <span className="break-words">{metric.explanation}</span>
                </div>
              )}
            </article>
          ))}
        </div>

        {isObservingImpact && (
          <div className="mt-6 flex gap-4 rounded-xl border border-rose-500/10 bg-rose-500/5 p-5 text-xs text-[var(--text-secondary)] shadow-sm animate-in fade-in duration-700">
            <div className="h-fit shrink-0 rounded-lg border border-rose-500/20 bg-rose-500/10 p-2">
              <Activity className="h-5 w-5 animate-pulse text-rose-400" />
            </div>
            <div>
              <p className="mb-1 text-xs font-bold uppercase tracking-wider text-rose-600">
                Active Fault Window
              </p>
              <p className="leading-relaxed opacity-90">
                Drill impact is still active on <strong>{run.target}</strong>. Recover the service when
                you are ready, or the failsafe timer will initiate rollback automatically.
              </p>
            </div>
          </div>
        )}

        {isCompleted && run.verdict === 'Success' && (
          <div className="mt-6 flex gap-4 rounded-xl border border-emerald-500/10 bg-emerald-500/5 p-5 text-xs text-[var(--text-secondary)] shadow-sm animate-in fade-in duration-700">
            <div className="h-fit shrink-0 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-2">
              <CheckCircle className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <p className="mb-1 text-xs font-bold uppercase tracking-wider text-emerald-600">
                System Equilibrium Restored
              </p>
              <p className="leading-relaxed opacity-90">
                Recovery completed for <strong>{run.target}</strong>. Final metrics are shown against the
                captured baseline snapshot.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
