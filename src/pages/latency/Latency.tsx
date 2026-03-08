import { useState, useEffect, useRef, useCallback } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { Gauge, Activity, TrendingUp, TrendingDown, Clock, ArrowDown, ArrowUp } from 'lucide-react'
import { useGraphStream } from '@/lib/useGraphStream'
import { formatMs, formatPercent } from '@/lib/format'
import {
  pageContainerClass,
  glassSurfaceClass,
  tableShellClass,
  tableHeadRowClass,
  tableBodyRowClass,
  tableHeaderCellClass,
  tableCellClass,
  cn,
} from '@/components/common/uiClassTokens'
import PageHeader from '@/components/layout/PageHeader'
import Section from '@/components/layout/Section'
import KPIStatCard from '@/components/layout/KPIStatCard'
import MetricHighlightCard from '@/components/layout/MetricHighlightCard'
import LoadingSpinner from '@/components/common/LoadingSpinner'
import type { GraphUpdateData } from '@/lib/bffApiClient'

const WINDOW_DURATION_S = 30

interface Snapshot {
  timestamp: number
  p95: number
  p50: number
  errorRate: number
  rps: number
  serviceCount: number
}

interface CompletedWindow {
  windowNumber: number
  completedAt: string
  meanP95: number
  meanP50: number
  peakP95: number
  avgErrorRate: number
  totalRps: number
  serviceCount: number
  snapshotCount: number
}

function aggregateSnapshot(data: GraphUpdateData): Snapshot {
  const services = data.metricsSnapshot.services
  const edges = data.metricsSnapshot.edges

  const serviceP95s = services.map((s) => s.p95).filter((v) => v > 0)
  const edgeP95s = edges.map((e) => e.p95).filter((v) => v > 0)
  const allP95s = [...serviceP95s, ...edgeP95s]

  const p95 = allP95s.length > 0 ? allP95s.reduce((a, b) => a + b, 0) / allP95s.length : 0
  // Approximate p50 as ~60% of p95 since we only have p95 from the stream
  const p50 = p95 * 0.6

  const errorRates = services.map((s) => s.errorRate).filter((v) => v >= 0)
  const errorRate =
    errorRates.length > 0 ? errorRates.reduce((a, b) => a + b, 0) / errorRates.length : 0

  const rps = edges.reduce((sum, e) => sum + e.rps, 0)

  return {
    timestamp: Date.now(),
    p95,
    p50,
    errorRate,
    rps,
    serviceCount: services.length,
  }
}

function computeWindow(snapshots: Snapshot[], windowNumber: number): CompletedWindow {
  const n = snapshots.length
  const meanP95 = n > 0 ? snapshots.reduce((s, snap) => s + snap.p95, 0) / n : 0
  const meanP50 = n > 0 ? snapshots.reduce((s, snap) => s + snap.p50, 0) / n : 0
  const peakP95 = n > 0 ? Math.max(...snapshots.map((s) => s.p95)) : 0
  const avgErrorRate = n > 0 ? snapshots.reduce((s, snap) => s + snap.errorRate, 0) / n : 0
  const totalRps = n > 0 ? snapshots.reduce((s, snap) => s + snap.rps, 0) / n : 0
  const serviceCount = n > 0 ? snapshots[n - 1].serviceCount : 0

  return {
    windowNumber,
    completedAt: new Date().toLocaleTimeString(),
    meanP95,
    meanP50,
    peakP95,
    avgErrorRate,
    totalRps,
    serviceCount,
    snapshotCount: n,
  }
}

