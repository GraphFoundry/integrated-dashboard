import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle,
  Clock,
  Download,
  FileText,
  Gauge,
  Minus,
  TrendingDown,
  TrendingUp,
  Zap,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useGraphStream } from '@/lib/useGraphStream'
import { formatDate, formatMs, formatPercent, formatRps, formatShortDate } from '@/lib/format'
import {
  cn,
  glassPanelClass,
  glassSurfaceClass,
  pageContainerClass,
  secondaryButtonClass,
  tableBodyRowClass,
  tableCellClass,
  tableHeadRowClass,
  tableHeaderCellClass,
  tableShellClass,
} from '@/components/common/uiClassTokens'
import LoadingSpinner from '@/components/common/LoadingSpinner'
import EmptyState from '@/components/layout/EmptyState'
import KPIStatCard from '@/components/layout/KPIStatCard'
import MetricHighlightCard from '@/components/layout/MetricHighlightCard'
import PageHeader from '@/components/layout/PageHeader'
import Section from '@/components/layout/Section'
import type { GraphUpdateData } from '@/lib/bffApiClient'

const WINDOW_DURATION_S = 30
const LATEST_WINDOW_STORAGE_KEY = 'latency_latest_completed_window_v1'

type KpiVariant = 'default' | 'success' | 'warning' | 'danger'
type VerdictTone = 'improved' | 'degraded' | 'stable'

interface Snapshot {
  p95: number
  p50: number
  errorRate: number
  rps: number
  serviceCount: number
  edgeCount: number
}

interface CompletedWindow {
  windowNumber: number
  timestamp: string
  meanP95: number
  meanP50: number
  peakP95: number
  avgErrorRate: number
  totalRps: number
  serviceCount: number
  edgeCount: number
  snapshotCount: number
}

interface LatencyReportSummary {
  generatedAt: string
  windowCount: number
  observationSeconds: number
  overallAverageP95: number
  overallAverageP50: number
  overallAverageErrorRate: number
  overallAverageRps: number
  bestWindow: CompletedWindow
  worstWindow: CompletedWindow
  firstWindow: CompletedWindow
  lastWindow: CompletedWindow
  netP95Delta: number
  netP95ChangePercent: number | null
  improvedComparisons: number
  degradedComparisons: number
  stableComparisons: number
  comparisonCount: number
  verdict: VerdictTone
}

interface ReportChartPoint {
  label: string
  windowNumber: number
  timestamp: string
  meanP95: number
  meanP50: number
  avgErrorRate: number
}

interface PdfPalette {
  background: string
  textPrimary: string
  textSecondary: string
  textMuted: string
  surfacePanel: string
  surfaceSoft: string
  surfaceSolid: string
  border: string
  ring: string
  accentPrimary: string
  success: string
  warning: string
  error: string
}

function isCompletedWindow(value: unknown): value is CompletedWindow {
  if (!value || typeof value !== 'object') return false

  const candidate = value as Partial<CompletedWindow>
  return (
    typeof candidate.windowNumber === 'number' &&
    typeof candidate.timestamp === 'string' &&
    typeof candidate.meanP95 === 'number' &&
    typeof candidate.meanP50 === 'number' &&
    typeof candidate.peakP95 === 'number' &&
    typeof candidate.avgErrorRate === 'number' &&
    typeof candidate.totalRps === 'number' &&
    typeof candidate.serviceCount === 'number' &&
    typeof candidate.edgeCount === 'number' &&
    typeof candidate.snapshotCount === 'number'
  )
}

function getStoredLatencyWindow(): CompletedWindow | null {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.localStorage.getItem(LATEST_WINDOW_STORAGE_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw)
    return isCompletedWindow(parsed) ? parsed : null
  } catch {
    return null
  }
}

