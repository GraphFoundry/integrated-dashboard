import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  Activity,
  ArrowDown,
  ArrowUp,
  CheckCircle,
  Clock,
  Download,
  Gauge,
  TrendingDown,
  TrendingUp,
  Zap,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useGraphStream } from '@/lib/useGraphStream'
import { formatDate, formatMs, formatPercent, formatRps } from '@/lib/format'
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

function openLatencyPdfPreview(summary: LatencyReportSummary, windows: CompletedWindow[]) {
  const popup = window.open('', '_blank', 'width=1240,height=900')
  if (!popup) {
    toast.error('Pop-up blocked. Allow pop-ups to export the PDF report.')
    return
  }

  const first = summary.firstWindow
  const last = summary.lastWindow

  // Chart dimensions
  const CW = 840
  const CH = 200
  const CPAD = 40
  const xStep = windows.length > 1 ? (CW - CPAD * 2) / (windows.length - 1) : 0
  const xLabelMod = windows.length > 8 ? Math.ceil(windows.length / 8) : 1

  const xLabels = windows
    .map((w, i) => {
      if (i % xLabelMod !== 0 && i !== windows.length - 1) return ''
      const x = CPAD + xStep * i
      return `<text x="${x.toFixed(1)}" y="${CH - 8}" text-anchor="middle" font-size="10" fill="#9ca3af">#${escapeHtml(w.windowNumber)}</text>`
    })
    .join('')

  function svgGrid(maxVal: number, fmt: (v: number) => string): string {
    return Array.from({ length: 4 }, (_, i) => {
      const val = maxVal * (1 - i / 3)
      const y = CH - CPAD - (val / maxVal) * (CH - CPAD * 2)
      return `<line x1="${CPAD}" y1="${y.toFixed(1)}" x2="${CW - CPAD}" y2="${y.toFixed(1)}" stroke="#e5e7eb" stroke-dasharray="3 3"/><text x="2" y="${(y + 4).toFixed(1)}" font-size="10" fill="#9ca3af">${escapeHtml(fmt(val))}</text>`
    }).join('')
  }

  function svgDots(values: number[], maxVal: number, color: string): string {
    return windows
      .map((_, i) => {
        const x = CPAD + xStep * i
        const y = CH - CPAD - (values[i] / maxVal) * (CH - CPAD * 2)
        return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" fill="${color}"/>`
      })
      .join('')
  }

  function buildHalfChart(value: number, maxVal: number, color: string, fillColor: string, fmt: (v: number) => string, label: string, sublabel: string, windowNum: number): string {
    const MCW = 480, MCH = 170, LEFT = 56, RIGHT = 16, TOP = 38, BOTTOM = 28
    const plotW = MCW - LEFT - RIGHT
    const plotH = MCH - TOP - BOTTOM
    const barH = maxVal > 0 ? (value / maxVal) * plotH : 0
    const barY = TOP + plotH - barH
    // Y-axis: 5 ticks
    const yTicks = [0, 0.25, 0.5, 0.75, 1.0]
    const gridLines = yTicks
      .map((ratio) => {
        const y = TOP + plotH - ratio * plotH
        const val = maxVal * ratio
        return `<line x1="${LEFT}" y1="${y.toFixed(1)}" x2="${MCW - RIGHT}" y2="${y.toFixed(1)}" stroke="#f0f0f0" stroke-width="0.5"/><text x="${LEFT - 8}" y="${(y + 3).toFixed(1)}" text-anchor="end" font-size="9" fill="#b0b0b0">${escapeHtml(fmt(val))}</text>`
      })
      .join('')
    const valY = TOP + plotH - barH
    // X-axis: window number label
    const xCenter = LEFT + plotW / 2
    return `<svg viewBox="0 0 ${MCW} ${MCH}" width="100%" height="170" role="img">
      <text x="${LEFT}" y="16" font-size="12" font-weight="700" fill="#4b5563">${escapeHtml(label)}</text>
      <text x="${LEFT}" y="30" font-size="10" fill="#9ca3af">${escapeHtml(sublabel)}</text>
      <rect x="${LEFT}" y="${TOP}" width="${plotW}" height="${plotH}" fill="#fbfbfd" rx="0"/>
      ${gridLines}
      <rect x="${LEFT}" y="${barY.toFixed(1)}" width="${plotW}" height="${barH.toFixed(1)}" fill="${fillColor}" opacity="0.7" rx="0"/>
      <line x1="${LEFT}" y1="${valY.toFixed(1)}" x2="${MCW - RIGHT}" y2="${valY.toFixed(1)}" stroke="${color}" stroke-width="1.5"/>
      <line x1="${LEFT}" y1="${TOP + plotH}" x2="${MCW - RIGHT}" y2="${TOP + plotH}" stroke="#e0e0e0" stroke-width="0.5"/>
      <text x="${xCenter.toFixed(1)}" y="${MCH - 6}" text-anchor="middle" font-size="10" fill="#b0b0b0">Window #${escapeHtml(windowNum)}</text>
    </svg>`
  }

  // Pre-compute chart data
  const rpsVals = windows.map((w) => w.totalRps)
  const rpsMax = Math.max(...rpsVals, 1)
  const rpsLine = buildSvgPoints(rpsVals, CW, CH, CPAD, rpsMax)
  const rpsArea = buildAreaPoints(rpsVals, CW, CH, CPAD, rpsMax)

  const p95Vals = windows.map((w) => w.meanP95)
  const p95Max = Math.max(...p95Vals, 1)
  const p95Line = buildSvgPoints(p95Vals, CW, CH, CPAD, p95Max)
  const p95Area = buildAreaPoints(p95Vals, CW, CH, CPAD, p95Max)
  const baselineY = CH - CPAD - (first.meanP95 / p95Max) * (CH - CPAD * 2)

  const errVals = windows.map((w) => w.avgErrorRate)
  const errMax = Math.max(...errVals, 0.001)
  const errLine = buildSvgPoints(errVals, CW, CH, CPAD, errMax)

  const p50Vals = windows.map((w) => w.meanP50)
  const p50Max = Math.max(...p50Vals, 1)

  // Deltas
  const p95Delta = getDelta(last.meanP95, first.meanP95)
  const p50Delta = getDelta(last.meanP50, first.meanP50)
  const errDelta = getDelta(last.avgErrorRate, first.avgErrorRate, 4)

  const dClass = (d: number) => (d < 0 ? 'improved' : d > 0 ? 'degraded' : 'neutral')
  const dFmt = (d: number, fmt: (v: number) => string) =>
    d === 0 ? '&mdash;' : `${d < 0 ? '&#9660;' : '&#9650;'} ${escapeHtml(fmt(Math.abs(d)))}`

  // Evidence table rows
  const evidenceRows = windows
    .map((w, i) => {
      const prev = i > 0 ? windows[i - 1] : null
      const d = prev ? getDelta(w.meanP95, prev.meanP95) : null
      const dStyle =
        d === null
          ? ''
          : d < 0
            ? 'color:#16a34a;font-weight:700'
            : d > 0
              ? 'color:#dc2626;font-weight:700'
              : 'color:#6b7280'
      return `<tr>
        <td>#${escapeHtml(w.windowNumber)}</td>
        <td>${escapeHtml(formatWindowTime(w.timestamp))}</td>
        <td>${escapeHtml(formatMs(w.meanP95))}</td>
        <td>${escapeHtml(formatMs(w.meanP50))}</td>
        <td>${escapeHtml(formatMs(w.peakP95))}</td>
        <td>${escapeHtml(formatPercent(w.avgErrorRate * 100))}</td>
        <td>${escapeHtml(formatRps(w.totalRps))} RPS</td>
        <td style="${dStyle}">${d === null ? '&mdash;' : escapeHtml(formatLatencyDelta(d))}</td>
      </tr>`
    })
    .join('')

  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"/><title>Latency Report</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,'Inter','Segoe UI',sans-serif;background:#fff;color:#111827;line-height:1.5;font-size:14px}
.page{max-width:1100px;margin:0 auto;padding:28px 24px 64px}
.toolbar{display:flex;gap:10px;padding:10px 0 14px;margin-bottom:20px;border-bottom:1px solid #e5e7eb}
button{border:1px solid #d1d5db;border-radius:6px;padding:7px 14px;font-size:13px;font-weight:600;cursor:pointer;background:#f9fafb;color:#374151}
button.primary{background:#2563eb;color:#fff;border-color:#2563eb}
h1{font-size:24px;font-weight:700;color:#111827}
.meta{margin-top:4px;font-size:13px;color:#6b7280}
.badge{display:inline-flex;align-items:center;gap:4px;border:1px solid #e5e7eb;border-radius:999px;padding:4px 12px;font-size:12px;font-weight:600;color:#374151;background:#f9fafb;margin-top:10px}
.header{margin-bottom:24px;padding-bottom:20px;border-bottom:1px solid #e5e7eb}
.eye{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#9ca3af;margin-bottom:6px}
.section{margin-bottom:28px}
.cmp-grid{display:flex;flex-direction:column;gap:20px}
.cmp-row{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.cmp-row-label{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#6b7280;margin-bottom:6px}
.cmp-panel{border:1px solid #e8eaed;border-radius:8px;padding:16px 18px;background:#fff}
.cmp-val-row{display:flex;align-items:baseline;gap:4px;margin-top:10px;padding-top:10px;border-top:1px solid #f3f4f6}
.cmp-val-label{font-size:13px;color:#6b7280;font-weight:500}
.cmp-val-num{font-size:13px;font-weight:700;color:#111827}
.cmp-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#6b7280;margin-bottom:4px}
.cmp-footer{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:6px;margin-top:12px;padding-top:12px;border-top:1px solid #f3f4f6}
.cmp-label{font-size:10px;color:#9ca3af;font-weight:600;margin-bottom:2px}
.cmp-val{font-size:15px;font-weight:700;color:#111827}
.cmp-sub{font-size:10px;color:#9ca3af}
.cmp-delta{font-size:13px;font-weight:700;text-align:center}
.cmp-delta.improved{color:#16a34a}.cmp-delta.degraded{color:#dc2626}.cmp-delta.neutral{color:#6b7280}
.cbox{border:1px solid #e5e7eb;border-radius:10px;padding:16px;background:#fff}
.ct{font-size:12px;font-weight:600;color:#374151;margin-bottom:10px}
.three{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.panel{border:1px solid #e5e7eb;border-radius:10px;padding:16px}
.pv{font-size:26px;font-weight:800;line-height:1;color:#111827;margin:8px 0 4px}
.ps{font-size:12px;color:#6b7280;margin-top:3px}
.panel.improved{border-color:#86efac;background:#f0fdf4}
.panel.degraded{border-color:#fca5a5;background:#fef2f2}
.ev{border:1px solid #e5e7eb;border-radius:10px;overflow:hidden}
table{width:100%;border-collapse:collapse}
th{padding:9px 13px;background:#f9fafb;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;text-align:left;border-bottom:1px solid #e5e7eb}
td{padding:10px 13px;font-size:13px;color:#374151;border-bottom:1px solid #f3f4f6}
tr:last-child td{border-bottom:none}
.footer{margin-top:28px;padding-top:14px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af}
@media print{.toolbar{display:none}}
</style>
</head>
<body>
<div class="page">

<div class="toolbar">
  <button class="primary" onclick="window.print()">Print / Save as PDF</button>
  <button onclick="window.close()">Close</button>
</div>

<div class="header">
  <div class="eye">Latency Report</div>
  <h1>System Latency Evidence</h1>
  <div class="meta">Generated ${escapeHtml(formatDate(summary.generatedAt))}</div>
  <div class="badge">${escapeHtml(summary.windowCount)} windows &middot; ${escapeHtml(summary.observationSeconds)}s observation &middot; 30s window span</div>
</div>

<div class="section">
  <div class="eye">Before vs After</div>
  <div class="cmp-grid">
    <div class="cmp-row-label">P95 Latency</div>
    <div class="cmp-row">
      <div class="cmp-panel">
        ${buildHalfChart(first.meanP95, p95Max, '#7ab4f5', '#e8f2fe', formatMs, 'Before', `Window #${escapeHtml(first.windowNumber)} \u00b7 ${escapeHtml(formatWindowTime(first.timestamp))}`, first.windowNumber)}
        <div class="cmp-val-row"><span class="cmp-val-label">Average P95 =&nbsp;</span><span class="cmp-val-num">${escapeHtml(formatMs(first.meanP95))}</span></div>
      </div>
      <div class="cmp-panel">
        ${buildHalfChart(last.meanP95, p95Max, '#7ab4f5', '#e8f2fe', formatMs, 'After', `Window #${escapeHtml(last.windowNumber)} \u00b7 ${escapeHtml(formatWindowTime(last.timestamp))}`, last.windowNumber)}
        <div class="cmp-val-row"><span class="cmp-val-label">Average P95 =&nbsp;</span><span class="cmp-val-num" style="color:${p95Delta < 0 ? '#16a34a' : p95Delta > 0 ? '#dc2626' : '#111827'}">${escapeHtml(formatMs(last.meanP95))}</span></div>
      </div>
    </div>
    <div style="text-align:center;margin-top:-8px;margin-bottom:8px"><span class="cmp-delta ${dClass(p95Delta)}" style="font-size:14px">${dFmt(p95Delta, formatMs)}</span></div>

    <div class="cmp-row-label">P50 Latency</div>
    <div class="cmp-row">
      <div class="cmp-panel">
        ${buildHalfChart(first.meanP50, p50Max, '#6dcf9e', '#e6f9ef', formatMs, 'Before', `Window #${escapeHtml(first.windowNumber)} \u00b7 ${escapeHtml(formatWindowTime(first.timestamp))}`, first.windowNumber)}
        <div class="cmp-val-row"><span class="cmp-val-label">Average P50 =&nbsp;</span><span class="cmp-val-num">${escapeHtml(formatMs(first.meanP50))}</span></div>
      </div>
      <div class="cmp-panel">
        ${buildHalfChart(last.meanP50, p50Max, '#6dcf9e', '#e6f9ef', formatMs, 'After', `Window #${escapeHtml(last.windowNumber)} \u00b7 ${escapeHtml(formatWindowTime(last.timestamp))}`, last.windowNumber)}
        <div class="cmp-val-row"><span class="cmp-val-label">Average P50 =&nbsp;</span><span class="cmp-val-num" style="color:${p50Delta < 0 ? '#16a34a' : p50Delta > 0 ? '#dc2626' : '#111827'}">${escapeHtml(formatMs(last.meanP50))}</span></div>
      </div>
    </div>
    <div style="text-align:center;margin-top:-8px;margin-bottom:8px"><span class="cmp-delta ${dClass(p50Delta)}" style="font-size:14px">${dFmt(p50Delta, formatMs)}</span></div>

    <div class="cmp-row-label">Error Rate</div>
    <div class="cmp-row">
      <div class="cmp-panel">
        ${buildHalfChart(first.avgErrorRate, errMax, '#f09898', '#fde8e8', (v) => formatPercent(v * 100), 'Before', `Window #${escapeHtml(first.windowNumber)} \u00b7 ${escapeHtml(formatWindowTime(first.timestamp))}`, first.windowNumber)}
        <div class="cmp-val-row"><span class="cmp-val-label">Average Error Rate =&nbsp;</span><span class="cmp-val-num">${escapeHtml(formatPercent(first.avgErrorRate * 100))}</span></div>
      </div>
      <div class="cmp-panel">
        ${buildHalfChart(last.avgErrorRate, errMax, '#f09898', '#fde8e8', (v) => formatPercent(v * 100), 'After', `Window #${escapeHtml(last.windowNumber)} \u00b7 ${escapeHtml(formatWindowTime(last.timestamp))}`, last.windowNumber)}
        <div class="cmp-val-row"><span class="cmp-val-label">Average Error Rate =&nbsp;</span><span class="cmp-val-num" style="color:${errDelta < 0 ? '#16a34a' : errDelta > 0 ? '#dc2626' : '#111827'}">${escapeHtml(formatPercent(last.avgErrorRate * 100))}</span></div>
      </div>
    </div>
    <div style="text-align:center;margin-top:-8px;margin-bottom:8px"><span class="cmp-delta ${dClass(errDelta)}" style="font-size:14px">${dFmt(errDelta, (v) => formatPercent(v * 100))}</span></div>
  </div>
</div>

<div class="section">
  <div class="eye">Graph 1 &mdash; Load (RPS)</div>
  <div class="cbox">
    <div class="ct">Traffic load across ${escapeHtml(summary.windowCount)} windows (requests per second)</div>
    <svg viewBox="0 0 ${CW} ${CH}" width="100%" height="200" role="img" aria-label="Load chart">
      ${svgGrid(rpsMax, (v) => formatRps(v))}
      <polygon points="${rpsArea}" fill="#2563eb" opacity="0.09"/>
      <polyline points="${rpsLine}" fill="none" stroke="#2563eb" stroke-width="2.5"/>
      ${svgDots(rpsVals, rpsMax, '#2563eb')}
      ${xLabels}
    </svg>
  </div>
</div>

<div class="section">
  <div class="eye">P95 Latency</div>
  <div class="three">
    <div class="cbox">
      <div class="ct">P95 trend across all windows</div>
      <svg viewBox="0 0 ${CW} ${CH}" width="100%" height="180" role="img" aria-label="P95 trend chart">
        ${svgGrid(p95Max, formatMs)}
        <line x1="${CPAD}" y1="${baselineY.toFixed(1)}" x2="${CW - CPAD}" y2="${baselineY.toFixed(1)}" stroke="#d1d5db" stroke-dasharray="5 4" stroke-width="1.5"/>
        <text x="${(CW - CPAD - 4).toFixed(1)}" y="${(baselineY - 5).toFixed(1)}" text-anchor="end" font-size="9" fill="#9ca3af">Baseline</text>
        <polygon points="${p95Area}" fill="#2563eb" opacity="0.09"/>
        <polyline points="${p95Line}" fill="none" stroke="#2563eb" stroke-width="2.5"/>
        ${svgDots(p95Vals, p95Max, '#2563eb')}
        ${xLabels}
      </svg>
    </div>
    <div class="panel">
      <div class="eye">P95 Before</div>
      <div class="pv">${escapeHtml(formatMs(first.meanP95))}</div>
      <div class="ps">Window #${escapeHtml(first.windowNumber)} &middot; ${escapeHtml(formatWindowTime(first.timestamp))}</div>
      <div class="ps" style="margin-top:10px"><strong>Peak P95:</strong> ${escapeHtml(formatMs(first.peakP95))}</div>
      <div class="ps"><strong>P50:</strong> ${escapeHtml(formatMs(first.meanP50))}</div>
      <div class="ps"><strong>Snapshots:</strong> ${escapeHtml(first.snapshotCount)}</div>
    </div>
    <div class="panel ${p95Delta < 0 ? 'improved' : p95Delta > 0 ? 'degraded' : ''}">
      <div class="eye">P95 After</div>
      <div class="pv" style="color:${p95Delta < 0 ? '#16a34a' : p95Delta > 0 ? '#dc2626' : '#111827'}">${escapeHtml(formatMs(last.meanP95))}</div>
      <div class="ps">Window #${escapeHtml(last.windowNumber)} &middot; ${escapeHtml(formatWindowTime(last.timestamp))}</div>
      <div class="ps" style="margin-top:10px"><strong>Peak P95:</strong> ${escapeHtml(formatMs(last.peakP95))}</div>
      <div class="ps"><strong>P50:</strong> ${escapeHtml(formatMs(last.meanP50))}</div>
      <div class="ps"><strong>Snapshots:</strong> ${escapeHtml(last.snapshotCount)}</div>
    </div>
  </div>
</div>

<div class="section">
  <div class="eye">Traffic &amp; Error Rate</div>
  <div class="three">
    <div class="cbox">
      <div class="ct">Error rate across all windows</div>
      <svg viewBox="0 0 ${CW} ${CH}" width="100%" height="180" role="img" aria-label="Error rate chart">
        ${svgGrid(errMax, (v) => formatPercent(v * 100))}
        <polyline points="${errLine}" fill="none" stroke="#dc2626" stroke-width="2.5"/>
        ${svgDots(errVals, errMax, '#dc2626')}
        ${xLabels}
      </svg>
    </div>
    <div class="panel">
      <div class="eye">Traffic Before</div>
      <div class="pv">${escapeHtml(formatRps(first.totalRps))}</div>
      <div class="ps">RPS &middot; Window #${escapeHtml(first.windowNumber)}</div>
      <div class="ps" style="margin-top:10px"><strong>Services:</strong> ${escapeHtml(first.serviceCount)}</div>
      <div class="ps"><strong>Edges:</strong> ${escapeHtml(first.edgeCount)}</div>
      <div class="ps"><strong>Error:</strong> ${escapeHtml(formatPercent(first.avgErrorRate * 100))}</div>
    </div>
    <div class="panel ${errDelta < 0 ? 'improved' : errDelta > 0 ? 'degraded' : ''}">
      <div class="eye">Traffic After</div>
      <div class="pv">${escapeHtml(formatRps(last.totalRps))}</div>
      <div class="ps">RPS &middot; Window #${escapeHtml(last.windowNumber)}</div>
      <div class="ps" style="margin-top:10px"><strong>Services:</strong> ${escapeHtml(last.serviceCount)}</div>
      <div class="ps"><strong>Edges:</strong> ${escapeHtml(last.edgeCount)}</div>
      <div class="ps"><strong>Error:</strong> <span style="color:${errDelta < 0 ? '#16a34a' : errDelta > 0 ? '#dc2626' : 'inherit'}">${escapeHtml(formatPercent(last.avgErrorRate * 100))}</span></div>
    </div>
  </div>
</div>

<div class="section">
  <div class="eye">Window Evidence</div>
  <div class="ev">
    <table>
      <thead>
        <tr><th>#</th><th>Time</th><th>Avg P95</th><th>Avg P50</th><th>Peak P95</th><th>Error Rate</th><th>Traffic</th><th>Delta</th></tr>
      </thead>
      <tbody>${evidenceRows}</tbody>
    </table>
  </div>
</div>

<div class="footer">
  30-second window span &middot; ${escapeHtml(summary.windowCount)} windows &middot; ${escapeHtml(summary.observationSeconds)}s total observation &middot; Generated ${escapeHtml(formatDate(summary.generatedAt))}
</div>

</div>
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
    setMeasuring(false)
    setSecondsRemaining(WINDOW_DURATION_S)
  }, [])

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

  useEffect(() => {
    if (!lastWindow) return
    cacheLatencyWindow(lastWindow)
  }, [lastWindow])

  const handleMeasure = useCallback(() => {
    startWindow()
  }, [startWindow])

  const handleReset = useCallback(() => {
    setCompletedWindows([])
    setCurrentSnapshots([])
    snapshotsRef.current = []
    windowCountRef.current = 0
    setMeasuring(false)
    setSecondsRemaining(WINDOW_DURATION_S)
  }, [])

  const handleExportPdf = useCallback(() => {
    if (completedWindows.length < 2) {
      toast.error('Complete at least two windows to export the report')
      return
    }

    const summaryForPdf = buildReportSummary(completedWindows, new Date().toISOString())
    openLatencyPdfPreview(summaryForPdf, completedWindows)
  }, [completedWindows])

  const renderLiveView = () => (
    <div className="space-y-6 animate-in fade-in duration-300">
      {measuring ? (
        <Section title="Live Measurement" icon={Activity}>
          <div className="flex flex-col items-center gap-6">
            <ArcGauge value={currentP95} max={gaugeMax} measuring={measuring} />

            <div className="text-center">
              <p className="text-sm font-medium text-[var(--text-secondary)]">
                Measuring&hellip;{' '}
                <span className="font-bold text-[var(--text-primary)]">{secondsRemaining}s</span>{' '}
                remaining
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
      ) : completedWindows.length === 0 ? (
        <div
          className={cn(
            glassPanelClass,
            'flex flex-col items-center justify-center gap-6 py-20 text-center'
          )}
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--surface-soft)]">
            <Gauge className="h-8 w-8 text-[var(--text-muted)]" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-[var(--text-primary)]">Ready to Measure</h2>
            <p className="mt-2 max-w-sm text-sm text-[var(--text-secondary)]">
              Click <strong>Measure</strong> to capture a 30-second latency snapshot. Optimize your
              system between runs to track improvements.
            </p>
          </div>
          <button
            type="button"
            onClick={handleMeasure}
            className={cn(secondaryButtonClass, 'inline-flex items-center gap-2 px-6 py-2.5')}
          >
            <Zap className="h-4 w-4" />
            Measure
          </button>
        </div>
      ) : (
        <Section title="Window Complete" icon={CheckCircle}>
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <p className="text-sm text-[var(--text-secondary)]">
              Window #{lastWindow!.windowNumber} captured &middot;{' '}
              {formatWindowTime(lastWindow!.timestamp)} &middot; mean p95{' '}
              <strong>{formatMs(lastWindow!.meanP95)}</strong>
            </p>
            <p className="text-xs text-[var(--text-muted)]">
              Make changes to your system, then click <strong>Measure</strong> again to compare.
            </p>
          </div>
        </Section>
      )}

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
        description="Continuous 30-second measurement windows - like a speed test for your microservices"
        icon={Gauge}
        actions={
          <>
            {completedWindows.length >= 2 && (
              <button
                type="button"
                onClick={handleExportPdf}
                className={cn(secondaryButtonClass, 'inline-flex items-center gap-2')}
              >
                <Download className="h-4 w-4" />
                Export PDF
              </button>
            )}
            {completedWindows.length > 0 && !measuring && (
              <button
                type="button"
                onClick={handleReset}
                className={cn(secondaryButtonClass, 'inline-flex items-center gap-2')}
              >
                Reset
              </button>
            )}
            <button
              type="button"
              onClick={handleMeasure}
              disabled={measuring}
              className={cn(
                secondaryButtonClass,
                'inline-flex items-center gap-2',
                measuring && 'cursor-not-allowed opacity-50'
              )}
            >
              <Zap className="h-4 w-4" />
              {measuring ? `Measuring ${secondsRemaining}s\u2026` : 'Measure'}
            </button>
          </>
        }
      />

      {renderLiveView()}
    </div>
  )
}