/* ── SVG Arc Gauge ── */
function ArcGauge({ value, max, measuring }: { value: number; max: number; measuring: boolean }) {
  const radius = 90
  const strokeWidth = 14
  const cx = 120
  const cy = 120
  // Arc from 225deg to -45deg (bottom-left to bottom-right, 270deg sweep)
  const startAngle = 225
  const endAngle = -45
  const sweep = startAngle - endAngle // 270

  const polarToCartesian = (angle: number) => {
    const rad = (angle * Math.PI) / 180
    return { x: cx + radius * Math.cos(rad), y: cy - radius * Math.sin(rad) }
  }

  const describeArc = (start: number, end: number) => {
    const s = polarToCartesian(start)
    const e = polarToCartesian(end)
    const largeArc = start - end > 180 ? 1 : 0
    return `M ${s.x} ${s.y} A ${radius} ${radius} 0 ${largeArc} 1 ${e.x} ${e.y}`
  }

  const clampedValue = Math.min(value, max)
  const fraction = max > 0 ? clampedValue / max : 0
  const valueAngle = startAngle - fraction * sweep

  return (
    <svg viewBox="0 0 240 200" className="mx-auto h-52 w-52 md:h-64 md:w-64">
      {/* Background arc */}
      <path
        d={describeArc(startAngle, endAngle)}
        fill="none"
        stroke="var(--border)"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      {/* Value arc */}
      {value > 0 && (
        <path
          d={describeArc(startAngle, valueAngle)}
          fill="none"
          stroke={value > 500 ? '#f43f5e' : value > 200 ? '#f59e0b' : '#10b981'}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          className="transition-all duration-500 ease-out"
        />
      )}
      {/* Center text */}
      <text
        x={cx}
        y={cy - 10}
        textAnchor="middle"
        className="text-3xl font-bold"
        fill="var(--text-primary)"
        fontSize="32"
      >
        {formatMs(value)}
      </text>
      <text
        x={cx}
        y={cy + 16}
        textAnchor="middle"
        fill="var(--text-secondary)"
        fontSize="12"
        fontWeight="500"
      >
        System P95
      </text>
      {/* Pulsing indicator */}
      {measuring && (
        <circle cx={cx} cy={cy + 38} r="4" fill="#10b981">
          <animate attributeName="opacity" values="1;0.3;1" dur="1.5s" repeatCount="indefinite" />
          <animate attributeName="r" values="3;5;3" dur="1.5s" repeatCount="indefinite" />
        </circle>
      )}
    </svg>
  )
}