function cacheLatencyWindow(windowData: CompletedWindow): void {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(LATEST_WINDOW_STORAGE_KEY, JSON.stringify(windowData))
  } catch {
    // Ignore localStorage quota and private mode failures.
  }
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function buildSvgPoints(
  values: number[],
  width: number,
  height: number,
  padding: number,
  maxValue: number
): string {
  const stepX = values.length > 1 ? (width - padding * 2) / (values.length - 1) : 0

  return values
    .map((value, index) => {
      const x = padding + stepX * index
      const y = height - padding - (value / maxValue) * (height - padding * 2)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
}

function buildAreaPoints(
  values: number[],
  width: number,
  height: number,
  padding: number,
  maxValue: number
): string {
  const linePoints = buildSvgPoints(values, width, height, padding, maxValue)
  if (!linePoints) return ''

  const points = linePoints.split(' ')
  const firstX = points[0]?.split(',')[0] ?? `${padding}`
  const lastX = points[points.length - 1]?.split(',')[0] ?? `${width - padding}`
  return `${linePoints} ${lastX},${height - padding} ${firstX},${height - padding}`
}

function openLatencyPdfPreview(
  summary: LatencyReportSummary,
  windows: CompletedWindow[],
  storedWindowAtLoad: CompletedWindow | null
) {
  const popup = window.open('', '_blank', 'width=1360,height=960')
  if (!popup) {
    toast.error('Pop-up blocked. Allow pop-ups to export the PDF report.')
    return
  }

  const rootStyles = window.getComputedStyle(document.documentElement)
  const readCssVar = (name: string, fallback: string) =>
    rootStyles.getPropertyValue(name).trim() || fallback

  const palette: PdfPalette = {
    background: readCssVar('--background', '#edf2ff'),
    textPrimary: readCssVar('--text-primary', '#0f172a'),
    textSecondary: readCssVar('--text-secondary', '#334155'),
    textMuted: readCssVar('--text-muted', '#64748b'),
    surfacePanel: readCssVar('--surface-panel', 'rgba(255,255,255,0.84)'),
    surfaceSoft: readCssVar('--surface-soft', 'rgba(226,232,240,0.58)'),
    surfaceSolid: readCssVar('--surface-solid', '#f8fafc'),
    border: readCssVar('--border', 'rgba(148,163,184,0.34)'),
    ring: readCssVar('--ring', 'rgba(16,185,129,0.45)'),
    accentPrimary: readCssVar('--accent-primary', '#0ea5e9'),
    success: readCssVar('--success', '#10b981'),
    warning: readCssVar('--warning', '#f59e0b'),
    error: readCssVar('--error', '#ef4444'),
  }

  const latestWindow = summary.lastWindow
  const storedDelta = storedWindowAtLoad
    ? getDelta(latestWindow.meanP95, storedWindowAtLoad.meanP95)
    : null
  const storedVerdict =
    storedDelta === null
      ? 'neutral'
      : storedDelta < 0
        ? 'success'
        : storedDelta > 0
          ? 'danger'
          : 'neutral'
  const storedVerdictText =
    storedDelta === null
      ? 'No stored baseline existed when this session loaded.'
      : storedDelta < 0
        ? `Improved by ${formatMs(Math.abs(storedDelta))} vs stored baseline`
        : storedDelta > 0
          ? `Degraded by ${formatMs(storedDelta)} vs stored baseline`
          : 'Matched the stored baseline exactly'

  const p95Values = windows.map((window) => window.meanP95)
  const p50Values = windows.map((window) => window.meanP50)
  const chartWidth = 920
  const chartHeight = 320
  const chartPadding = 44
  const chartMax = Math.max(...p95Values, ...p50Values, summary.firstWindow.meanP95, 1)
  const gridValues = Array.from({ length: 5 }, (_, index) => {
    const ratio = index / 4
    return chartMax * (1 - ratio)
  })
  const xStep = windows.length > 1 ? (chartWidth - chartPadding * 2) / (windows.length - 1) : 0
  const xLabelModulo = windows.length > 8 ? Math.ceil(windows.length / 8) : 1

  const p95LinePoints = buildSvgPoints(p95Values, chartWidth, chartHeight, chartPadding, chartMax)
  const p50LinePoints = buildSvgPoints(p50Values, chartWidth, chartHeight, chartPadding, chartMax)
  const p95AreaPoints = buildAreaPoints(p95Values, chartWidth, chartHeight, chartPadding, chartMax)
  const p50AreaPoints = buildAreaPoints(p50Values, chartWidth, chartHeight, chartPadding, chartMax)
  const baselineY =
    chartHeight -
    chartPadding -
    (summary.firstWindow.meanP95 / chartMax) * (chartHeight - chartPadding * 2)

  const evidenceRows = windows
    .map((window, index) => {
      const previousWindow = index > 0 ? windows[index - 1] : null
      const delta = previousWindow ? getDelta(window.meanP95, previousWindow.meanP95) : null
      const deltaColor =
        delta === null
          ? palette.textMuted
          : delta < 0
            ? palette.success
            : delta > 0
              ? palette.error
              : palette.textMuted

      return `
        <tr>
          <td>#${escapeHtml(window.windowNumber)}</td>
          <td>${escapeHtml(formatWindowTime(window.timestamp))}</td>
          <td>${escapeHtml(formatMs(window.meanP95))}</td>
          <td>${escapeHtml(formatMs(window.meanP50))}</td>
          <td>${escapeHtml(formatMs(window.peakP95))}</td>
          <td>${escapeHtml(formatPercent(window.avgErrorRate * 100))}</td>
          <td>${escapeHtml(`${formatRps(window.totalRps)} RPS`)}</td>
          <td>${escapeHtml(window.serviceCount)}</td>
          <td style="color:${deltaColor}; font-weight:700;">${escapeHtml(delta === null ? '--' : formatLatencyDelta(delta))}</td>
        </tr>
      `
    })
    .join('')

  const storedBaselineMarkup = storedWindowAtLoad
    ? `
      <div class="comparison-grid">
        <div class="glass-card">
          <div class="eyebrow">Stored 30s Window</div>
          <div class="metric-value">${escapeHtml(formatMs(storedWindowAtLoad.meanP95))}</div>
          <div class="muted">Loaded from local storage at page start</div>
          <div class="subtext">Window #${escapeHtml(storedWindowAtLoad.windowNumber)} · ${escapeHtml(formatDate(storedWindowAtLoad.timestamp))}</div>
        </div>
        <div class="delta-card ${storedVerdict}">
          <div class="eyebrow">Stored Memory Delta</div>
          <div class="metric-value">${escapeHtml(storedDelta === null ? '--' : formatLatencyDelta(storedDelta))}</div>
          <div class="subtext">${escapeHtml(storedVerdictText)}</div>
        </div>
        <div class="glass-card">
          <div class="eyebrow">Latest New Window</div>
          <div class="metric-value">${escapeHtml(formatMs(latestWindow.meanP95))}</div>
          <div class="muted">Newest 30-second window from this session</div>
          <div class="subtext">Window #${escapeHtml(latestWindow.windowNumber)} · ${escapeHtml(formatDate(latestWindow.timestamp))}</div>
        </div>
      </div>
    `
    : `
      <div class="glass-card">
        <div class="eyebrow">Stored Baseline Memory</div>
        <div class="metric-value">Not available yet</div>
        <div class="subtext">
          This was the first load without a stored 30-second latency window. The newest completed window from this session is now cached for the next visit.
        </div>
      </div>
    `

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Latency PDF Report - ${escapeHtml(summary.generatedAt)}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Sora:wght@600;700&display=swap');
    :root {
      --bg: ${palette.background};
      --text-primary: ${palette.textPrimary};
      --text-secondary: ${palette.textSecondary};
      --text-muted: ${palette.textMuted};
      --surface-panel: ${palette.surfacePanel};
      --surface-soft: ${palette.surfaceSoft};
      --surface-solid: ${palette.surfaceSolid};
      --border: ${palette.border};
      --ring: ${palette.ring};
      --accent: ${palette.accentPrimary};
      --success: ${palette.success};
      --warning: ${palette.warning};
      --error: ${palette.error};
    }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body {
      margin: 0;
      font-family: 'Manrope', 'Segoe UI', sans-serif;
      color: var(--text-primary);
      background:
        radial-gradient(circle at top right, color-mix(in srgb, var(--accent) 18%, transparent), transparent 28%),
        radial-gradient(circle at left 20% bottom 10%, color-mix(in srgb, var(--success) 16%, transparent), transparent 30%),
        linear-gradient(180deg, color-mix(in srgb, var(--bg) 92%, white), white 55%);
    }
    .page {
      max-width: 1180px;
      margin: 0 auto;
      padding: 28px 24px 80px;
    }
    .toolbar {
      position: sticky;
      top: 12px;
      z-index: 40;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 18px;
      padding: 14px 16px;
      border: 1px solid var(--border);
      border-radius: 18px;
      background: color-mix(in srgb, var(--surface-panel) 88%, white);
      backdrop-filter: blur(18px);
      box-shadow: 0 18px 40px rgba(15, 23, 42, 0.12);
    }
    .toolbar-actions, .toolbar-nav {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-items: center;
    }
    .toolbar button, .toolbar a {
      border: 1px solid var(--border);
      border-radius: 999px;
      background: color-mix(in srgb, var(--surface-soft) 88%, white);
      color: var(--text-primary);
      padding: 10px 14px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-decoration: none;
      cursor: pointer;
    }
    .toolbar button.primary {
      border-color: color-mix(in srgb, var(--ring) 65%, var(--border));
      background: linear-gradient(135deg, color-mix(in srgb, var(--success) 82%, white), color-mix(in srgb, var(--accent) 72%, white));
    }
    .hero {
      position: relative;
      overflow: hidden;
      border: 1px solid var(--border);
      border-radius: 28px;
      padding: 28px;
      background: linear-gradient(135deg, color-mix(in srgb, var(--surface-panel) 92%, var(--accent) 8%), color-mix(in srgb, var(--surface-panel) 94%, var(--success) 6%));
      box-shadow: 0 24px 54px rgba(15, 23, 42, 0.12);
    }
    .hero::before,
    .hero::after {
      content: '';
      position: absolute;
      border-radius: 999px;
      filter: blur(22px);
      opacity: 0.7;
    }
    .hero::before {
      width: 220px;
      height: 220px;
      top: -80px;
      right: -40px;
      background: color-mix(in srgb, var(--accent) 28%, transparent);
    }
    .hero::after {
      width: 180px;
      height: 180px;
      left: 18%;
      bottom: -80px;
      background: color-mix(in srgb, var(--success) 22%, transparent);
    }
    .eyebrow {
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: var(--text-muted);
    }
    h1, h2, h3, p { margin: 0; }
    h1 {
      margin-top: 8px;
      font-family: 'Sora', 'Manrope', sans-serif;
      font-size: 34px;
      line-height: 1.05;
    }
    .hero-meta {
      margin-top: 10px;
      color: var(--text-secondary);
      font-size: 14px;
    }
    .hero-summary {
      margin-top: 18px;
      display: inline-flex;
      align-items: center;
      gap: 10px;
      border: 1px solid var(--border);
      border-radius: 999px;
      padding: 10px 14px;
      background: color-mix(in srgb, var(--surface-soft) 88%, white);
      color: var(--text-secondary);
      font-size: 13px;
      font-weight: 600;
    }
    .card-grid {
      margin-top: 24px;
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 14px;
    }
    .summary-card, .glass-card, .section {
      border: 1px solid var(--border);
      border-radius: 22px;
      background: color-mix(in srgb, var(--surface-panel) 90%, white);
      box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
    }
    .summary-card {
      padding: 18px;
      min-height: 148px;
    }
    .summary-card .metric-value, .glass-card .metric-value, .delta-card .metric-value {
      margin-top: 10px;
      font-size: 28px;
      font-weight: 800;
      line-height: 1;
    }
    .muted, .subtext {
      color: var(--text-secondary);
      font-size: 13px;
      line-height: 1.5;
    }
    .subtext {
      margin-top: 8px;
    }
    .summary-card.emerald { border-color: color-mix(in srgb, var(--success) 42%, var(--border)); }
    .summary-card.rose { border-color: color-mix(in srgb, var(--error) 42%, var(--border)); }
    .summary-card.default { border-color: var(--border); }
    .section {
      margin-top: 22px;
      padding: 22px;
    }
    .section-header {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: end;
      margin-bottom: 16px;
    }
    .section-header p {
      color: var(--text-secondary);
      font-size: 14px;
      margin-top: 8px;
    }
    .legend {
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
      margin-bottom: 12px;
      color: var(--text-secondary);
      font-size: 12px;
      font-weight: 700;
    }
    .legend span {
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }
    .legend i {
      display: inline-block;
      width: 14px;
      height: 14px;
      border-radius: 999px;
    }
    .comparison-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 14px;
    }
    .glass-card, .delta-card {
      padding: 18px;
      border-radius: 22px;
      background: color-mix(in srgb, var(--surface-panel) 90%, white);
      border: 1px solid var(--border);
    }
    .delta-card.success {
      border-color: color-mix(in srgb, var(--success) 45%, var(--border));
      background: color-mix(in srgb, var(--success) 10%, var(--surface-panel));
    }
    .delta-card.danger {
      border-color: color-mix(in srgb, var(--error) 45%, var(--border));
      background: color-mix(in srgb, var(--error) 10%, var(--surface-panel));
    }
    .delta-card.neutral {
      border-color: color-mix(in srgb, var(--warning) 38%, var(--border));
      background: color-mix(in srgb, var(--warning) 9%, var(--surface-panel));
    }
    .metric-pair-grid {
      display: grid;
      gap: 14px;
    }
    .metric-pair {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 240px minmax(0, 1fr);
      gap: 14px;
      align-items: stretch;
    }
    .verdict-banner {
      margin-top: 14px;
      border-width: 2px;
    }
    .verdict-banner.success {
      border-color: color-mix(in srgb, var(--success) 48%, var(--border));
      background: color-mix(in srgb, var(--success) 9%, var(--surface-panel));
    }
    .verdict-banner.danger {
      border-color: color-mix(in srgb, var(--error) 48%, var(--border));
      background: color-mix(in srgb, var(--error) 8%, var(--surface-panel));
    }
    .verdict-banner.neutral {
      border-color: color-mix(in srgb, var(--warning) 42%, var(--border));
      background: color-mix(in srgb, var(--warning) 10%, var(--surface-panel));
    }
    table {
      width: 100%;
      border-collapse: collapse;
      overflow: hidden;
      border-radius: 18px;
      background: color-mix(in srgb, var(--surface-solid) 92%, white);
    }
    th, td {
      padding: 12px 14px;
      border-bottom: 1px solid color-mix(in srgb, var(--border) 85%, white);
      text-align: left;
      font-size: 13px;
      vertical-align: top;
    }
    th {
      background: color-mix(in srgb, var(--surface-soft) 84%, white);
      color: var(--text-muted);
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    tr:last-child td { border-bottom: none; }
    .footer-note {
      margin-top: 14px;
      color: var(--text-secondary);
      font-size: 13px;
    }
    @media (max-width: 980px) {
      .card-grid,
      .comparison-grid,
      .metric-pair {
        grid-template-columns: 1fr;
      }
    }
    @media print {
      body { background: white; }
      .page { padding: 0; }
      .toolbar { display: none; }
      .hero, .section, .summary-card, .glass-card, .delta-card {
        box-shadow: none;
        break-inside: avoid;
      }
      .section { margin-top: 14px; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="toolbar no-print">
      <div class="toolbar-actions">
        <button type="button" id="print-btn" class="primary">Print / Save as PDF</button>
        <button type="button" id="close-btn">Close Preview</button>
      </div>
      <div class="toolbar-nav">
        <a href="#summary">Summary</a>
        <a href="#trend">Trend</a>
        <a href="#evidence">Evidence</a>
        <a href="#verdict">Verdict</a>
        <a href="#memory">Memory</a>
      </div>
    </div>

    <section class="hero" id="summary">
      <div class="eyebrow">Latency PDF Report</div>
      <h1>System Latency Evidence Pack</h1>
      <div class="hero-meta">Generated at ${escapeHtml(formatDate(summary.generatedAt))}</div>
      <div class="hero-summary">
        Covering ${escapeHtml(summary.windowCount)} measurement windows (${escapeHtml(summary.observationSeconds)}s total observation)
      </div>
      <div class="card-grid">
        <div class="summary-card ${escapeHtml(getOverallLatencyTone(summary.overallAverageP95))}">
          <div class="eyebrow">Overall Average p95</div>
          <div class="metric-value">${escapeHtml(formatMs(summary.overallAverageP95))}</div>
          <div class="subtext">Average p50: ${escapeHtml(formatMs(summary.overallAverageP50))}</div>
        </div>
        <div class="summary-card emerald">
          <div class="eyebrow">Best Window</div>
          <div class="metric-value">#${escapeHtml(summary.bestWindow.windowNumber)}</div>
          <div class="subtext">${escapeHtml(formatMs(summary.bestWindow.meanP95))} mean p95</div>
        </div>
        <div class="summary-card rose">
          <div class="eyebrow">Worst Window</div>
          <div class="metric-value">#${escapeHtml(summary.worstWindow.windowNumber)}</div>
          <div class="subtext">${escapeHtml(formatMs(summary.worstWindow.meanP95))} mean p95</div>
        </div>
        <div class="summary-card ${escapeHtml(summary.verdict === 'improved' ? 'emerald' : summary.verdict === 'degraded' ? 'rose' : 'default')}">
          <div class="eyebrow">Net Trend</div>
          <div class="metric-value">${escapeHtml(summary.netP95Delta === 0 ? '0ms' : formatLatencyDelta(summary.netP95Delta))}</div>
          <div class="subtext">Window #${escapeHtml(summary.firstWindow.windowNumber)} to #${escapeHtml(summary.lastWindow.windowNumber)}</div>
        </div>
      </div>
    </section>

    <section class="section" id="trend">
      <div class="section-header">
        <div>
          <div class="eyebrow">Latency Trend Over Time</div>
          <h2>Trend evidence across completed windows</h2>
          <p>Mean p95 and p50 are plotted against the first-window p95 baseline.</p>
        </div>
      </div>
      <div class="legend">
        <span><i style="background:${palette.accentPrimary};"></i>Mean P95</span>
        <span><i style="background:${palette.success};"></i>Mean P50</span>
        <span><i style="background:${palette.textMuted};"></i>Baseline</span>
      </div>
      <svg viewBox="0 0 ${chartWidth} ${chartHeight}" width="100%" height="320" role="img" aria-label="Latency trend chart">
        ${gridValues
          .map((value) => {
            const y =
              chartHeight - chartPadding - (value / chartMax) * (chartHeight - chartPadding * 2)
            return `
              <line x1="${chartPadding}" y1="${y.toFixed(1)}" x2="${chartWidth - chartPadding}" y2="${y.toFixed(1)}" stroke="${palette.border}" stroke-dasharray="4 6" />
              <text x="10" y="${(y + 4).toFixed(1)}" font-size="11" fill="${palette.textMuted}">${escapeHtml(formatMs(value))}</text>
            `
          })
          .join('')}
        <line x1="${chartPadding}" y1="${baselineY.toFixed(1)}" x2="${chartWidth - chartPadding}" y2="${baselineY.toFixed(1)}" stroke="${palette.textMuted}" stroke-dasharray="8 8" />
        <text x="${chartWidth - chartPadding - 8}" y="${(baselineY - 8).toFixed(1)}" text-anchor="end" font-size="12" fill="${palette.textMuted}">Baseline</text>
        <polygon points="${p95AreaPoints}" fill="${palette.accentPrimary}" opacity="0.12"></polygon>
        <polygon points="${p50AreaPoints}" fill="${palette.success}" opacity="0.11"></polygon>
        <polyline points="${p95LinePoints}" fill="none" stroke="${palette.accentPrimary}" stroke-width="3"></polyline>
        <polyline points="${p50LinePoints}" fill="none" stroke="${palette.success}" stroke-width="3"></polyline>
        ${windows
          .map((window, index) => {
            const x = chartPadding + xStep * index
            const p95Y =
              chartHeight -
              chartPadding -
              (window.meanP95 / chartMax) * (chartHeight - chartPadding * 2)
            const p50Y =
              chartHeight -
              chartPadding -
              (window.meanP50 / chartMax) * (chartHeight - chartPadding * 2)
            const shouldRenderLabel = index % xLabelModulo === 0 || index === windows.length - 1
            return `
              <circle cx="${x.toFixed(1)}" cy="${p95Y.toFixed(1)}" r="4.2" fill="${palette.accentPrimary}"></circle>
              <circle cx="${x.toFixed(1)}" cy="${p50Y.toFixed(1)}" r="4.2" fill="${palette.success}"></circle>
              ${
                shouldRenderLabel
                  ? `<text x="${x.toFixed(1)}" y="${chartHeight - 14}" text-anchor="middle" font-size="11" fill="${palette.textMuted}">#${escapeHtml(window.windowNumber)}</text>`
                  : ''
              }
            `
          })
          .join('')}
      </svg>
    </section>

    <section class="section" id="evidence">
      <div class="section-header">
        <div>
          <div class="eyebrow">Window-by-Window Evidence</div>
          <h2>Completed 30-second windows</h2>
          <p>${escapeHtml(summary.improvedComparisons)} of ${escapeHtml(summary.comparisonCount)} windows improved vs their predecessor.</p>
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Time</th>
            <th>Avg p95</th>
            <th>Avg p50</th>
            <th>Peak p95</th>
            <th>Error Rate</th>
            <th>Traffic</th>
            <th>Services</th>
            <th>Delta</th>
          </tr>
        </thead>
        <tbody>${evidenceRows}</tbody>
      </table>
    </section>

    <section class="section" id="verdict">
      <div class="section-header">
        <div>
          <div class="eyebrow">Improvement Verdict</div>
          <h2>First window versus latest window</h2>
          <p>The verdict is based on mean p95 movement from the first completed window to the latest completed window.</p>
        </div>
      </div>
      <div class="metric-pair-grid">
        ${[
          {
            label: 'P95',
            first: formatMs(summary.firstWindow.meanP95),
            last: formatMs(summary.lastWindow.meanP95),
            delta:
              summary.netP95Delta < 0
                ? `Improved by ${formatMs(Math.abs(summary.netP95Delta))}`
                : summary.netP95Delta > 0
                  ? `Degraded by ${formatMs(summary.netP95Delta)}`
                  : 'Unchanged',
            tone:
              summary.netP95Delta < 0 ? 'success' : summary.netP95Delta > 0 ? 'danger' : 'neutral',
          },
          {
            label: 'P50',
            first: formatMs(summary.firstWindow.meanP50),
            last: formatMs(summary.lastWindow.meanP50),
            delta: (() => {
              const delta = getDelta(summary.lastWindow.meanP50, summary.firstWindow.meanP50)
              return delta < 0
                ? `Improved by ${formatMs(Math.abs(delta))}`
                : delta > 0
                  ? `Degraded by ${formatMs(delta)}`
                  : 'Unchanged'
            })(),
            tone: (() => {
              const delta = getDelta(summary.lastWindow.meanP50, summary.firstWindow.meanP50)
              return delta < 0 ? 'success' : delta > 0 ? 'danger' : 'neutral'
            })(),
          },
          {
            label: 'Error Rate',
            first: formatPercent(summary.firstWindow.avgErrorRate * 100),
            last: formatPercent(summary.lastWindow.avgErrorRate * 100),
            delta: (() => {
              const delta = getDelta(
                summary.lastWindow.avgErrorRate,
                summary.firstWindow.avgErrorRate,
                4
              )
              return delta < 0
                ? `Improved by ${formatPercent(Math.abs(delta) * 100)}`
                : delta > 0
                  ? `Degraded by ${formatPercent(delta * 100)}`
                  : 'Unchanged'
            })(),
            tone: (() => {
              const delta = getDelta(
                summary.lastWindow.avgErrorRate,
                summary.firstWindow.avgErrorRate,
                4
              )
              return delta < 0 ? 'success' : delta > 0 ? 'danger' : 'neutral'
            })(),
          },
          {
            label: 'Traffic',
            first: `${formatRps(summary.firstWindow.totalRps)} RPS`,
            last: `${formatRps(summary.lastWindow.totalRps)} RPS`,
            delta: (() => {
              const delta = getDelta(summary.lastWindow.totalRps, summary.firstWindow.totalRps)
              return delta < 0
                ? `Decreased by ${formatRps(Math.abs(delta))} RPS`
                : delta > 0
                  ? `Increased by ${formatRps(delta)} RPS`
                  : 'Unchanged'
            })(),
            tone: 'neutral',
          },
        ]
          .map(
            (item) => `
              <div class="metric-pair">
                <div class="glass-card">
                  <div class="eyebrow">First Window ${escapeHtml(item.label)}</div>
                  <div class="metric-value">${escapeHtml(item.first)}</div>
                </div>
                <div class="delta-card ${escapeHtml(item.tone)}">
                  <div class="eyebrow">${escapeHtml(item.label)} Delta</div>
                  <div class="metric-value">${escapeHtml(item.delta)}</div>
                </div>
                <div class="glass-card">
                  <div class="eyebrow">Latest Window ${escapeHtml(item.label)}</div>
                  <div class="metric-value">${escapeHtml(item.last)}</div>
                </div>
              </div>
            `
          )
          .join('')}
      </div>
      <div class="glass-card verdict-banner ${escapeHtml(summary.verdict === 'improved' ? 'success' : summary.verdict === 'degraded' ? 'danger' : 'neutral')}">
        <div class="eyebrow">Verdict</div>
        <div class="metric-value">${escapeHtml(summary.verdict === 'improved' ? 'Latency Improved' : summary.verdict === 'degraded' ? 'Latency Degraded' : 'Latency Unchanged')}</div>
        <div class="subtext">
          ${
            summary.verdict === 'improved'
              ? escapeHtml(
                  summary.netP95ChangePercent !== null
                    ? `Mean p95 improved by ${formatPercent(summary.netP95ChangePercent)} from window #${summary.firstWindow.windowNumber} to window #${summary.lastWindow.windowNumber}.`
                    : `Mean p95 improved by ${formatMs(Math.abs(summary.netP95Delta))} from window #${summary.firstWindow.windowNumber} to window #${summary.lastWindow.windowNumber}.`
                )
              : summary.verdict === 'degraded'
                ? escapeHtml(
                    summary.netP95ChangePercent !== null
                      ? `Mean p95 degraded by ${formatPercent(summary.netP95ChangePercent)} from window #${summary.firstWindow.windowNumber} to window #${summary.lastWindow.windowNumber}.`
                      : `Mean p95 degraded by ${formatMs(Math.abs(summary.netP95Delta))} from window #${summary.firstWindow.windowNumber} to window #${summary.lastWindow.windowNumber}.`
                  )
                : escapeHtml(
                    `Mean p95 remained unchanged between window #${summary.firstWindow.windowNumber} and window #${summary.lastWindow.windowNumber}.`
                  )
          }
        </div>
      </div>
    </section>

    <section class="section" id="memory">
      <div class="section-header">
        <div>
          <div class="eyebrow">Stored Baseline Memory</div>
          <h2>Persisted 30-second comparison</h2>
          <p>The stored baseline is captured from local storage at page load, so it does not compare until a new window is created in this session.</p>
        </div>
      </div>
      ${storedBaselineMarkup}
    </section>
  </div>

  <script>
    document.getElementById('print-btn')?.addEventListener('click', () => window.print())
    document.getElementById('close-btn')?.addEventListener('click', () => window.close())
  </script>
</body>
</html>`

  popup.document.open()
  popup.document.write(html)
  popup.document.close()
  popup.focus()
  toast.success('PDF preview opened in a new tab')
}

function aggregateSnapshot(data: GraphUpdateData): Snapshot {
  const services = data.metricsSnapshot.services
  const edges = data.metricsSnapshot.edges

  const serviceP95s = services.map((service) => service.p95).filter((value) => value > 0)
  const edgeP95s = edges.map((edge) => edge.p95).filter((value) => value > 0)
  const allP95s = [...serviceP95s, ...edgeP95s]

  const p95 =
    allP95s.length > 0 ? allP95s.reduce((sum, value) => sum + value, 0) / allP95s.length : 0
  // Approximate p50 as ~60% of p95 since the live stream only exposes p95 today.
  const p50 = p95 * 0.6

  const errorRates = services.map((service) => service.errorRate).filter((value) => value >= 0)
  const errorRate =
    errorRates.length > 0
      ? errorRates.reduce((sum, value) => sum + value, 0) / errorRates.length
      : 0

  const rps = edges.reduce((sum, edge) => sum + edge.rps, 0)

  return {
    p95,
    p50,
    errorRate,
    rps,
    serviceCount: services.length,
    edgeCount: edges.length,
  }
}

function computeWindow(snapshots: Snapshot[], windowNumber: number): CompletedWindow {
  const snapshotCount = snapshots.length
  const meanP95 =
    snapshotCount > 0
      ? snapshots.reduce((sum, snapshot) => sum + snapshot.p95, 0) / snapshotCount
      : 0
  const meanP50 =
    snapshotCount > 0
      ? snapshots.reduce((sum, snapshot) => sum + snapshot.p50, 0) / snapshotCount
      : 0
  const peakP95 = snapshotCount > 0 ? Math.max(...snapshots.map((snapshot) => snapshot.p95)) : 0
  const avgErrorRate =
    snapshotCount > 0
      ? snapshots.reduce((sum, snapshot) => sum + snapshot.errorRate, 0) / snapshotCount
      : 0
  const totalRps =
    snapshotCount > 0
      ? snapshots.reduce((sum, snapshot) => sum + snapshot.rps, 0) / snapshotCount
      : 0
  const serviceCount =
    snapshotCount > 0 ? Math.max(...snapshots.map((snapshot) => snapshot.serviceCount)) : 0
  const edgeCount =
    snapshotCount > 0 ? Math.max(...snapshots.map((snapshot) => snapshot.edgeCount)) : 0

  return {
    windowNumber,
    timestamp: new Date().toISOString(),
    meanP95,
    meanP50,
    peakP95,
    avgErrorRate,
    totalRps,
    serviceCount,
    edgeCount,
    snapshotCount,
  }
}

function getDelta(nextValue: number, previousValue: number, decimals = 2): number {
  return Number((nextValue - previousValue).toFixed(decimals))
}

function getLatencyVariant(latencyMs: number): KpiVariant {
  if (latencyMs > 500) return 'danger'
  if (latencyMs > 200) return 'warning'
  return 'success'
}

function getErrorVariant(errorRate: number): KpiVariant {
  if (errorRate > 0.05) return 'danger'
  if (errorRate > 0.01) return 'warning'
  return 'success'
}

function getOverallLatencyTone(latencyMs: number): 'default' | 'emerald' | 'rose' {
  if (latencyMs < 100) return 'emerald'
  if (latencyMs < 300) return 'default'
  return 'rose'
}

function formatWindowTime(timestamp: string): string {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return 'N/A'
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function formatLatencyDelta(deltaMs: number): string {
  if (deltaMs === 0) return '0ms'
  const sign = deltaMs > 0 ? '+' : '-'
  return `${sign}${formatMs(Math.abs(deltaMs))}`
}

function buildReportSummary(windows: CompletedWindow[], generatedAt: string): LatencyReportSummary {
  const firstWindow = windows[0]
  const lastWindow = windows[windows.length - 1]
  const bestWindow = windows.reduce((best, current) =>
    current.meanP95 < best.meanP95 ? current : best
  )
  const worstWindow = windows.reduce((worst, current) =>
    current.meanP95 > worst.meanP95 ? current : worst
  )
  const comparisonCount = Math.max(windows.length - 1, 0)
  let improvedComparisons = 0
  let degradedComparisons = 0
  let stableComparisons = 0

  for (let index = 1; index < windows.length; index += 1) {
    const delta = getDelta(windows[index].meanP95, windows[index - 1].meanP95)
    if (delta < 0) {
      improvedComparisons += 1
    } else if (delta > 0) {
      degradedComparisons += 1
    } else {
      stableComparisons += 1
    }
  }

  const overallAverageP95 =
    windows.reduce((sum, window) => sum + window.meanP95, 0) / Math.max(windows.length, 1)
  const overallAverageP50 =
    windows.reduce((sum, window) => sum + window.meanP50, 0) / Math.max(windows.length, 1)
  const overallAverageErrorRate =
    windows.reduce((sum, window) => sum + window.avgErrorRate, 0) / Math.max(windows.length, 1)
  const overallAverageRps =
    windows.reduce((sum, window) => sum + window.totalRps, 0) / Math.max(windows.length, 1)

  const netP95Delta = getDelta(lastWindow.meanP95, firstWindow.meanP95)
  const netP95ChangePercent =
    firstWindow.meanP95 > 0 ? (Math.abs(netP95Delta) / firstWindow.meanP95) * 100 : null

  return {
    generatedAt,
    windowCount: windows.length,
    observationSeconds: windows.length * WINDOW_DURATION_S,
    overallAverageP95,
    overallAverageP50,
    overallAverageErrorRate,
    overallAverageRps,
    bestWindow,
    worstWindow,
    firstWindow,
    lastWindow,
    netP95Delta,
    netP95ChangePercent,
    improvedComparisons,
    degradedComparisons,
    stableComparisons,
    comparisonCount,
    verdict: netP95Delta < 0 ? 'improved' : netP95Delta > 0 ? 'degraded' : 'stable',
  }
}

function ArcGauge({ value, max, measuring }: { value: number; max: number; measuring: boolean }) {
  const radius = 90
  const strokeWidth = 14
  const cx = 120
  const cy = 120
  const startAngle = 225
  const endAngle = -45
  const sweep = startAngle - endAngle
  const arcColor = value > 500 ? 'var(--error)' : value > 200 ? 'var(--warning)' : 'var(--success)'

  const polarToCartesian = (angle: number) => {
    const radians = (angle * Math.PI) / 180
    return { x: cx + radius * Math.cos(radians), y: cy - radius * Math.sin(radians) }
  }

  const describeArc = (start: number, end: number) => {
    const startPoint = polarToCartesian(start)
    const endPoint = polarToCartesian(end)
    const largeArc = start - end > 180 ? 1 : 0
    return `M ${startPoint.x} ${startPoint.y} A ${radius} ${radius} 0 ${largeArc} 1 ${endPoint.x} ${endPoint.y}`
  }

  const clampedValue = Math.min(value, max)
  const fraction = max > 0 ? clampedValue / max : 0
  const valueAngle = startAngle - fraction * sweep

  return (
    <svg viewBox="0 0 240 200" className="mx-auto h-52 w-52 md:h-64 md:w-64">
      <path
        d={describeArc(startAngle, endAngle)}
        fill="none"
        stroke="var(--border)"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      {value > 0 && (
        <path
          d={describeArc(startAngle, valueAngle)}
          fill="none"
          stroke={arcColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          className="transition-all duration-500 ease-out"
        />
      )}
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
      {measuring && (
        <circle cx={cx} cy={cy + 38} r="4" fill="var(--success)">
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
  const [reportOpen, setReportOpen] = useState(false)
  const [reportGeneratedAt, setReportGeneratedAt] = useState<string | null>(null)
  const [storedWindowAtLoad] = useState<CompletedWindow | null>(() => getStoredLatencyWindow())

  const windowStartRef = useRef<number>(0)
  const windowCountRef = useRef(0)
  const snapshotsRef = useRef<Snapshot[]>([])

  const startWindow = useCallback(() => {
    windowStartRef.current = Date.now()
    snapshotsRef.current = []
    setCurrentSnapshots([])
    setSecondsRemaining(WINDOW_DURATION_S)
    setMeasuring(true)
  }, [])

  const completeWindow = useCallback(() => {
    windowCountRef.current += 1
    const result = computeWindow(snapshotsRef.current, windowCountRef.current)
    setCompletedWindows((previous) => [...previous, result])
    startWindow()
  }, [startWindow])

  useEffect(() => {
    startWindow()
  }, [startWindow])

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!measuring) return
      const elapsed = Math.floor((Date.now() - windowStartRef.current) / 1000)
      const remaining = Math.max(0, WINDOW_DURATION_S - elapsed)
      setSecondsRemaining(remaining)

      if (remaining === 0) {
        completeWindow()
      }
    }, 500)

    return () => window.clearInterval(timer)
  }, [completeWindow, measuring])

  useEffect(() => {
    if (!graphData || !measuring) return
    const snapshot = aggregateSnapshot(graphData)
    snapshotsRef.current = [...snapshotsRef.current, snapshot]
    setCurrentSnapshots([...snapshotsRef.current])
  }, [graphData, measuring])

  useEffect(() => {
    if (reportOpen && completedWindows.length < 2) {
      setReportOpen(false)
    }
  }, [completedWindows.length, reportOpen])

  const latestSnapshot =
    currentSnapshots.length > 0 ? currentSnapshots[currentSnapshots.length - 1] : null
  const currentP95 = latestSnapshot?.p95 ?? 0
  const currentP50 = latestSnapshot?.p50 ?? 0
  const currentErrorRate = latestSnapshot?.errorRate ?? 0
  const activeServices = latestSnapshot?.serviceCount ?? 0

  const gaugeMax = Math.max(1000, currentP95 * 1.5)

  const lastWindow =
    completedWindows.length > 0 ? completedWindows[completedWindows.length - 1] : null
  const prevWindow =
    completedWindows.length > 1 ? completedWindows[completedWindows.length - 2] : null
  const storedComparisonWindow = completedWindows.length === 1 ? storedWindowAtLoad : null
  const comparisonWindow = prevWindow ?? storedComparisonWindow
  const comparisonWindowLabel = prevWindow
    ? 'Previous Window'
    : storedComparisonWindow
      ? 'Stored Baseline'
      : null
  const latestDelta =
    lastWindow && comparisonWindow ? getDelta(lastWindow.meanP95, comparisonWindow.meanP95) : null
  const improved = latestDelta !== null && latestDelta < 0
  const degraded = latestDelta !== null && latestDelta > 0

  const liveHistoryChartData = completedWindows.map((window) => ({
    name: `#${window.windowNumber}`,
    p95: Number(window.meanP95.toFixed(1)),
    p50: Number(window.meanP50.toFixed(1)),
  }))

  const reportSummary =
    reportGeneratedAt && completedWindows.length >= 2
      ? buildReportSummary(completedWindows, reportGeneratedAt)
      : null

  useEffect(() => {
    if (!lastWindow) return
    cacheLatencyWindow(lastWindow)
  }, [lastWindow])

  const handleOpenReport = useCallback(() => {
    if (completedWindows.length < 2) {
      toast.error('Complete at least two windows to generate a report')
      return
    }

    setReportGeneratedAt(new Date().toISOString())
    setReportOpen(true)
  }, [completedWindows.length])

  const handleCloseReport = useCallback(() => {
    setReportOpen(false)
  }, [])

  const handleExportPdf = useCallback(() => {
    if (completedWindows.length < 2) {
      toast.error('Complete at least two windows to export the report')
      return
    }

    const generatedAt =
      reportOpen && reportGeneratedAt ? reportGeneratedAt : new Date().toISOString()
    const summaryForPdf =
      reportOpen && reportSummary
        ? reportSummary
        : buildReportSummary(completedWindows, generatedAt)

    openLatencyPdfPreview(summaryForPdf, completedWindows, storedWindowAtLoad)
  }, [completedWindows, reportGeneratedAt, reportOpen, reportSummary, storedWindowAtLoad])

  const renderReportExecutiveSummary = () => {
    if (!reportSummary) return null

    const netTrendTone =
      reportSummary.netP95Delta < 0 ? 'emerald' : reportSummary.netP95Delta > 0 ? 'rose' : 'default'
    const netTrendLabel =
      reportSummary.netP95Delta < 0
        ? `-${formatMs(Math.abs(reportSummary.netP95Delta))}`
        : reportSummary.netP95Delta > 0
          ? `+${formatMs(reportSummary.netP95Delta)}`
          : '0ms'

    return (
      <div className={cn(glassPanelClass, 'relative overflow-hidden p-6 md:p-8')}>
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-20 right-0 h-72 w-72 rounded-full bg-emerald-400/12 blur-3xl" />
          <div className="absolute -bottom-24 left-1/4 h-64 w-64 rounded-full bg-sky-400/12 blur-3xl" />
        </div>

        <div className="relative z-10 space-y-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                Executive Summary
              </p>
              <h2 className="mt-2 text-3xl font-bold text-[var(--text-primary)] md:text-4xl">
                System Latency Report
              </h2>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                Generated at {formatDate(reportSummary.generatedAt)}
              </p>
            </div>

            <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-soft)] px-4 py-3 text-sm text-[var(--text-secondary)]">
              Covering {reportSummary.windowCount} measurement windows (
              {reportSummary.observationSeconds}s total observation)
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricHighlightCard
              label="Overall Average p95"
              description="Mean p95 across all completed 30-second windows."
              icon={Clock}
              tone={getOverallLatencyTone(reportSummary.overallAverageP95)}
              value={formatMs(reportSummary.overallAverageP95)}
              note={
                <p className="mt-2 text-xs text-[var(--text-muted)]">
                  Average p50: {formatMs(reportSummary.overallAverageP50)}
                </p>
              }
            />

            <MetricHighlightCard
              label="Best Window"
              description="Window with the lowest mean p95, the strongest latency outcome in this report."
              icon={TrendingDown}
              tone="emerald"
              value={`#${reportSummary.bestWindow.windowNumber}`}
              note={
                <p className="mt-2 text-xs text-[var(--text-muted)]">
                  {formatMs(reportSummary.bestWindow.meanP95)} mean p95,{' '}
                  {formatShortDate(reportSummary.bestWindow.timestamp)}
                </p>
              }
            />

            <MetricHighlightCard
              label="Worst Window"
              description="Window with the highest mean p95, the weakest latency outcome in this report."
              icon={TrendingUp}
              tone="rose"
              value={`#${reportSummary.worstWindow.windowNumber}`}
              note={
                <p className="mt-2 text-xs text-[var(--text-muted)]">
                  {formatMs(reportSummary.worstWindow.meanP95)} mean p95,{' '}
                  {formatShortDate(reportSummary.worstWindow.timestamp)}
                </p>
              }
            />

            <MetricHighlightCard
              label="Net Trend"
              description="First window baseline versus the latest completed window."
              icon={Zap}
              tone={netTrendTone}
              value={netTrendLabel}
              note={
                <p className="mt-2 text-xs text-[var(--text-muted)]">
                  Window #{reportSummary.firstWindow.windowNumber} to #
                  {reportSummary.lastWindow.windowNumber}
                </p>
              }
            />
          </div>
        </div>
      </div>
    )
  }

  const renderLatencyTrendSection = () => {
    if (!reportSummary) return null

    const chartData: ReportChartPoint[] = completedWindows.map((window) => ({
      label: `#${window.windowNumber}`,
      windowNumber: window.windowNumber,
      timestamp: window.timestamp,
      meanP95: Number(window.meanP95.toFixed(2)),
      meanP50: Number(window.meanP50.toFixed(2)),
      avgErrorRate: Number(window.avgErrorRate.toFixed(4)),
    }))

    const ReportTrendTooltip = ({
      active,
      payload,
    }: {
      active?: boolean
      payload?: Array<{ color?: string; value?: number; payload: ReportChartPoint }>
    }) => {
      if (!active || !payload || payload.length === 0) return null

      const point = payload[0].payload
      return (
        <div className="rounded-lg border border-[var(--chart-tooltip-border)] bg-[var(--chart-tooltip-bg)] p-3 shadow-lg">
          <p className="mb-2 text-xs text-[var(--text-muted)]">
            Window #{point.windowNumber} &middot; {formatWindowTime(point.timestamp)}
          </p>
          <p className="text-sm font-medium text-[var(--text-primary)]">
            Mean P95: {formatMs(point.meanP95)}
          </p>
          <p className="text-sm font-medium text-[var(--text-primary)]">
            Mean P50: {formatMs(point.meanP50)}
          </p>
          <p className="text-sm text-[var(--text-secondary)]">
            Error rate: {formatPercent(point.avgErrorRate * 100)}
          </p>
        </div>
      )
    }

    return (
      <Section
        title="Latency Trend Over Time"
        description="Mean p95 and p50 across completed windows, with the first-window p95 held as a baseline."
        icon={TrendingUp}
      >
        <div className={cn(glassSurfaceClass, 'rounded-[var(--radius-md)] p-4 md:p-6')}>
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={chartData} margin={{ top: 12, right: 24, left: 8, bottom: 8 }}>
              <defs>
                <linearGradient id="latency-report-p95" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--accent-primary)" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="var(--accent-primary)" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="latency-report-p50" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--success)" stopOpacity={0.24} />
                  <stop offset="95%" stopColor="var(--success)" stopOpacity={0.02} />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
              <XAxis
                dataKey="label"
                stroke="var(--chart-axis)"
                tick={{ fill: 'var(--chart-axis-label)', fontSize: 12 }}
              />
              <YAxis
                stroke="var(--chart-axis)"
                tick={{ fill: 'var(--chart-axis-label)', fontSize: 12 }}
                tickFormatter={(value: number) => formatMs(value)}
              />
              <Tooltip content={<ReportTrendTooltip />} />
              <Legend wrapperStyle={{ fontSize: '12px', color: 'var(--chart-axis-label)' }} />
              <ReferenceLine
                y={reportSummary.firstWindow.meanP95}
                stroke="var(--chart-axis-label)"
                strokeDasharray="6 6"
                label={{
                  value: 'Baseline',
                  position: 'insideTopRight',
                  fill: 'var(--chart-axis-label)',
                  fontSize: 12,
                }}
              />
              <Area
                type="monotone"
                dataKey="meanP95"
                name="Mean P95"
                stroke="var(--accent-primary)"
                fill="url(#latency-report-p95)"
                strokeWidth={2.5}
                activeDot={{ r: 4 }}
              />
              <Area
                type="monotone"
                dataKey="meanP50"
                name="Mean P50"
                stroke="var(--success)"
                fill="url(#latency-report-p50)"
                strokeWidth={2.5}
                activeDot={{ r: 4 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Section>
    )
  }

  const renderWindowEvidence = () => {
    if (!reportSummary) return null

    return (
      <Section
        title="Window-by-Window Evidence"
        description="Each row is one completed 30-second measurement window with the mean p95 delta versus its predecessor."
        icon={Activity}
      >
        <div className="space-y-4">
          <div className={tableShellClass}>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className={tableHeadRowClass}>
                    <th className={tableHeaderCellClass}>#</th>
                    <th className={tableHeaderCellClass}>Time</th>
                    <th className={tableHeaderCellClass}>Avg p95</th>
                    <th className={tableHeaderCellClass}>Avg p50</th>
                    <th className={tableHeaderCellClass}>Peak p95</th>
                    <th className={tableHeaderCellClass}>Error Rate</th>
                    <th className={tableHeaderCellClass}>Traffic</th>
                    <th className={tableHeaderCellClass}>Services</th>
                    <th className={tableHeaderCellClass}>Delta from Previous</th>
                  </tr>
                </thead>
                <tbody>
                  {completedWindows.map((window, index) => {
                    const previousWindow = index > 0 ? completedWindows[index - 1] : null
                    const delta = previousWindow
                      ? getDelta(window.meanP95, previousWindow.meanP95)
                      : null
                    return (
                      <tr key={window.windowNumber} className={tableBodyRowClass}>
                        <td className={tableCellClass}>#{window.windowNumber}</td>
                        <td className={tableCellClass}>{formatWindowTime(window.timestamp)}</td>
                        <td className={tableCellClass}>{formatMs(window.meanP95)}</td>
                        <td className={tableCellClass}>{formatMs(window.meanP50)}</td>
                        <td className={tableCellClass}>{formatMs(window.peakP95)}</td>
                        <td className={tableCellClass}>
                          {formatPercent(window.avgErrorRate * 100)}
                        </td>
                        <td className={tableCellClass}>{formatRps(window.totalRps)} RPS</td>
                        <td className={tableCellClass}>{window.serviceCount}</td>
                        <td className={tableCellClass}>
                          {delta === null ? (
                            <span className="text-xs text-[var(--text-muted)]">&mdash;</span>
                          ) : (
                            <span
                              className={cn(
                                'text-sm font-semibold',
                                delta < 0
                                  ? 'text-emerald-400'
                                  : delta > 0
                                    ? 'text-rose-400'
                                    : 'text-[var(--text-muted)]'
                              )}
                            >
                              {formatLatencyDelta(delta)}
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-sm text-[var(--text-secondary)]">
            {reportSummary.improvedComparisons} of {reportSummary.comparisonCount} windows showed
            improvement vs their predecessor.
          </p>
        </div>
      </Section>
    )
  }

  const renderImprovementVerdict = () => {
    if (!reportSummary) return null

    const p50Delta = getDelta(reportSummary.lastWindow.meanP50, reportSummary.firstWindow.meanP50)
    const errorDelta = getDelta(
      reportSummary.lastWindow.avgErrorRate,
      reportSummary.firstWindow.avgErrorRate,
      4
    )
    const trafficDelta = getDelta(
      reportSummary.lastWindow.totalRps,
      reportSummary.firstWindow.totalRps
    )

    const deltaToneClass = {
      positive: 'border-emerald-500/45 bg-emerald-500/12 text-[var(--text-primary)]',
      negative: 'border-rose-500/45 bg-rose-500/12 text-[var(--text-primary)]',
      neutral: 'border-amber-500/35 bg-amber-500/12 text-[var(--text-primary)]',
      increase: 'border-blue-500/35 bg-blue-500/12 text-[var(--text-primary)]',
      decrease: 'border-amber-500/35 bg-amber-500/12 text-[var(--text-primary)]',
    } as const

    const renderMetricComparisonRow = ({
      key,
      label,
      firstValue,
      lastValue,
      firstVariant,
      lastVariant,
      formatValue,
      deltaText,
      deltaClassKey,
      DeltaIcon,
      firstTooltip,
      lastTooltip,
    }: {
      key: string
      label: string
      firstValue: number
      lastValue: number
      firstVariant: KpiVariant
      lastVariant: KpiVariant
      formatValue: (value: number) => string
      deltaText: string
      deltaClassKey: keyof typeof deltaToneClass
      DeltaIcon: typeof ArrowDown
      firstTooltip: string
      lastTooltip: string
    }) => (
      <div
        key={key}
        className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-stretch"
      >
        <KPIStatCard
          label={`First Window ${label}`}
          value={formatValue(firstValue)}
          variant={firstVariant}
          tooltip={firstTooltip}
        />
        <div
          className={cn(
            glassSurfaceClass,
            'flex items-center justify-center rounded-[var(--radius-md)] border px-4 py-4 text-sm font-semibold',
            deltaToneClass[deltaClassKey]
          )}
        >
          <div className="flex items-center gap-2">
            <DeltaIcon className="h-4 w-4" />
            <span>{deltaText}</span>
          </div>
        </div>
        <KPIStatCard
          label={`Last Window ${label}`}
          value={formatValue(lastValue)}
          variant={lastVariant}
          tooltip={lastTooltip}
        />
      </div>
    )

    const verdictBanner =
      reportSummary.verdict === 'improved'
        ? {
            icon: CheckCircle,
            title: 'Latency Improved',
            className: 'border-emerald-500/55 bg-emerald-500/10',
            iconClassName: 'text-emerald-700',
            message:
              reportSummary.netP95ChangePercent !== null
                ? `Mean p95 improved by ${formatPercent(reportSummary.netP95ChangePercent)} from the first window to the latest window.`
                : `Mean p95 improved by ${formatMs(Math.abs(reportSummary.netP95Delta))} from the first window to the latest window.`,
          }
        : reportSummary.verdict === 'degraded'
          ? {
              icon: AlertTriangle,
              title: 'Latency Degraded',
              className: 'border-rose-500/55 bg-rose-500/10',
              iconClassName: 'text-rose-700',
              message:
                reportSummary.netP95ChangePercent !== null
                  ? `Mean p95 degraded by ${formatPercent(reportSummary.netP95ChangePercent)} from the first window to the latest window.`
                  : `Mean p95 degraded by ${formatMs(Math.abs(reportSummary.netP95Delta))} from the first window to the latest window.`,
            }
          : {
              icon: Minus,
              title: 'Latency Unchanged',
              className: 'border-amber-500/55 bg-amber-500/10',
              iconClassName: 'text-amber-700',
              message: 'The latest window closed at the same mean p95 as the first window.',
            }

    const VerdictIcon = verdictBanner.icon

    return (
      <Section
        title="Improvement Verdict"
        description="Side-by-side evidence for the first and latest windows, followed by the overall latency verdict."
        icon={CheckCircle}
      >
        <div className="space-y-4">
          {renderMetricComparisonRow({
            key: 'p95',
            label: 'P95',
            firstValue: reportSummary.firstWindow.meanP95,
            lastValue: reportSummary.lastWindow.meanP95,
            firstVariant: getLatencyVariant(reportSummary.firstWindow.meanP95),
            lastVariant: getLatencyVariant(reportSummary.lastWindow.meanP95),
            formatValue: formatMs,
            deltaText:
              reportSummary.netP95Delta < 0
                ? `improved by ${formatMs(Math.abs(reportSummary.netP95Delta))}`
                : reportSummary.netP95Delta > 0
                  ? `degraded by ${formatMs(reportSummary.netP95Delta)}`
                  : 'unchanged',
            deltaClassKey:
              reportSummary.netP95Delta < 0
                ? 'positive'
                : reportSummary.netP95Delta > 0
                  ? 'negative'
                  : 'neutral',
            DeltaIcon:
              reportSummary.netP95Delta < 0
                ? ArrowDown
                : reportSummary.netP95Delta > 0
                  ? ArrowUp
                  : Minus,
            firstTooltip: 'Mean p95 from the first completed 30-second window.',
            lastTooltip: 'Mean p95 from the latest completed 30-second window.',
          })}

          {renderMetricComparisonRow({
            key: 'p50',
            label: 'P50',
            firstValue: reportSummary.firstWindow.meanP50,
            lastValue: reportSummary.lastWindow.meanP50,
            firstVariant: getLatencyVariant(reportSummary.firstWindow.meanP50),
            lastVariant: getLatencyVariant(reportSummary.lastWindow.meanP50),
            formatValue: formatMs,
            deltaText:
              p50Delta < 0
                ? `improved by ${formatMs(Math.abs(p50Delta))}`
                : p50Delta > 0
                  ? `degraded by ${formatMs(p50Delta)}`
                  : 'unchanged',
            deltaClassKey: p50Delta < 0 ? 'positive' : p50Delta > 0 ? 'negative' : 'neutral',
            DeltaIcon: p50Delta < 0 ? ArrowDown : p50Delta > 0 ? ArrowUp : Minus,
            firstTooltip: 'Mean p50 from the first completed 30-second window.',
            lastTooltip: 'Mean p50 from the latest completed 30-second window.',
          })}

          {renderMetricComparisonRow({
            key: 'error-rate',
            label: 'Error Rate',
            firstValue: reportSummary.firstWindow.avgErrorRate,
            lastValue: reportSummary.lastWindow.avgErrorRate,
            firstVariant: getErrorVariant(reportSummary.firstWindow.avgErrorRate),
            lastVariant: getErrorVariant(reportSummary.lastWindow.avgErrorRate),
            formatValue: (value) => formatPercent(value * 100),
            deltaText:
              errorDelta < 0
                ? `improved by ${formatPercent(Math.abs(errorDelta) * 100)}`
                : errorDelta > 0
                  ? `degraded by ${formatPercent(errorDelta * 100)}`
                  : 'unchanged',
            deltaClassKey: errorDelta < 0 ? 'positive' : errorDelta > 0 ? 'negative' : 'neutral',
            DeltaIcon: errorDelta < 0 ? ArrowDown : errorDelta > 0 ? ArrowUp : Minus,
            firstTooltip: 'Average service error rate in the first completed window.',
            lastTooltip: 'Average service error rate in the latest completed window.',
          })}

          {renderMetricComparisonRow({
            key: 'traffic',
            label: 'Traffic',
            firstValue: reportSummary.firstWindow.totalRps,
            lastValue: reportSummary.lastWindow.totalRps,
            firstVariant: 'default',
            lastVariant: 'default',
            formatValue: (value) => `${formatRps(value)} RPS`,
            deltaText:
              trafficDelta < 0
                ? `decreased by ${formatRps(Math.abs(trafficDelta))} RPS`
                : trafficDelta > 0
                  ? `increased by ${formatRps(trafficDelta)} RPS`
                  : 'unchanged',
            deltaClassKey:
              trafficDelta < 0 ? 'decrease' : trafficDelta > 0 ? 'increase' : 'neutral',
            DeltaIcon: trafficDelta < 0 ? ArrowDown : trafficDelta > 0 ? ArrowUp : Minus,
            firstTooltip:
              'Average total edge traffic captured across snapshots in the first window.',
            lastTooltip:
              'Average total edge traffic captured across snapshots in the latest window.',
          })}

          <div
            className={cn(
              glassSurfaceClass,
              'flex flex-col gap-4 rounded-[var(--radius-md)] border-2 p-6 md:flex-row md:items-center md:justify-between',
              verdictBanner.className
            )}
          >
            <div className="flex items-start gap-3">
              <VerdictIcon className={cn('mt-0.5 h-6 w-6 shrink-0', verdictBanner.iconClassName)} />
              <div>
                <h3 className="text-lg font-semibold text-[var(--text-primary)]">
                  {verdictBanner.title}
                </h3>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">{verdictBanner.message}</p>
              </div>
            </div>

            <div className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-soft)] px-4 py-3 text-sm text-[var(--text-secondary)]">
              Baseline: window #{reportSummary.firstWindow.windowNumber} &middot; Latest: window #
              {reportSummary.lastWindow.windowNumber}
            </div>
          </div>
        </div>
      </Section>
    )
  }

  const renderStoredBaselineSection = () => {
    if (!reportSummary) return null

    const latestReportWindow = reportSummary.lastWindow

    if (!storedWindowAtLoad) {
      return (
        <Section
          title="Stored Baseline Memory"
          description="A persisted 30-second baseline becomes available only after a completed window has been cached from a prior visit."
          icon={Clock}
        >
          <div
            className={cn(
              glassSurfaceClass,
              'rounded-[var(--radius-md)] p-5 text-sm text-[var(--text-secondary)]'
            )}
          >
            No stored 30-second baseline existed when this page loaded. The latest completed window
            from this session is now cached and will be compared on the next visit.
          </div>
        </Section>
      )
    }

    const storedDelta = getDelta(latestReportWindow.meanP95, storedWindowAtLoad.meanP95)
    const storedImproved = storedDelta < 0
    const storedDegraded = storedDelta > 0

    return (
      <Section
        title="Stored Baseline Memory"
        description="Compares the latest new 30-second window with the baseline window loaded from local storage when this page opened."
        icon={Clock}
      >
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <MetricHighlightCard
              label="Stored 30s Window"
              description={`Loaded from local storage at ${formatDate(storedWindowAtLoad.timestamp)}.`}
              icon={Clock}
              tone="default"
              value={formatMs(storedWindowAtLoad.meanP95)}
              note={
                <p className="mt-2 text-xs text-[var(--text-muted)]">
                  Window #{storedWindowAtLoad.windowNumber} &middot; Error{' '}
                  {formatPercent(storedWindowAtLoad.avgErrorRate * 100)}
                </p>
              }
            />

            <div
              className={cn(
                glassSurfaceClass,
                'flex flex-col items-center justify-center rounded-[var(--radius-md)] p-6 text-center',
                storedImproved
                  ? 'border-emerald-500/45 bg-emerald-500/12'
                  : storedDegraded
                    ? 'border-rose-500/45 bg-rose-500/12'
                    : 'border-amber-500/35 bg-amber-500/12'
              )}
            >
              <div
                className={cn(
                  'mb-2 flex items-center gap-2 text-lg font-bold',
                  storedImproved
                    ? 'text-emerald-400'
                    : storedDegraded
                      ? 'text-rose-400'
                      : 'text-[var(--text-muted)]'
                )}
              >
                {storedImproved ? (
                  <ArrowDown className="h-5 w-5" />
                ) : storedDegraded ? (
                  <ArrowUp className="h-5 w-5" />
                ) : (
                  <Minus className="h-5 w-5" />
                )}
                {formatLatencyDelta(storedDelta)}
              </div>
              <p className="text-sm font-medium text-[var(--text-primary)]">
                {storedImproved
                  ? 'Improved vs stored baseline'
                  : storedDegraded
                    ? 'Degraded vs stored baseline'
                    : 'Matched stored baseline'}
              </p>
              <p className="mt-2 text-xs text-[var(--text-secondary)]">
                Comparison only becomes available after a new window is created in this session.
              </p>
            </div>

            <MetricHighlightCard
              label="Latest New Window"
              description={`Window #${latestReportWindow.windowNumber} completed during this session.`}
              icon={Gauge}
              tone={storedImproved ? 'emerald' : storedDegraded ? 'rose' : 'default'}
              value={formatMs(latestReportWindow.meanP95)}
              note={
                <p className="mt-2 text-xs text-[var(--text-muted)]">
                  {formatWindowTime(latestReportWindow.timestamp)} &middot; Traffic{' '}
                  {formatRps(latestReportWindow.totalRps)} RPS
                </p>
              }
            />
          </div>

          <div
            className={cn(
              glassSurfaceClass,
              'rounded-[var(--radius-md)] p-4 text-sm text-[var(--text-secondary)]'
            )}
          >
            The stored baseline is captured once when the page loads. That avoids comparing on the
            initial load, while still letting the next completed 30-second window prove whether
            latency improved or degraded against the last persisted observation.
          </div>
        </div>
      </Section>
    )
  }

  const renderReportView = () => {
    if (!reportSummary) {
      return (
        <EmptyState
          icon={<FileText className="h-12 w-12 text-[var(--color-emerald-300)]" />}
          message="Need at least two completed windows to render a report"
          description="Keep the live measurement running until two 30-second windows have completed, then generate the report again."
          action={
            <button
              type="button"
              onClick={handleCloseReport}
              className={cn(secondaryButtonClass, 'inline-flex items-center gap-2')}
            >
              <Activity className="h-4 w-4" />
              Back to Live
            </button>
          }
        />
      )
    }

    return (
      <div className="space-y-6 animate-in fade-in duration-300">
        {renderReportExecutiveSummary()}
        {renderLatencyTrendSection()}
        {renderWindowEvidence()}
        {renderImprovementVerdict()}
        {renderStoredBaselineSection()}
      </div>
    )
  }

  const renderLiveView = () => (
    <div className="space-y-6 animate-in fade-in duration-300">
      <Section title="Live Measurement" icon={Activity}>
        <div className="flex flex-col items-center gap-6">
          <ArcGauge value={currentP95} max={gaugeMax} measuring={measuring} />

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

          <div className="grid w-full grid-cols-2 gap-4 md:grid-cols-4">
            <KPIStatCard
              label="Current P95"
              value={formatMs(currentP95)}
              variant={getLatencyVariant(currentP95)}
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
              variant={getErrorVariant(currentErrorRate)}
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

      {completedWindows.length > 0 && (
        <>
          <Section title="Window Comparison" icon={TrendingUp}>
            <div className="grid gap-4 md:grid-cols-3">
              {comparisonWindow ? (
                <MetricHighlightCard
                  label={comparisonWindowLabel ?? 'Comparison Window'}
                  description={
                    comparisonWindowLabel === 'Stored Baseline'
                      ? `Loaded from local storage - ${formatWindowTime(comparisonWindow.timestamp)}`
                      : `Window #${comparisonWindow.windowNumber} - ${formatWindowTime(comparisonWindow.timestamp)}`
                  }
                  icon={Clock}
                  tone="default"
                  value={formatMs(comparisonWindow.meanP95)}
                  note={
                    <p className="mt-1 text-xs text-[var(--text-muted)]">
                      P50: {formatMs(comparisonWindow.meanP50)} &middot; Error:{' '}
                      {formatPercent(comparisonWindow.avgErrorRate * 100)}
                    </p>
                  }
                  tooltip={
                    comparisonWindowLabel === 'Stored Baseline'
                      ? 'Persisted 30-second window loaded from local storage before this session began'
                      : 'Aggregate metrics from the previous 30-second window'
                  }
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

              <div
                className={cn(
                  glassSurfaceClass,
                  'flex flex-col items-center justify-center rounded-[var(--radius-md)] p-6'
                )}
              >
                {latestDelta !== null ? (
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
                      {formatMs(Math.abs(latestDelta))}
                    </div>
                    <p className="text-sm font-medium text-[var(--text-secondary)]">
                      {improved ? 'Improved' : degraded ? 'Degraded' : 'No change'}
                    </p>
                    {comparisonWindowLabel && (
                      <p className="mt-1 text-xs text-[var(--text-muted)]">
                        Compared to {comparisonWindowLabel.toLowerCase()}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-[var(--text-muted)]">
                    Waiting for second window&hellip;
                  </p>
                )}
              </div>

              <MetricHighlightCard
                label="Latest Window"
                description={`Window #${lastWindow!.windowNumber} - ${formatWindowTime(lastWindow!.timestamp)}`}
                icon={Gauge}
                tone={improved ? 'emerald' : degraded ? 'rose' : 'default'}
                value={formatMs(lastWindow!.meanP95)}
                note={
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    P50: {formatMs(lastWindow!.meanP50)} &middot; Error:{' '}
                    {formatPercent(lastWindow!.avgErrorRate * 100)}
                  </p>
                }
                tooltip="Aggregate metrics from the most recently completed 30-second window"
              />
            </div>
          </Section>

          <Section title="Latency History" icon={Clock}>
            {liveHistoryChartData.length >= 2 && (
              <div className="mb-6">
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={liveHistoryChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                    <XAxis
                      dataKey="name"
                      tick={{ fill: 'var(--chart-axis-label)', fontSize: 11 }}
                      stroke="var(--chart-axis)"
                    />
                    <YAxis
                      tick={{ fill: 'var(--chart-axis-label)', fontSize: 11 }}
                      stroke="var(--chart-axis)"
                      tickFormatter={(value: number) => formatMs(value)}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--chart-tooltip-bg)',
                        border: '1px solid var(--chart-tooltip-border)',
                        borderRadius: '8px',
                        color: 'var(--text-primary)',
                        fontSize: 12,
                      }}
                      formatter={(value: number, name: string) => [formatMs(value), name]}
                    />
                    <Line
                      type="monotone"
                      dataKey="p95"
                      stroke="var(--accent-primary)"
                      strokeWidth={2}
                      dot={{ fill: 'var(--accent-primary)', r: 4 }}
                      name="Mean P95"
                    />
                    <Line
                      type="monotone"
                      dataKey="p50"
                      stroke="var(--success)"
                      strokeWidth={2}
                      dot={{ fill: 'var(--success)', r: 4 }}
                      name="Mean P50"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

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
                    {completedWindows.map((window, index) => {
                      const previousWindow = index > 0 ? completedWindows[index - 1] : null
                      const delta = previousWindow
                        ? getDelta(window.meanP95, previousWindow.meanP95)
                        : null
                      return (
                        <tr key={window.windowNumber} className={tableBodyRowClass}>
                          <td className={tableCellClass}>#{window.windowNumber}</td>
                          <td className={tableCellClass}>{formatWindowTime(window.timestamp)}</td>
                          <td className={tableCellClass}>{formatMs(window.meanP95)}</td>
                          <td className={tableCellClass}>{formatMs(window.meanP50)}</td>
                          <td className={tableCellClass}>{formatMs(window.peakP95)}</td>
                          <td className={tableCellClass}>
                            {formatPercent(window.avgErrorRate * 100)}
                          </td>
                          <td className={tableCellClass}>
                            {delta !== null ? (
                              <span
                                className={cn(
                                  'inline-flex items-center gap-1 text-xs font-semibold',
                                  delta < 0
                                    ? 'text-emerald-400'
                                    : delta > 0
                                      ? 'text-rose-400'
                                      : 'text-[var(--text-muted)]'
                                )}
                              >
                                {delta < 0 ? (
                                  <TrendingDown className="h-3 w-3" />
                                ) : delta > 0 ? (
                                  <TrendingUp className="h-3 w-3" />
                                ) : null}
                                {formatLatencyDelta(delta)}
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
        description={
          reportOpen
            ? 'High-level evidence report built from completed 30-second measurement windows'
            : 'Continuous 30-second measurement windows - like a speed test for your microservices'
        }
        icon={Gauge}
        actions={
          completedWindows.length >= 2 ? (
            <>
              {!reportOpen && (
                <button
                  type="button"
                  onClick={handleOpenReport}
                  className={cn(secondaryButtonClass, 'inline-flex items-center gap-2')}
                >
                  <FileText className="h-4 w-4" />
                  Generate Report
                </button>
              )}
              <button
                type="button"
                onClick={handleExportPdf}
                className={cn(secondaryButtonClass, 'inline-flex items-center gap-2')}
              >
                <Download className="h-4 w-4" />
                Export Report
              </button>
              {reportOpen && (
                <button
                  type="button"
                  onClick={handleCloseReport}
                  className={cn(secondaryButtonClass, 'inline-flex items-center gap-2')}
                >
                  <Activity className="h-4 w-4" />
                  Back to Live
                </button>
              )}
            </>
          ) : undefined
        }
      />

      {reportOpen ? renderReportView() : renderLiveView()}
    </div>
  )
}