export default function Latency() {
  const { graphData, loading } = useGraphStream()
  const [completedWindows, setCompletedWindows] = useState<CompletedWindow[]>([])
  const [currentSnapshots, setCurrentSnapshots] = useState<Snapshot[]>([])
  const [secondsRemaining, setSecondsRemaining] = useState(WINDOW_DURATION_S)
  const [measuring, setMeasuring] = useState(false)

  const windowStartRef = useRef<number>(0)
  const windowCountRef = useRef(0)
  const snapshotsRef = useRef<Snapshot[]>([])

  // Start/restart window
  const startWindow = useCallback(() => {
    windowStartRef.current = Date.now()
    snapshotsRef.current = []
    setCurrentSnapshots([])
    setSecondsRemaining(WINDOW_DURATION_S)
    setMeasuring(true)
  }, [])

  // Complete window
  const completeWindow = useCallback(() => {
    windowCountRef.current += 1
    const result = computeWindow(snapshotsRef.current, windowCountRef.current)
    setCompletedWindows((prev) => [...prev, result])
    startWindow()
  }, [startWindow])

  // Start first window on mount
  useEffect(() => {
    startWindow()
  }, [startWindow])

  // Countdown timer
  useEffect(() => {
    const timer = setInterval(() => {
      if (!measuring) return
      const elapsed = Math.floor((Date.now() - windowStartRef.current) / 1000)
      const remaining = Math.max(0, WINDOW_DURATION_S - elapsed)
      setSecondsRemaining(remaining)

      if (remaining === 0) {
        completeWindow()
      }
    }, 500)

    return () => clearInterval(timer)
  }, [measuring, completeWindow])

  // Collect snapshots from graphData
  useEffect(() => {
    if (!graphData || !measuring) return
    const snap = aggregateSnapshot(graphData)
    snapshotsRef.current = [...snapshotsRef.current, snap]
    setCurrentSnapshots([...snapshotsRef.current])
  }, [graphData, measuring])

  // Derived values
  const latestSnap = currentSnapshots.length > 0 ? currentSnapshots[currentSnapshots.length - 1] : null
  const currentP95 = latestSnap?.p95 ?? 0
  const currentP50 = latestSnap?.p50 ?? 0
  const currentErrorRate = latestSnap?.errorRate ?? 0
  const activeServices = latestSnap?.serviceCount ?? 0

  const gaugeMax = Math.max(1000, currentP95 * 1.5)

  const lastWindow = completedWindows.length > 0 ? completedWindows[completedWindows.length - 1] : null
  const prevWindow = completedWindows.length > 1 ? completedWindows[completedWindows.length - 2] : null

  const delta = lastWindow && prevWindow ? lastWindow.meanP95 - prevWindow.meanP95 : null
  const improved = delta !== null && delta < 0
  const degraded = delta !== null && delta > 0

  // Chart data for history
  const chartData = completedWindows.map((w) => ({
    name: `#${w.windowNumber}`,
    p95: Number(w.meanP95.toFixed(1)),
    p50: Number(w.meanP50.toFixed(1)),
  }))

  if (loading) {
    return (
      <div className={pageContainerClass}>
        <PageHeader
          title="System Latency"
          description="Measure whole-system latency over 30-second windows"
          icon={Gauge}
        />
        <div className="flex items-center justify-center py-20">
          <LoadingSpinner />
        </div>
      </div>
    )
  }

  return (
    <div className={pageContainerClass}>
      <PageHeader
        title="System Latency"
        description="Continuous 30-second measurement windows — like a speed test for your microservices"
        icon={Gauge}
      />

      {/* Speed-test gauge section */}
      <Section title="Live Measurement" icon={Activity}>
        <div className="flex flex-col items-center gap-6">
          <ArcGauge value={currentP95} max={gaugeMax} measuring={measuring} />

          {/* Countdown */}
          <div className="text-center">
            <p className="text-sm font-medium text-[var(--text-secondary)]">
              {measuring ? (
                <>
                  Measuring&hellip;{' '}
                  <span className="font-bold text-[var(--text-primary)]">{secondsRemaining}s</span>{' '}
                  remaining
                </>
              ) : (
                'Window complete'
              )}
            </p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Window #{windowCountRef.current + 1} &middot; {currentSnapshots.length} snapshots
              collected
            </p>
          </div>

          {/* Live KPI cards */}
          <div className="grid w-full grid-cols-2 gap-4 md:grid-cols-4">
            <KPIStatCard
              label="Current P95"
              value={formatMs(currentP95)}
              variant={currentP95 > 500 ? 'danger' : currentP95 > 200 ? 'warning' : 'success'}
              tooltip="95th percentile latency aggregated across all services"
            />
            <KPIStatCard
              label="Current P50"
              value={formatMs(currentP50)}
              variant="default"
              tooltip="Estimated median latency (50th percentile)"
            />
            <KPIStatCard
              label="Avg Error Rate"
              value={formatPercent(currentErrorRate * 100)}
              variant={currentErrorRate > 0.05 ? 'danger' : currentErrorRate > 0.01 ? 'warning' : 'success'}
              tooltip="Average error rate across all services"
            />
            <KPIStatCard
              label="Active Services"
              value={activeServices}
              variant="default"
              tooltip="Number of services currently reporting metrics"
            />
          </div>
        </div>
      </Section>

      {/* Comparison section — only after first window completes */}
      {completedWindows.length > 0 && (
        <>
          <Section title="Window Comparison" icon={TrendingUp}>
            <div className="grid gap-4 md:grid-cols-3">
              {/* Previous window */}
              {prevWindow ? (
                <MetricHighlightCard
                  label="Previous Window"
                  description={`Window #${prevWindow.windowNumber} — ${prevWindow.completedAt}`}
                  icon={Clock}
                  tone="default"
                  value={formatMs(prevWindow.meanP95)}
                  note={
                    <p className="mt-1 text-xs text-[var(--text-muted)]">
                      P50: {formatMs(prevWindow.meanP50)} &middot; Error:{' '}
                      {formatPercent(prevWindow.avgErrorRate * 100)}
                    </p>
                  }
                  tooltip="Aggregate metrics from the previous 30s window"
                />
              ) : (
                <div
                  className={cn(
                    glassSurfaceClass,
                    'flex items-center justify-center rounded-[var(--radius-md)] p-6 text-sm text-[var(--text-muted)]'
                  )}
                >
                  No previous window yet
                </div>
              )}

              {/* Delta indicator */}
              <div
                className={cn(
                  glassSurfaceClass,
                  'flex flex-col items-center justify-center rounded-[var(--radius-md)] p-6'
                )}
              >
                {delta !== null ? (
                  <>
                    <div
                      className={cn(
                        'mb-2 flex items-center gap-2 text-lg font-bold',
                        improved
                          ? 'text-emerald-400'
                          : degraded
                            ? 'text-rose-400'
                            : 'text-[var(--text-muted)]'
                      )}
                    >
                      {improved ? (
                        <ArrowDown className="h-5 w-5" />
                      ) : degraded ? (
                        <ArrowUp className="h-5 w-5" />
                      ) : null}
                      {Math.abs(delta).toFixed(1)}ms
                    </div>
                    <p className="text-sm font-medium text-[var(--text-secondary)]">
                      {improved
                        ? 'Improved'
                        : degraded
                          ? 'Degraded'
                          : 'No change'}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-[var(--text-muted)]">
                    Waiting for second window&hellip;
                  </p>
                )}
              </div>

              {/* Current/latest window */}
              <MetricHighlightCard
                label="Latest Window"
                description={`Window #${lastWindow!.windowNumber} — ${lastWindow!.completedAt}`}
                icon={Gauge}
                tone={improved ? 'emerald' : degraded ? 'rose' : 'default'}
                value={formatMs(lastWindow!.meanP95)}
                note={
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    P50: {formatMs(lastWindow!.meanP50)} &middot; Error:{' '}
                    {formatPercent(lastWindow!.avgErrorRate * 100)}
                  </p>
                }
                tooltip="Aggregate metrics from the most recently completed 30s window"
              />
            </div>
          </Section>

          <Section title="Latency History" icon={Clock}>
            {/* Chart */}
            {chartData.length >= 2 && (
              <div className="mb-6">
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis
                      dataKey="name"
                      tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                      stroke="var(--border)"
                    />
                    <YAxis
                      tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                      stroke="var(--border)"
                      tickFormatter={(v: number) => formatMs(v)}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--surface-solid)',
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                        color: 'var(--text-primary)',
                        fontSize: 12,
                      }}
                      formatter={(value: number, name: string) => [
                        formatMs(value),
                        name.toUpperCase(),
                      ]}
                    />
                    <Line
                      type="monotone"
                      dataKey="p95"
                      stroke="#06b6d4"
                      strokeWidth={2}
                      dot={{ fill: '#06b6d4', r: 4 }}
                      name="p95"
                    />
                    <Line
                      type="monotone"
                      dataKey="p50"
                      stroke="#8b5cf6"
                      strokeWidth={2}
                      dot={{ fill: '#8b5cf6', r: 4 }}
                      name="p50"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Results table */}
            <div className={tableShellClass}>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className={tableHeadRowClass}>
                      <th className={tableHeaderCellClass}>Window</th>
                      <th className={tableHeaderCellClass}>Timestamp</th>
                      <th className={tableHeaderCellClass}>Mean P95</th>
                      <th className={tableHeaderCellClass}>Mean P50</th>
                      <th className={tableHeaderCellClass}>Peak P95</th>
                      <th className={tableHeaderCellClass}>Avg Error Rate</th>
                      <th className={tableHeaderCellClass}>Delta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {completedWindows.map((w, idx) => {
                      const prev = idx > 0 ? completedWindows[idx - 1] : null
                      const d = prev ? w.meanP95 - prev.meanP95 : null
                      return (
                        <tr key={w.windowNumber} className={tableBodyRowClass}>
                          <td className={tableCellClass}>#{w.windowNumber}</td>
                          <td className={tableCellClass}>{w.completedAt}</td>
                          <td className={tableCellClass}>{formatMs(w.meanP95)}</td>
                          <td className={tableCellClass}>{formatMs(w.meanP50)}</td>
                          <td className={tableCellClass}>{formatMs(w.peakP95)}</td>
                          <td className={tableCellClass}>
                            {formatPercent(w.avgErrorRate * 100)}
                          </td>
                          <td className={tableCellClass}>
                            {d !== null ? (
                              <span
                                className={cn(
                                  'inline-flex items-center gap-1 text-xs font-semibold',
                                  d < 0
                                    ? 'text-emerald-400'
                                    : d > 0
                                      ? 'text-rose-400'
                                      : 'text-[var(--text-muted)]'
                                )}
                              >
                                {d < 0 ? (
                                  <TrendingDown className="h-3 w-3" />
                                ) : d > 0 ? (
                                  <TrendingUp className="h-3 w-3" />
                                ) : null}
                                {d < 0 ? '-' : d > 0 ? '+' : ''}
                                {formatMs(Math.abs(d))}
                              </span>
                            ) : (
                              <span className="text-xs text-[var(--text-muted)]">&mdash;</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </Section>
        </>
      )}
    </div>
  )
}
