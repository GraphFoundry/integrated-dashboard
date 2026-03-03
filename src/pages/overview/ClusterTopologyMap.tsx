import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import {
  GraphCanvas,
  GraphNode as ReagraphNode,
  GraphEdge as ReagraphEdge,
  type GraphCanvasRef,
  type InternalGraphNode,
} from 'reagraph'
import {
  Server,
  Package,
  Box,
  Cpu,
  HardDrive,
  Clock,
  Plus,
  Minus,
  LocateFixed,
  Network,
  ArrowRightLeft,
  Search,
  X,
  ChevronDown,
  Filter,
  SlidersHorizontal,
  ExternalLink,
  Zap,
  FlaskConical,
  FileText,
  EyeIcon,
  ClipboardCopy,
  Image,
  Sun,
  Moon,
  ArrowUp,
  ArrowDown,
  AlertTriangle,
  CheckCircle,
  Activity,
  Loader2,
  Move,
  Shield,
  Heart,
  Wifi,
  CircleDot,
} from 'lucide-react'
import EmptyState from '@/components/layout/EmptyState'
import SkeletonBlock from '@/components/common/SkeletonBlock'
import { cn } from '@/components/common/uiClassTokens'
import { useServicesWithPlacement } from '@/lib/useGraphStream'
import { bffApi } from '@/lib/bffApiClient'
import type { ServiceRollup } from '@/lib/bffApiClient'
import { useTheme } from '@/theme/useTheme'
import toast from 'react-hot-toast'
import type { ServiceWithPlacement, NodeWithResources, FailureResponse, ScaleResponse } from '@/lib/types'
import { simulateFailure, simulateScale } from '@/lib/api'
import { planDrill, runDrill, getDrillRun } from '@/lib/api/drills'

/** Live per-service metrics map exposed by useServicesWithPlacement */
type ServiceMetricsMap = Map<string, { rps: number; errorRate: number; p95: number }>

/** Dependency edge with optional live traffic data */
interface DependencyEdge {
  source: string
  target: string
  rps?: number
  errorRate?: number
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

const CONTROL_PLANE_PATTERNS = [
  /master/i,
  /control[-_]?plane/i,
  /etcd/i,
  /kube[-_]?system[-_]?node/i,
]

function isControlPlaneNode(name: string): boolean {
  return CONTROL_PLANE_PATTERNS.some((re) => re.test(name))
}

function formatUptime(seconds?: number): string {
  if (seconds === undefined || seconds === null) return 'N/A'
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  if (days > 0) return `${days}d ${hours % 24}h`
  if (hours > 0) return `${hours}h ${minutes % 60}m`
  return `${minutes}m`
}

type EntityKind = 'node' | 'service' | 'pod'

/**
 * Interpolate a pod fill colour from lavender (#B589D6) → red (#ef4444)
 * based on CPU usage.  0 % → lavender, 100 % → red.
 */
function podCpuFill(cpuPct: number | undefined | null): string {
  if (cpuPct == null || cpuPct <= 0) return '#B589D6'
  const t = Math.min(cpuPct / 100, 1)
  // lerp RGB:  lavender (181,137,214) → red (239,68,68)
  const r = Math.round(181 + t * (239 - 181))
  const g = Math.round(137 + t * (68 - 137))
  const b = Math.round(214 + t * (68 - 214))
  return `rgb(${r},${g},${b})`
}

/** Clamp edge size between 1 and 8 based on RPS relative to the max in the graph */
function edgeSizeFromRps(rps: number | undefined, maxRps: number): number {
  if (!rps || maxRps <= 0) return 1
  return 1 + (Math.min(rps / maxRps, 1) * 7)
}
type HealthFilter = 'all' | 'degraded' | 'critical'

/* ---- Friendly label helpers for tooltips ---- */

function friendlyNodeHealth(cpuPct: number, ramPct: number): { label: string; color: string } {
  const worst = Math.max(cpuPct, ramPct)
  if (worst < 60) return { label: 'Healthy', color: 'text-green-400' }
  if (worst < 85) return { label: 'Under Load', color: 'text-yellow-400' }
  return { label: 'Stressed', color: 'text-red-400' }
}

function friendlyTrafficLabel(rps?: number): { label: string; color: string } {
  if (rps == null || rps < 1) return { label: 'No traffic', color: 'text-gray-400' }
  if (rps < 10) return { label: 'Very low', color: 'text-blue-300' }
  if (rps < 100) return { label: 'Low', color: 'text-blue-400' }
  if (rps < 500) return { label: 'Moderate', color: 'text-green-400' }
  if (rps < 2000) return { label: 'High', color: 'text-yellow-400' }
  return { label: 'Very high', color: 'text-orange-400' }
}

function friendlySpeedLabel(p95?: number): { label: string; color: string } {
  if (p95 == null) return { label: 'Unknown', color: 'text-gray-400' }
  if (p95 < 50) return { label: 'Very fast', color: 'text-green-400' }
  if (p95 < 200) return { label: 'Fast', color: 'text-green-300' }
  if (p95 < 500) return { label: 'Normal', color: 'text-yellow-400' }
  if (p95 < 1000) return { label: 'Slow', color: 'text-orange-400' }
  return { label: 'Very slow', color: 'text-red-400' }
}

function friendlyErrorLabel(rate?: number): { label: string; color: string } {
  if (rate == null || rate < 0.001) return { label: 'No errors', color: 'text-green-400' }
  if (rate < 0.01) return { label: 'Very few errors', color: 'text-green-300' }
  if (rate < 0.05) return { label: 'Some errors', color: 'text-yellow-400' }
  return { label: 'Many errors', color: 'text-red-400' }
}

function friendlyAvailability(avail: number): { label: string; color: string } {
  if (avail >= 0.99) return { label: 'Excellent', color: 'text-green-400' }
  if (avail >= 0.95) return { label: 'Good', color: 'text-green-300' }
  if (avail >= 0.8) return { label: 'Degraded', color: 'text-yellow-400' }
  return { label: 'Critical', color: 'text-red-400' }
}

function friendlyPodHealth(cpuPct?: number): { label: string; color: string } {
  if (cpuPct == null) return { label: 'Unknown', color: 'text-gray-400' }
  if (cpuPct < 60) return { label: 'Running smoothly', color: 'text-green-400' }
  if (cpuPct < 85) return { label: 'Working hard', color: 'text-yellow-400' }
  return { label: 'Struggling', color: 'text-red-400' }
}

function friendlyMemory(mb?: number): string {
  if (mb == null) return 'Unknown'
  if (mb < 100) return `${mb.toFixed(0)} MB`
  return `${(mb / 1024).toFixed(1)} GB`
}

/* Prefixes ensure globally unique ids */
const nodeId = (n: string) => `node::${n}`
const svcId = (s: string) => `svc::${s}`
const podId = (p: string) => `pod::${p}`

/* ------------------------------------------------------------------ */
/*  Graph data builder                                                */
/* ------------------------------------------------------------------ */

interface TopologyFilters {
  namespace: string          // '' = all namespaces
  health: HealthFilter
  depthOrigin: string | null // id of origin node for depth control
  depthHops: number          // max hops from origin (0 = unlimited)
}

const DEFAULT_FILTERS: TopologyFilters = {
  namespace: '',
  health: 'all',
  depthOrigin: null,
  depthHops: 0,
}

function buildTopologyGraph(
  services: ServiceWithPlacement[],
  allNodes: NodeWithResources[],
  dependencyEdges: DependencyEdge[],
  filters: TopologyFilters = DEFAULT_FILTERS,
  serviceMetrics?: ServiceMetricsMap,
  alertRollups?: Map<string, ServiceRollup>,
) {
  const nodes: ReagraphNode[] = []
  const edges: ReagraphEdge[] = []

  /* ---------- 1. Collect K8s-node names (from both sources) ---------- */
  const k8sNodeNames = new Set<string>()

  allNodes.forEach((n) => k8sNodeNames.add(n.name))
  services.forEach((svc) =>
    svc.placement?.nodes?.forEach((np) => k8sNodeNames.add(np.node))
  )

  /* Lookup maps for node resources */
  const infraNodeMap = new Map(allNodes.map((n) => [n.name, n]))

  /* Pre-scan: count services and pods per K8s node */
  const svcCountPerNode = new Map<string, number>()
  const podCountPerNode = new Map<string, number>()
  services.forEach((svc) => {
    svc.placement?.nodes?.forEach((np) => {
      svcCountPerNode.set(np.node, (svcCountPerNode.get(np.node) ?? 0) + 1)
      podCountPerNode.set(np.node, (podCountPerNode.get(np.node) ?? 0) + (np.pods?.length ?? 0))
    })
  })

  /* ---------- 2. K8s-node graph-nodes (skip control plane) ---------- */
  const visibleK8sNodes = Array.from(k8sNodeNames).filter(
    (name) => !isControlPlaneNode(name)
  )

  visibleK8sNodes.forEach((name) => {
    const infra = infraNodeMap.get(name)
    const cpuPct = infra?.resources?.cpu?.usagePercent ?? 0
    const ramPct = infra?.resources?.ram ? (infra.resources.ram.usedMB / infra.resources.ram.totalMB) * 100 : 0
    nodes.push({
      id: nodeId(name),
      label: name,
      fill: '#3b82f6', // blue-500
      size: 65,
      subLabel: `CPU ${cpuPct.toFixed(0)}% · RAM ${ramPct.toFixed(0)}%`,
      data: {
        kind: 'node' as EntityKind,
        name,
        cpu: infra?.resources?.cpu,
        ram: infra?.resources?.ram,
        serviceCount: svcCountPerNode.get(name) ?? 0,
        totalPodCount: podCountPerNode.get(name) ?? 0,
      },
    })
  })

  const visibleNodeSet = new Set(visibleK8sNodes)

  /* ---------- 3. Service & Pod graph-nodes + placement edges -------- */
  const addedServices = new Set<string>()

  /* Apply namespace & health filters */
  const filteredServices = services.filter((svc) => {
    if (filters.namespace && svc.namespace !== filters.namespace) return false
    if (filters.health !== 'all') {
      const avail = typeof svc.availability === 'number' ? svc.availability : 1
      if (filters.health === 'critical' && avail >= 0.8) return false
      if (filters.health === 'degraded' && avail >= 0.95) return false
    }
    return true
  })

  filteredServices.forEach((svc) => {
    /* ---------- Add service node even if placement is empty (down service) ---------- */
    const hasPlacement = svc.placement?.nodes && svc.placement.nodes.length > 0

    if (!addedServices.has(svc.name)) {
      addedServices.add(svc.name)
      const avail = typeof svc.availability === 'number' ? svc.availability : (hasPlacement ? 1 : 0)
      const isDown = !hasPlacement || svc.podCount === 0
      let fill = '#ef4444' // red = critical / down
      if (!isDown) {
        if (avail >= 0.95) fill = '#10b981'
        else if (avail >= 0.8) fill = '#f59e0b'
      }

      const metrics = serviceMetrics?.get(svc.name)
      const highErrorRate = (metrics?.errorRate ?? 0) > 0.05
      const alertData = alertRollups?.get(svc.name)

      nodes.push({
        id: svcId(svc.name),
        label: isDown ? `${svc.name} ⛔` : svc.name,
        fill,
        size: isDown ? 36 : 40,
        data: {
          kind: 'service' as EntityKind,
          name: svc.name,
          namespace: svc.namespace,
          podCount: svc.podCount ?? 0,
          availability: avail,
          rps: metrics?.rps,
          errorRate: metrics?.errorRate,
          p95: metrics?.p95,
          highErrorRate,
          isDown,
          openIncidents: alertData?.open_incidents ?? 0,
          criticalAlerts: alertData?.critical_count ?? 0,
          highAlerts: alertData?.high_count ?? 0,
        },
      })
    }

    if (!hasPlacement) return // no placement edges/pods to add

    svc.placement!.nodes.forEach((np) => {
      if (!visibleNodeSet.has(np.node)) return

      /* Node → Service edge */
      edges.push({
        id: `place::${np.node}->${svc.name}`,
        source: nodeId(np.node),
        target: svcId(svc.name),
        label: '',
      })

      /* Pod nodes + Service → Pod edges */
      np.pods?.forEach((pod) => {
        const pid = podId(pod.name)
        if (!nodes.find((n) => n.id === pid)) {
          nodes.push({
            id: pid,
            label: pod.name.replace(/^.*?-([a-z0-9]{5,10}-[a-z0-9]{4,5})$/, '...$1'),
            fill: podCpuFill(pod.cpuUsagePercent), // heatmap: lavender → red
            size: 20,
            data: {
              kind: 'pod' as EntityKind,
              name: pod.name,
              nodeName: np.node,
              serviceName: svc.name,
              namespace: svc.namespace,
              podCount: svc.podCount ?? 0,
              cpuUsagePercent: pod.cpuUsagePercent,
              ramUsedMB: pod.ramUsedMB,
              uptimeSeconds: pod.uptimeSeconds,
            },
          })
        }
        edges.push({
          id: `owns::${svc.name}->${pod.name}`,
          source: svcId(svc.name),
          target: pid,
          label: '',
        })
      })
    })
  })

  /* ---------- 4. Service → Service dependency edges ----------------- */
  /* Pre-compute max RPS so edge thickness can be relative */
  const maxRps = dependencyEdges.reduce((m, e) => Math.max(m, e.rps ?? 0), 0)

  dependencyEdges.forEach((de, idx) => {
    if (!addedServices.has(de.source) || !addedServices.has(de.target)) return
    edges.push({
      id: `dep::${idx}::${de.source}->${de.target}`,
      source: svcId(de.source),
      target: svcId(de.target),
      label: de.rps != null ? `${de.rps.toFixed(0)} rps` : '',
      size: edgeSizeFromRps(de.rps, maxRps),
      data: { rps: de.rps, errorRate: de.errorRate },
    })
  })

  /* ---------- 5. Depth filtering (BFS from origin) ------------------ */
  if (filters.depthOrigin && filters.depthHops > 0) {
    const allowed = new Set<string>()
    const queue: [string, number][] = [[filters.depthOrigin, 0]]
    while (queue.length > 0) {
      const [current, depth] = queue.shift()!
      if (allowed.has(current) || depth > filters.depthHops) continue
      allowed.add(current)
      edges.forEach((e) => {
        if (e.source === current && !allowed.has(typeof e.target === 'string' ? e.target : ''))
          queue.push([typeof e.target === 'string' ? e.target : '', depth + 1])
        if (e.target === current && !allowed.has(typeof e.source === 'string' ? e.source : ''))
          queue.push([typeof e.source === 'string' ? e.source : '', depth + 1])
      })
    }
    const filteredNodes = nodes.filter((n) => allowed.has(n.id))
    const filteredEdges = edges.filter(
      (e) => allowed.has(typeof e.source === 'string' ? e.source : '') && allowed.has(typeof e.target === 'string' ? e.target : '')
    )
    return { nodes: filteredNodes, edges: filteredEdges }
  }

  return { nodes, edges }
}

/* ------------------------------------------------------------------ */
/*  Filter Bar                                                        */
/* ------------------------------------------------------------------ */

function FilterBar({
  namespaces,
  filters,
  onFilterChange,
}: {
  namespaces: string[]
  filters: TopologyFilters
  onFilterChange: (patch: Partial<TopologyFilters>) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-2 bg-[var(--surface-subtle)] border-b border-[var(--border)]">
      <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
        <Filter className="h-3 w-3" />
        <span className="font-medium">Filters</span>
      </div>

      {/* Namespace dropdown */}
      <div className="relative">
        <select
          value={filters.namespace}
          onChange={(e) => onFilterChange({ namespace: e.target.value })}
          className="appearance-none rounded-md border border-[var(--border)] bg-[var(--surface-solid)] py-1 pl-2 pr-7 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--ring)] focus:ring-1 focus:ring-[var(--ring)] cursor-pointer"
          aria-label="Filter by namespace"
        >
          <option value="">All namespaces</option>
          {namespaces.map((ns) => (
            <option key={ns} value={ns}>{ns}</option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-[var(--text-muted)]" />
      </div>

      {/* Health filter */}
      <div className="flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface-solid)] p-0.5">
        {(['all', 'degraded', 'critical'] as HealthFilter[]).map((h) => (
          <button
            key={h}
            type="button"
            onClick={() => onFilterChange({ health: h })}
            className={cn(
              'rounded px-2 py-0.5 text-[11px] font-medium transition-colors',
              filters.health === h
                ? 'bg-[var(--ring)] text-white'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            )}
          >
            {h === 'all' ? 'All' : h === 'degraded' ? 'Degraded' : 'Critical'}
          </button>
        ))}
      </div>

      {/* Depth control */}
      {filters.depthOrigin && (
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-3 w-3 text-[var(--text-muted)]" />
          <span className="text-[11px] text-[var(--text-muted)]">Depth:</span>
          <input
            type="range"
            min={0}
            max={10}
            value={filters.depthHops}
            onChange={(e) => onFilterChange({ depthHops: parseInt(e.target.value, 10) })}
            className="w-20 h-1 accent-[var(--ring)] cursor-pointer"
            aria-label="Depth hops"
          />
          <span className="text-[11px] font-mono text-[var(--text-primary)]">
            {filters.depthHops === 0 ? '∞' : filters.depthHops}
          </span>
          <button
            type="button"
            onClick={() => onFilterChange({ depthOrigin: null, depthHops: 0 })}
            className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] underline"
          >
            Clear
          </button>
        </div>
      )}

      {/* Active filter indicator */}
      {(filters.namespace || filters.health !== 'all' || filters.depthOrigin) && (
        <button
          type="button"
          onClick={() => onFilterChange({ namespace: '', health: 'all', depthOrigin: null, depthHops: 0 })}
          className="ml-auto text-[11px] text-amber-400 hover:text-amber-300 flex items-center gap-1"
        >
          <X className="h-3 w-3" />
          Clear all
        </button>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Legend                                                             */
/* ------------------------------------------------------------------ */

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] text-[var(--text-muted)]">
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-3 rounded-sm bg-blue-500" />
        Kubernetes Node
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-3 rounded-full bg-emerald-500" />
        Service (healthy)
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-3 rounded-full bg-amber-500" />
        Service (degraded)
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-3 rounded-full bg-red-500" />
        Service (critical)
      </span>
      <span className="flex items-center gap-1.5">
        <span
          className="inline-block h-2.5 w-2.5 rounded-full"
          style={{ background: 'linear-gradient(135deg, #B589D6, #ef4444)' }}
        />
        Pod (CPU heatmap)
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-400" />
        Search match
      </span>
      <span className="flex items-center gap-1.5">
        <ArrowRightLeft className="h-3 w-3" />
        Dependency (thick = high RPS)
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />
        High error rate
      </span>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Hover Tooltip                                                     */
/* ------------------------------------------------------------------ */

function TopologyTooltip({
  node,
  position,
}: {
  node: ReagraphNode
  position: { x: number; y: number }
}) {
  const kind: EntityKind = node.data?.kind ?? 'service'
  const tooltipWidth = 280
  const tooltipHeight = 260
  const vw = window.innerWidth
  const vh = window.innerHeight

  let left = position.x + 16
  let top = position.y + 16
  if (left + tooltipWidth > vw) left = position.x - tooltipWidth - 16
  if (top + tooltipHeight > vh) top = position.y - tooltipHeight - 16
  if (left < 16) left = 16
  if (top < 16) top = 16

  return (
    <div
      className="fixed z-50 pointer-events-none bg-[var(--surface-contrast)] backdrop-blur-md border border-[var(--border-strong)] rounded-lg shadow-2xl animate-in fade-in zoom-in-95 duration-150"
      style={{ left: `${left}px`, top: `${top}px`, width: `${tooltipWidth}px` }}
    >
      <div className="p-3 space-y-2 text-xs">
        {/* K8s Node tooltip */}
        {kind === 'node' && (() => {
          const cpuPct = node.data.cpu?.usagePercent ?? 0
          const ramPct = node.data.ram ? (node.data.ram.usedMB / node.data.ram.totalMB) * 100 : 0
          const health = friendlyNodeHealth(cpuPct, ramPct)
          return (
            <>
              <div className="flex items-center gap-2 mb-2">
                <Server className="w-4 h-4 text-blue-400" />
                <span className="font-semibold text-sm text-[var(--text-primary)]">{node.data.name}</span>
              </div>
              {/* Overall health status */}
              <div className="flex items-center gap-2">
                <Heart className="w-3.5 h-3.5 text-pink-400" />
                <span className="text-[var(--text-muted)]">Health:</span>
                <span className={cn('font-semibold', health.color)}>{health.label}</span>
              </div>
              {/* CPU bar */}
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="text-[var(--text-muted)]">CPU:</span>
                  <span className="font-mono font-semibold text-[var(--text-primary)]">
                    {cpuPct.toFixed(0)}% used ({node.data.cpu?.cores ?? '?'} cores)
                  </span>
                </div>
                <div className="ml-5.5 h-1.5 rounded-full bg-[var(--surface-soft)] overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(cpuPct, 100)}%`, backgroundColor: cpuPct < 60 ? '#10b981' : cpuPct < 85 ? '#f59e0b' : '#ef4444' }} />
                </div>
              </div>
              {/* RAM bar */}
              {node.data.ram && (
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-[var(--text-muted)]">Memory:</span>
                    <span className="font-mono font-semibold text-[var(--text-primary)]">
                      {friendlyMemory(node.data.ram.usedMB)} / {friendlyMemory(node.data.ram.totalMB)}
                    </span>
                  </div>
                  <div className="ml-5.5 h-1.5 rounded-full bg-[var(--surface-soft)] overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(ramPct, 100)}%`, backgroundColor: ramPct < 60 ? '#10b981' : ramPct < 85 ? '#f59e0b' : '#ef4444' }} />
                  </div>
                </div>
              )}
              {/* Services & Pods hosted */}
              <div className="flex items-center gap-2">
                <Package className="w-3.5 h-3.5 text-purple-400" />
                <span className="text-[var(--text-muted)]">Running:</span>
                <span className="font-semibold text-[var(--text-primary)]">
                  {node.data.serviceCount ?? 0} services, {node.data.totalPodCount ?? 0} pods
                </span>
              </div>
              {/* Summary sentence */}
              <div className="mt-2 pt-2 border-t border-[var(--border)] text-[10px] text-[var(--text-muted)] italic">
                {cpuPct < 50 && ramPct < 50
                  ? 'This machine has plenty of room for more work.'
                  : cpuPct < 80 && ramPct < 80
                    ? 'This machine is doing okay but getting busier.'
                    : 'This machine is under heavy load — consider moving some workloads.'}
              </div>
            </>
          )
        })()}

        {/* Service tooltip */}
        {kind === 'service' && (() => {
          const avail = node.data.availability ?? 0
          const availLabel = friendlyAvailability(avail)
          const traffic = friendlyTrafficLabel(node.data.rps)
          const speed = friendlySpeedLabel(node.data.p95)
          const errors = friendlyErrorLabel(node.data.errorRate)
          return (
            <>
              <div className="flex items-center gap-2 mb-2">
                <Package className="w-4 h-4 text-purple-400" />
                <div>
                  <div className="font-semibold text-sm text-[var(--text-primary)]">{node.data.name}</div>
                  <div className="text-[10px] text-[var(--text-muted)]">{node.data.namespace}</div>
                </div>
              </div>
              {/* Status */}
              <div className="flex items-center gap-2">
                <Shield className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-[var(--text-muted)]">Status:</span>
                <span className={cn('font-semibold', availLabel.color)}>{availLabel.label}</span>
                <span className="text-[var(--text-dim)] text-[10px]">({(avail * 100).toFixed(1)}%)</span>
              </div>
              {/* Running pods */}
              <div className="flex items-center gap-2">
                <Box className="w-3.5 h-3.5 text-indigo-400" />
                <span className="text-[var(--text-muted)]">Pods running:</span>
                <span className="font-semibold text-[var(--text-primary)]">{node.data.podCount ?? 0}</span>
              </div>
              {/* Traffic */}
              <div className="flex items-center gap-2">
                <Wifi className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-[var(--text-muted)]">Traffic:</span>
                <span className={cn('font-semibold', traffic.color)}>
                  {traffic.label}
                  {node.data.rps != null && <span className="text-[var(--text-dim)] text-[10px] ml-1">({node.data.rps.toFixed(0)} req/s)</span>}
                </span>
              </div>
              {/* Speed */}
              <div className="flex items-center gap-2">
                <Activity className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-[var(--text-muted)]">Response speed:</span>
                <span className={cn('font-semibold', speed.color)}>
                  {speed.label}
                  {node.data.p95 != null && <span className="text-[var(--text-dim)] text-[10px] ml-1">({node.data.p95.toFixed(0)}ms)</span>}
                </span>
              </div>
              {/* Errors */}
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                <span className="text-[var(--text-muted)]">Errors:</span>
                <span className={cn('font-semibold', errors.color)}>{errors.label}</span>
              </div>
              {/* Alerts */}
              {node.data.openIncidents > 0 && (
                <div className="flex items-center gap-2 mt-1 pt-1 border-t border-[var(--border)]">
                  <span className={cn(
                    'font-semibold',
                    node.data.criticalAlerts > 0 ? 'text-red-400' : 'text-amber-400'
                  )}>
                    {node.data.criticalAlerts > 0 ? '🔴' : '⚠️'} {node.data.openIncidents} open alert{node.data.openIncidents > 1 ? 's' : ''}
                  </span>
                </div>
              )}
            </>
          )
        })()}

        {/* Pod tooltip */}
        {kind === 'pod' && (() => {
          const podHealth = friendlyPodHealth(node.data.cpuUsagePercent)
          const cpuPct = node.data.cpuUsagePercent ?? 0
          return (
            <>
              <div className="flex items-center gap-2 mb-2">
                <CircleDot className="w-4 h-4 text-teal-400" />
                <span className="font-semibold text-sm text-[var(--text-primary)] break-all leading-tight">
                  {node.data.name}
                </span>
              </div>
              {/* Health */}
              <div className="flex items-center gap-2">
                <Heart className="w-3.5 h-3.5 text-pink-400" />
                <span className="text-[var(--text-muted)]">Health:</span>
                <span className={cn('font-semibold', podHealth.color)}>{podHealth.label}</span>
              </div>
              {/* Belongs to */}
              <div className="flex items-center gap-2">
                <Package className="w-3.5 h-3.5 text-purple-400" />
                <span className="text-[var(--text-muted)]">Service:</span>
                <span className="font-semibold text-[var(--text-primary)]">{node.data.serviceName}</span>
              </div>
              <div className="flex items-center gap-2">
                <Server className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-[var(--text-muted)]">Running on:</span>
                <span className="font-semibold text-[var(--text-primary)]">{node.data.nodeName}</span>
              </div>
              {/* CPU bar */}
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="text-[var(--text-muted)]">CPU:</span>
                  <span className="font-mono font-semibold text-[var(--text-primary)]">
                    {cpuPct.toFixed(0)}% used
                  </span>
                </div>
                <div className="ml-5.5 h-1.5 rounded-full bg-[var(--surface-soft)] overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(cpuPct, 100)}%`, backgroundColor: cpuPct < 60 ? '#10b981' : cpuPct < 85 ? '#f59e0b' : '#ef4444' }} />
                </div>
              </div>
              {/* Memory */}
              <div className="flex items-center gap-2">
                <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-[var(--text-muted)]">Memory:</span>
                <span className="font-mono font-semibold text-[var(--text-primary)]">
                  {friendlyMemory(node.data.ramUsedMB)}
                </span>
              </div>
              {/* Uptime */}
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                <span className="text-[var(--text-muted)]">Running for:</span>
                <span className="font-mono font-semibold text-[var(--text-primary)]">
                  {formatUptime(node.data.uptimeSeconds)}
                </span>
              </div>
              {/* Summary */}
              <div className="mt-2 pt-2 border-t border-[var(--border)] text-[10px] text-[var(--text-muted)] italic">
                {cpuPct < 50
                  ? 'This pod is running fine with low resource usage.'
                  : cpuPct < 80
                    ? 'This pod is fairly busy but still within normal range.'
                    : 'This pod is using a lot of resources — it may need attention.'}
              </div>
            </>
          )
        })()}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Graph theme (matches existing pattern)                             */
/* ------------------------------------------------------------------ */

function createTopologyTheme(isDark: boolean) {
  const rootStyles =
    typeof window !== 'undefined' ? window.getComputedStyle(document.documentElement) : null
  const getVar = (name: string, fallback: string) =>
    rootStyles?.getPropertyValue(name).trim() || fallback

  /* Light and dark palette */
  const palette = isDark
    ? {
        canvasBg: getVar('--graph-canvas', '#0f172a'),
        nodeFill: getVar('--graph-node-fill', '#64748b'),
        nodeActiveFill: getVar('--graph-node-active-fill', '#38bdf8'),
        labelColor: getVar('--graph-node-label', '#e2e8f0'),
        labelStroke: getVar('--graph-node-label-stroke', '#0f172a'),
        subLabelColor: getVar('--graph-node-sublabel', '#94a3b8'),
        edgeFill: getVar('--graph-edge-fill', '#475569'),
        edgeActiveFill: getVar('--graph-edge-active-fill', '#94a3b8'),
        arrowFill: getVar('--graph-arrow-fill', '#475569'),
        arrowActiveFill: getVar('--graph-arrow-active-fill', '#94a3b8'),
        ringFill: getVar('--graph-ring-fill', '#334155'),
        ringActiveFill: getVar('--graph-ring-active-fill', '#3b82f6'),
        lassoColor: '#38bdf8',
        lassoBg: 'rgba(56, 189, 248, 0.1)',
        labelActiveColor: '#ffffff',
        edgeLabelActiveColor: '#f8fafc',
      }
    : {
        canvasBg: '#f8fafc',
        nodeFill: '#94a3b8',
        nodeActiveFill: '#2563eb',
        labelColor: '#1e293b',
        labelStroke: '#f8fafc',
        subLabelColor: '#64748b',
        edgeFill: '#cbd5e1',
        edgeActiveFill: '#64748b',
        arrowFill: '#cbd5e1',
        arrowActiveFill: '#64748b',
        ringFill: '#e2e8f0',
        ringActiveFill: '#3b82f6',
        lassoColor: '#2563eb',
        lassoBg: 'rgba(37, 99, 235, 0.08)',
        labelActiveColor: '#1e293b',
        edgeLabelActiveColor: '#334155',
      }

  return {
    canvas: { background: palette.canvasBg },
    node: {
      fill: palette.nodeFill,
      activeFill: palette.nodeActiveFill,
      opacity: 0.9,
      selectedOpacity: 1,
      inactiveOpacity: 0.35,
      label: {
        color: palette.labelColor,
        stroke: palette.labelStroke,
        activeColor: palette.labelActiveColor,
      },
      subLabel: {
        color: palette.subLabelColor,
        stroke: 'transparent',
        activeColor: palette.labelColor,
      },
    },
    lasso: {
      border: `1px solid ${palette.lassoColor}`,
      background: palette.lassoBg,
    },
    ring: {
      fill: palette.ringFill,
      activeFill: palette.ringActiveFill,
    },
    edge: {
      fill: palette.edgeFill,
      activeFill: palette.edgeActiveFill,
      opacity: 0.5,
      selectedOpacity: 1,
      inactiveOpacity: 0.08,
      label: {
        stroke: 'transparent',
        color: palette.subLabelColor,
        activeColor: palette.edgeLabelActiveColor,
        fontSize: 6,
      },
    },
    arrow: {
      fill: palette.arrowFill,
      activeFill: palette.arrowActiveFill,
    },
  }
}

/* ------------------------------------------------------------------ */
/*  Right-click context menu                                          */
/* ------------------------------------------------------------------ */

interface ContextMenuState {
  node: ReagraphNode
  x: number
  y: number
}

function TopologyContextMenu({
  state,
  onClose,
  onInspect,
  navigate,
  onSimulateFailure,
  onRunDrill,
  onScaleService,
  onScaleDrill,
  onMigrateService,
}: {
  state: ContextMenuState
  onClose: () => void
  onInspect: (node: ReagraphNode) => void
  navigate: ReturnType<typeof useNavigate>
  onSimulateFailure: (serviceName: string, namespace: string) => void
  onRunDrill: (serviceName: string, namespace: string) => void
  onScaleService: (serviceName: string, direction: 'up' | 'down', currentPods: number, namespace: string) => void
  onScaleDrill: (serviceName: string, direction: 'up' | 'down', currentPods: number, namespace: string) => void
  onMigrateService: (serviceName: string, namespace: string) => void
}) {
  const kind: EntityKind = state.node.data?.kind ?? 'service'
  const name = state.node.data?.name ?? state.node.label ?? ''
  const namespace = state.node.data?.namespace ?? ''

  /* Close on outside click */
  useEffect(() => {
    const handler = () => onClose()
    window.addEventListener('click', handler)
    return () => window.removeEventListener('click', handler)
  }, [onClose])

  const items: { icon: typeof EyeIcon; label: string; action: () => void; destructive?: boolean }[] = [
    {
      icon: EyeIcon,
      label: 'Inspect',
      action: () => { onInspect(state.node); onClose() },
    },
  ]

  if (kind === 'service') {
    items.push(
      {
        icon: ExternalLink,
        label: 'View service details',
        action: () => { navigate(`/services/${namespace}:${name}`); onClose() },
      },
      {
        icon: Zap,
        label: 'Simulate failure',
        destructive: true,
        action: () => { onSimulateFailure(name, namespace); onClose() },
      },
      {
        icon: FlaskConical,
        label: 'Run chaos drill',
        destructive: true,
        action: () => { onRunDrill(name, namespace); onClose() },
      },
      {
        icon: ArrowUp,
        label: 'Simulate scale up (+1)',
        action: () => { onScaleService(name, 'up', state.node.data?.podCount ?? 1, namespace); onClose() },
      },
      {
        icon: ArrowDown,
        label: 'Simulate scale down (-1)',
        action: () => { onScaleService(name, 'down', state.node.data?.podCount ?? 1, namespace); onClose() },
      },
      {
        icon: ArrowUp,
        label: 'Drill: Scale up (+1 pod)',
        destructive: true,
        action: () => { onScaleDrill(name, 'up', state.node.data?.podCount ?? 1, namespace); onClose() },
      },
      {
        icon: ArrowDown,
        label: 'Drill: Scale down (-1 pod)',
        destructive: true,
        action: () => { onScaleDrill(name, 'down', state.node.data?.podCount ?? 1, namespace); onClose() },
      },
      {
        icon: Move,
        label: 'Migrate to another node…',
        action: () => { onMigrateService(name, namespace); onClose() },
      },
    )
  }

  if (kind === 'pod') {
    const svcName = state.node.data?.serviceName ?? ''
    const podNamespace = state.node.data?.namespace || namespace
    items.push(
      {
        icon: FileText,
        label: 'View pod service details',
        action: () => {
          // Navigate to the service page for this pod's service (not global metrics)
          if (svcName) {
            navigate(`/services/${podNamespace || 'default'}:${svcName}`)
          } else {
            navigate(`/metrics`)
          }
          onClose()
        },
      },
      {
        icon: ArrowUp,
        label: 'Simulate scale up',
        action: () => { if (svcName) onScaleService(svcName, 'up', state.node.data?.podCount ?? 1, podNamespace); onClose() },
      },
      {
        icon: ArrowDown,
        label: 'Simulate scale down',
        action: () => { if (svcName) onScaleService(svcName, 'down', state.node.data?.podCount ?? 1, podNamespace); onClose() },
      },
      {
        icon: ArrowUp,
        label: 'Drill: Scale up (+1 pod)',
        destructive: true,
        action: () => { if (svcName) onScaleDrill(svcName, 'up', state.node.data?.podCount ?? 1, podNamespace); onClose() },
      },
      {
        icon: ArrowDown,
        label: 'Drill: Scale down (-1 pod)',
        destructive: true,
        action: () => { if (svcName) onScaleDrill(svcName, 'down', state.node.data?.podCount ?? 1, podNamespace); onClose() },
      },
    )
  }

  /* Position: ensure menu stays within viewport */
  const menuWidth = 220
  const menuHeight = items.length * 36 + 16
  let left = state.x
  let top = state.y
  if (left + menuWidth > window.innerWidth) left = state.x - menuWidth
  if (top + menuHeight > window.innerHeight) top = state.y - menuHeight
  if (left < 4) left = 4
  if (top < 4) top = 4

  return (
    <div
      className="fixed z-50 bg-[var(--surface-contrast)] backdrop-blur-md border border-[var(--border-strong)] rounded-lg shadow-2xl py-1 animate-in fade-in zoom-in-95 duration-100"
      style={{ left, top, minWidth: menuWidth }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-dim)] truncate">
        {name}
      </div>
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          onClick={item.action}
          className={cn(
            'w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors text-left',
            item.destructive
              ? 'text-red-400 hover:bg-red-500/10'
              : 'text-[var(--text-primary)] hover:bg-[var(--surface-soft)]'
          )}
        >
          <item.icon className={cn('h-3.5 w-3.5', item.destructive ? 'text-red-400' : 'text-[var(--text-muted)]')} />
          {item.label}
        </button>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Topology Details Drawer (click-to-inspect)                        */
/* ------------------------------------------------------------------ */

function TopologyDetailsDrawer({
  node,
  edges,
  allGraphNodes,
  onClose,
}: {
  node: ReagraphNode
  edges: ReagraphEdge[]
  allGraphNodes: ReagraphNode[]
  onClose: () => void
}) {
  const kind: EntityKind = node.data?.kind ?? 'service'

  /* Compute connected neighbours */
  const neighbours = useMemo(() => {
    const incoming: ReagraphNode[] = []
    const outgoing: ReagraphNode[] = []
    const nodeMap = new Map(allGraphNodes.map((n) => [n.id, n]))
    edges.forEach((e) => {
      const src = typeof e.source === 'string' ? e.source : ''
      const tgt = typeof e.target === 'string' ? e.target : ''
      if (src === node.id) {
        const t = nodeMap.get(tgt)
        if (t) outgoing.push(t)
      }
      if (tgt === node.id) {
        const s = nodeMap.get(src)
        if (s) incoming.push(s)
      }
    })
    return { incoming, outgoing }
  }, [node.id, edges, allGraphNodes])

  return (
    <div className="absolute top-4 right-4 z-30 w-80 bg-[var(--surface-contrast)] backdrop-blur-md border border-[var(--border-strong)] rounded-lg shadow-2xl max-h-[calc(100%-2rem)] overflow-hidden flex flex-col animate-in fade-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="p-3 border-b border-[var(--border)] flex justify-between items-start gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="shrink-0 inline-block h-3 w-3 rounded-full"
            style={{ backgroundColor: node.fill as string }}
          />
          <div className="min-w-0">
            <div className="font-semibold text-sm text-[var(--text-primary)] truncate">
              {node.data?.name ?? node.label}
            </div>
            <div className="text-[10px] text-[var(--text-muted)] capitalize">{kind}</div>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          aria-label="Close drawer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Body */}
      <div className="overflow-y-auto flex-1 p-3 space-y-3 text-xs">
        {/* Properties */}
        <section className="space-y-1.5">
          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-dim)]">Properties</h4>
          {kind === 'node' && (
            <>
              <DrawerRow label="Name" value={node.data?.name} />
              <DrawerRow label="CPU" value={node.data?.cpu ? `${node.data.cpu.usagePercent?.toFixed(1)}% · ${node.data.cpu.cores} cores` : 'N/A'} />
              <DrawerRow label="RAM" value={node.data?.ram ? `${(node.data.ram.usedMB / 1024).toFixed(1)} / ${(node.data.ram.totalMB / 1024).toFixed(1)} GB` : 'N/A'} />
            </>
          )}
          {kind === 'service' && (
            <>
              <DrawerRow label="Service" value={node.data?.name} />
              <DrawerRow label="Namespace" value={node.data?.namespace} />
              <DrawerRow label="Pods" value={node.data?.podCount} />
              <DrawerRow label="Availability" value={node.data?.availability != null ? `${(node.data.availability * 100).toFixed(1)}%` : 'N/A'} />
              {node.data?.rps != null && <DrawerRow label="RPS" value={node.data.rps.toFixed(1)} />}
              {node.data?.errorRate != null && <DrawerRow label="Error rate" value={`${(node.data.errorRate * 100).toFixed(2)}%`} highlight={node.data.errorRate > 0.05} />}
              {node.data?.p95 != null && <DrawerRow label="p95 latency" value={`${node.data.p95.toFixed(0)} ms`} />}
              {node.data?.openIncidents > 0 && (
                <DrawerRow label="Open alerts" value={node.data.openIncidents} highlight={node.data.criticalAlerts > 0} />
              )}
              {node.data?.criticalAlerts > 0 && (
                <DrawerRow label="Critical" value={node.data.criticalAlerts} highlight />
              )}
            </>
          )}
          {kind === 'pod' && (
            <>
              <DrawerRow label="Pod" value={node.data?.name} />
              <DrawerRow label="Node" value={node.data?.nodeName} />
              <DrawerRow label="Service" value={node.data?.serviceName} />
              <DrawerRow label="CPU" value={node.data?.cpuUsagePercent != null ? `${node.data.cpuUsagePercent.toFixed(1)}%` : 'N/A'} />
              <DrawerRow label="RAM" value={node.data?.ramUsedMB != null ? `${(node.data.ramUsedMB / 1024).toFixed(2)} GB` : 'N/A'} />
              <DrawerRow label="Uptime" value={formatUptime(node.data?.uptimeSeconds)} />
            </>
          )}
        </section>

        {/* Connections */}
        {(neighbours.incoming.length > 0 || neighbours.outgoing.length > 0) && (
          <section className="space-y-1.5">
            <h4 className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-dim)]">Connections</h4>
            {neighbours.incoming.length > 0 && (
              <div>
                <span className="text-[10px] text-[var(--text-muted)]">Incoming ({neighbours.incoming.length})</span>
                <ul className="mt-0.5 space-y-0.5">
                  {neighbours.incoming.slice(0, 10).map((n) => (
                    <li key={n.id} className="flex items-center gap-1.5">
                      <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: n.fill as string }} />
                      <span className="text-[var(--text-primary)] truncate">{n.data?.name ?? n.label}</span>
                      <span className="text-[var(--text-dim)] capitalize text-[10px]">({n.data?.kind})</span>
                    </li>
                  ))}
                  {neighbours.incoming.length > 10 && (
                    <li className="text-[10px] text-[var(--text-dim)]">+{neighbours.incoming.length - 10} more</li>
                  )}
                </ul>
              </div>
            )}
            {neighbours.outgoing.length > 0 && (
              <div>
                <span className="text-[10px] text-[var(--text-muted)]">Outgoing ({neighbours.outgoing.length})</span>
                <ul className="mt-0.5 space-y-0.5">
                  {neighbours.outgoing.slice(0, 10).map((n) => (
                    <li key={n.id} className="flex items-center gap-1.5">
                      <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: n.fill as string }} />
                      <span className="text-[var(--text-primary)] truncate">{n.data?.name ?? n.label}</span>
                      <span className="text-[var(--text-dim)] capitalize text-[10px]">({n.data?.kind})</span>
                    </li>
                  ))}
                  {neighbours.outgoing.length > 10 && (
                    <li className="text-[10px] text-[var(--text-dim)]">+{neighbours.outgoing.length - 10} more</li>
                  )}
                </ul>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  )
}

function DrawerRow({
  label,
  value,
  highlight,
}: {
  label: string
  value: string | number | undefined | null
  highlight?: boolean
}) {
  return (
    <div className="flex justify-between">
      <span className="text-[var(--text-muted)]">{label}</span>
      <span className={cn('font-mono font-semibold', highlight ? 'text-red-400' : 'text-[var(--text-primary)]')}>
        {value ?? 'N/A'}
      </span>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Simulation Results Drawer                                        */
/* ------------------------------------------------------------------ */

interface SimulationResultState {
  type: 'failure' | 'scale' | 'migration'
  serviceName: string
  namespace: string
  loading: boolean
  failureResult?: FailureResponse | null
  scaleResult?: ScaleResponse | null
  scaleDirection?: 'up' | 'down'
  migrationTarget?: string
  migrationFeasible?: boolean
  migrationReason?: string
  drillRunId?: string
  drillStatus?: string
  error?: string
}

function SimulationResultsDrawer({
  state,
  onClose,
  onRunDrill,
}: {
  state: SimulationResultState
  onClose: () => void
  onRunDrill?: (serviceName: string, namespace: string) => void
}) {
  return (
    <div className="absolute top-4 left-4 z-30 w-96 bg-[var(--surface-contrast)] backdrop-blur-md border border-[var(--border-strong)] rounded-lg shadow-2xl max-h-[calc(100%-2rem)] overflow-hidden flex flex-col animate-in fade-in slide-in-from-left duration-200">
      {/* Header */}
      <div className="p-3 border-b border-[var(--border)] flex justify-between items-start gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {state.type === 'failure' && <Zap className="w-4 h-4 text-red-400 shrink-0" />}
          {state.type === 'scale' && (state.scaleDirection === 'up' ? <ArrowUp className="w-4 h-4 text-green-400 shrink-0" /> : <ArrowDown className="w-4 h-4 text-amber-400 shrink-0" />)}
          {state.type === 'migration' && <Move className="w-4 h-4 text-cyan-400 shrink-0" />}
          <div className="min-w-0">
            <div className="font-semibold text-sm text-[var(--text-primary)] truncate">
              {state.type === 'failure' && 'Failure Simulation'}
              {state.type === 'scale' && `Scale ${state.scaleDirection === 'up' ? 'Up' : 'Down'} Simulation`}
              {state.type === 'migration' && 'Migration Simulation'}
            </div>
            <div className="text-[10px] text-[var(--text-muted)]">{state.serviceName}</div>
          </div>
        </div>
        <button type="button" onClick={onClose} className="shrink-0 p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Body */}
      <div className="overflow-y-auto flex-1 p-3 space-y-3 text-xs">
        {/* Loading */}
        {state.loading && (
          <div className="flex items-center gap-2 py-8 justify-center text-[var(--text-muted)]">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Running simulation…</span>
          </div>
        )}

        {/* Error */}
        {state.error && (
          <div className="rounded-md bg-red-500/10 border border-red-500/30 p-3 text-red-400">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span className="font-semibold">Simulation failed</span>
            </div>
            <p className="text-[11px]">{state.error}</p>
          </div>
        )}

        {/* Failure results */}
        {state.type === 'failure' && state.failureResult && !state.loading && (
          <>
            <div className="rounded-md bg-red-500/10 border border-red-500/30 p-3">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                <span className="font-semibold text-red-400">Impact Summary</span>
              </div>
              <div className="space-y-1.5">
                <DrawerRow
                  label="Traffic lost"
                  value={state.failureResult.totalLostTrafficRps != null
                    ? `${state.failureResult.totalLostTrafficRps.toFixed(1)} req/s`
                    : 'Unknown'}
                  highlight={!!state.failureResult.totalLostTrafficRps && state.failureResult.totalLostTrafficRps > 0}
                />
                <DrawerRow
                  label="Services affected"
                  value={
                    ((state.failureResult.affectedCallers?.length ?? 0) +
                    (state.failureResult.affectedDownstream?.length ?? 0)) || 'None'
                  }
                />
                <DrawerRow
                  label="Unreachable services"
                  value={state.failureResult.unreachableServices?.length ?? 0}
                  highlight={(state.failureResult.unreachableServices?.length ?? 0) > 0}
                />
                <DrawerRow label="Confidence" value={state.failureResult.confidence ?? 'N/A'} />
              </div>
            </div>

            {state.failureResult.explanation && (
              <div className="text-[11px] text-[var(--text-muted)] bg-[var(--surface-soft)] rounded-md p-2">
                {state.failureResult.explanation}
              </div>
            )}

            {(state.failureResult.affectedCallers?.length ?? 0) > 0 && (
              <section>
                <h4 className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-dim)] mb-1">Affected Services</h4>
                <ul className="space-y-0.5">
                  {state.failureResult.affectedCallers!.slice(0, 8).map((c, i) => (
                    <li key={i} className="flex items-center justify-between text-[11px]">
                      <span className="text-[var(--text-primary)]">{c.serviceId ?? c.name ?? 'Unknown'}</span>
                      <span className="text-red-400 font-mono">{c.lostTrafficRps != null ? `-${c.lostTrafficRps.toFixed(1)} rps` : ''}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {(state.failureResult.recommendations?.length ?? 0) > 0 && (
              <section>
                <h4 className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-dim)] mb-1">Recommendations</h4>
                <ul className="space-y-1">
                  {state.failureResult.recommendations!.slice(0, 5).map((r, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-[11px]">
                      <CheckCircle className="w-3 h-3 text-green-400 mt-0.5 shrink-0" />
                      <span className="text-[var(--text-primary)]">{r.action ?? r.description ?? String(r)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Run drill button */}
            {onRunDrill && (
              <button
                type="button"
                onClick={() => onRunDrill(state.serviceName, state.namespace)}
                className="w-full mt-2 rounded-md bg-red-500/20 border border-red-500/40 px-3 py-2 text-xs font-semibold text-red-400 hover:bg-red-500/30 transition-colors flex items-center justify-center gap-2"
              >
                <FlaskConical className="w-3.5 h-3.5" />
                Run Chaos Drill on {state.serviceName}
              </button>
            )}
          </>
        )}

        {/* Scale results */}
        {state.type === 'scale' && state.scaleResult && !state.loading && (
          <>
            <div className={cn(
              'rounded-md p-3 border',
              state.scaleDirection === 'up'
                ? 'bg-green-500/10 border-green-500/30'
                : 'bg-amber-500/10 border-amber-500/30'
            )}>
              <div className="flex items-center gap-2 mb-2">
                {state.scaleDirection === 'up'
                  ? <ArrowUp className="w-3.5 h-3.5 text-green-400" />
                  : <ArrowDown className="w-3.5 h-3.5 text-amber-400" />}
                <span className={cn('font-semibold', state.scaleDirection === 'up' ? 'text-green-400' : 'text-amber-400')}>
                  Scale {state.scaleDirection === 'up' ? 'Up' : 'Down'} Impact
                </span>
              </div>
              <div className="space-y-1.5">
                <DrawerRow label="Direction" value={state.scaleResult.scalingDirection ?? state.scaleDirection} />
                {state.scaleResult.latencyEstimate && (
                  <>
                    <DrawerRow label="Current speed" value={state.scaleResult.latencyEstimate.baselineMs != null ? `${state.scaleResult.latencyEstimate.baselineMs.toFixed(0)}ms` : 'N/A'} />
                    <DrawerRow label="Projected speed" value={state.scaleResult.latencyEstimate.projectedMs != null ? `${state.scaleResult.latencyEstimate.projectedMs.toFixed(0)}ms` : 'N/A'} />
                    <DrawerRow
                      label="Change"
                      value={state.scaleResult.latencyEstimate.deltaMs != null ? `${state.scaleResult.latencyEstimate.deltaMs > 0 ? '+' : ''}${state.scaleResult.latencyEstimate.deltaMs.toFixed(0)}ms` : 'N/A'}
                      highlight={state.scaleResult.latencyEstimate.deltaMs != null && state.scaleResult.latencyEstimate.deltaMs > 0}
                    />
                  </>
                )}
                <DrawerRow label="Confidence" value={state.scaleResult.confidence ?? 'N/A'} />
              </div>
            </div>

            {state.scaleResult.explanation && (
              <div className="text-[11px] text-[var(--text-muted)] bg-[var(--surface-soft)] rounded-md p-2">
                {state.scaleResult.explanation}
              </div>
            )}

            {(state.scaleResult.warnings?.length ?? 0) > 0 && (
              <section>
                <h4 className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-dim)] mb-1">Warnings</h4>
                <ul className="space-y-1">
                  {state.scaleResult.warnings!.map((w, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-[11px]">
                      <AlertTriangle className="w-3 h-3 text-amber-400 mt-0.5 shrink-0" />
                      <span className="text-[var(--text-primary)]">{w}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {(state.scaleResult.recommendations?.length ?? 0) > 0 && (
              <section>
                <h4 className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-dim)] mb-1">Recommendations</h4>
                <ul className="space-y-1">
                  {state.scaleResult.recommendations!.slice(0, 5).map((r, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-[11px]">
                      <CheckCircle className="w-3 h-3 text-green-400 mt-0.5 shrink-0" />
                      <span className="text-[var(--text-primary)]">{r.action ?? r.description ?? String(r)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}

        {/* Migration results */}
        {state.type === 'migration' && !state.loading && state.migrationTarget && (
          <>
            <div className={cn(
              'rounded-md p-3 border',
              state.migrationFeasible
                ? 'bg-cyan-500/10 border-cyan-500/30'
                : 'bg-red-500/10 border-red-500/30'
            )}>
              <div className="flex items-center gap-2 mb-2">
                <Move className={cn('w-3.5 h-3.5', state.migrationFeasible ? 'text-cyan-400' : 'text-red-400')} />
                <span className={cn('font-semibold', state.migrationFeasible ? 'text-cyan-400' : 'text-red-400')}>
                  {state.migrationFeasible ? 'Migration Feasible' : 'Migration Not Recommended'}
                </span>
              </div>
              <div className="space-y-1.5">
                <DrawerRow label="Target node" value={state.migrationTarget} />
                {state.migrationReason && (
                  <div className="text-[11px] text-[var(--text-muted)] mt-1">{state.migrationReason}</div>
                )}
              </div>
            </div>

            {/* Show failure impact during migration */}
            {state.failureResult && (
              <div className="rounded-md bg-amber-500/10 border border-amber-500/30 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                  <span className="font-semibold text-amber-400">Impact During Migration</span>
                </div>
                <div className="text-[11px] text-[var(--text-muted)] mb-1.5">
                  While moving, the service will briefly be unavailable:
                </div>
                <div className="space-y-1.5">
                  <DrawerRow
                    label="Traffic lost temporarily"
                    value={state.failureResult.totalLostTrafficRps != null ? `${state.failureResult.totalLostTrafficRps.toFixed(1)} req/s` : 'Minimal'}
                    highlight={!!state.failureResult.totalLostTrafficRps && state.failureResult.totalLostTrafficRps > 10}
                  />
                  <DrawerRow
                    label="Services affected"
                    value={
                      ((state.failureResult.affectedCallers?.length ?? 0) +
                      (state.failureResult.affectedDownstream?.length ?? 0)) || 'None'
                    }
                  />
                </div>
              </div>
            )}
          </>
        )}

        {/* Drill status */}
        {state.drillRunId && (
          <div className="rounded-md bg-purple-500/10 border border-purple-500/30 p-3">
            <div className="flex items-center gap-2 mb-1">
              <FlaskConical className="w-3.5 h-3.5 text-purple-400" />
              <span className="font-semibold text-purple-400">Drill Status</span>
            </div>
            <div className="space-y-1">
              <DrawerRow label="Run ID" value={state.drillRunId} />
              <DrawerRow label="Status" value={state.drillStatus ?? 'Running…'} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Export helpers                                                    */
/* ------------------------------------------------------------------ */

/** Export the canvas as a PNG by extracting the underlying <canvas> element */
function exportCanvasAsPng(containerRef: React.RefObject<HTMLDivElement | null>) {
  const container = containerRef.current
  if (!container) { toast.error('Canvas not available'); return }
  const canvas = container.querySelector('canvas')
  if (!canvas) { toast.error('No canvas element found'); return }

  try {
    const dataUrl = canvas.toDataURL('image/png')
    const link = document.createElement('a')
    link.download = `cluster-topology-${new Date().toISOString().slice(0, 10)}.png`
    link.href = dataUrl
    link.click()
    toast.success('PNG exported')
  } catch {
    toast.error('Export failed — canvas may be tainted')
  }
}

/** Generate YAML representation of the current topology and copy to clipboard */
function copyTopologyYaml(
  nodes: ReagraphNode[],
  edges: ReagraphEdge[],
) {
  const lines: string[] = ['# Cluster Topology Snapshot', `# Generated: ${new Date().toISOString()}`, '']

  // Nodes grouped by kind
  const byKind = new Map<string, ReagraphNode[]>()
  nodes.forEach((n) => {
    const k = n.data?.kind ?? 'unknown'
    if (!byKind.has(k)) byKind.set(k, [])
    byKind.get(k)!.push(n)
  })

  for (const [kind, kNodes] of byKind) {
    lines.push(`${kind}s:`)
    kNodes.forEach((n) => {
      lines.push(`  - name: ${n.data?.name ?? n.label}`)
      if (n.data?.namespace) lines.push(`    namespace: ${n.data.namespace}`)
      if (n.data?.availability != null) lines.push(`    availability: ${(n.data.availability * 100).toFixed(1)}%`)
      if (n.data?.podCount != null) lines.push(`    podCount: ${n.data.podCount}`)
      if (n.data?.rps != null) lines.push(`    rps: ${n.data.rps.toFixed(1)}`)
      if (n.data?.errorRate != null) lines.push(`    errorRate: ${(n.data.errorRate * 100).toFixed(2)}%`)
      if (n.data?.openIncidents > 0) lines.push(`    openIncidents: ${n.data.openIncidents}`)
    })
    lines.push('')
  }

  // Dependency edges
  const depEdges = edges.filter((e) => e.id.startsWith('dep::'))
  if (depEdges.length > 0) {
    lines.push('dependencies:')
    depEdges.forEach((e) => {
      const src = typeof e.source === 'string' ? e.source.replace('svc::', '') : ''
      const tgt = typeof e.target === 'string' ? e.target.replace('svc::', '') : ''
      const rps = e.data?.rps != null ? ` # ${e.data.rps.toFixed(0)} rps` : ''
      lines.push(`  - ${src} -> ${tgt}${rps}`)
    })
    lines.push('')
  }

  const yaml = lines.join('\n')
  navigator.clipboard.writeText(yaml)
    .then(() => toast.success('Topology YAML copied to clipboard'))
    .catch(() => toast.error('Failed to copy to clipboard'))
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                    */
/* ------------------------------------------------------------------ */

export default function ClusterTopologyMap() {
  const { resolvedTheme, setTheme } = useTheme()
  const navigate = useNavigate()
  const {
    services,
    allNodes,
    loading,
    dependencyEdges,
    serviceMetrics,
    refetch,
  } = useServicesWithPlacement()

  /* Track active drill polling intervals so we can clean up */
  const drillPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => {
    return () => {
      if (drillPollRef.current) clearInterval(drillPollRef.current)
    }
  }, [])

  /**
   * Start polling the graph data to pick up cluster changes from a drill.
   * Polls every 3 s for up to `durationMs` (default 90 s), then stops.
   * Also polls drill status and updates simulationState accordingly.
   */
  const startDrillRefreshPolling = useCallback((drillRunId?: string, durationMs = 90_000) => {
    // Clear any prior polling
    if (drillPollRef.current) clearInterval(drillPollRef.current)

    const started = Date.now()
    drillPollRef.current = setInterval(async () => {
      // Stop after duration
      if (Date.now() - started > durationMs) {
        if (drillPollRef.current) clearInterval(drillPollRef.current)
        drillPollRef.current = null
        return
      }

      // Refetch graph data so topology map updates
      await refetch()

      // If we have a drill ID, poll its status too
      if (drillRunId) {
        try {
          const run = await getDrillRun(drillRunId)
          setSimulationState((prev) => {
            if (!prev || prev.drillRunId !== drillRunId) return prev
            return { ...prev, drillStatus: run.status }
          })
          // Stop polling once drill is completed or aborted
          if (['completed', 'aborted', 'failed'].includes(run.status.toLowerCase())) {
            // One final refetch after a short delay to capture post-rollback state
            setTimeout(() => refetch(), 3000)
            if (drillPollRef.current) clearInterval(drillPollRef.current)
            drillPollRef.current = null
          }
        } catch {
          // Drill status fetch failed — continue polling graph data
        }
      }
    }, 3000)
  }, [refetch])

  /* Fetch open alerts grouped by service (lightweight polling every 30 s) */
  const [alertRollups, setAlertRollups] = useState<Map<string, ServiceRollup>>(new Map())
  useEffect(() => {
    let active = true
    const fetch = () => {
      bffApi.getServices()
        .then(({ services: svcRollups }) => {
          if (!active) return
          const map = new Map<string, ServiceRollup>()
          svcRollups.forEach((r) => map.set(r.service, r))
          setAlertRollups(map)
        })
        .catch(() => { /* ignore — alerts are non-critical */ })
    }
    fetch()
    const timer = setInterval(fetch, 30_000)
    return () => { active = false; clearInterval(timer) }
  }, [])

  const graphRef = useRef<GraphCanvasRef | null>(null)
  const canvasContainerRef = useRef<HTMLDivElement | null>(null)
  const [hoveredNode, setHoveredNode] = useState<ReagraphNode | null>(null)
  const [mousePosition, setMousePosition] = useState<{ x: number; y: number } | null>(null)
  const [isNodeHovered, setIsNodeHovered] = useState(false)
  const [selections, setSelections] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState(() => new URLSearchParams(window.location.search).get('q') ?? '')
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const [inspectedNode, setInspectedNode] = useState<ReagraphNode | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)

  /* ---- Simulation / drill / migration state ---- */
  const [simulationState, setSimulationState] = useState<SimulationResultState | null>(null)
  const [migrationMode, setMigrationMode] = useState<{ serviceName: string; namespace: string } | null>(null)

  /* ---- Shareable URL: sync filters ↔ search params ---- */
  const [searchParams, setSearchParams] = useSearchParams()
  const [filters, setFilters] = useState<TopologyFilters>(() => ({
    namespace: searchParams.get('ns') ?? '',
    health: (searchParams.get('health') as HealthFilter) || 'all',
    depthOrigin: searchParams.get('depthOrigin') ?? null,
    depthHops: parseInt(searchParams.get('depthHops') ?? '0', 10) || 0,
  }))

  /* Write filter state back to URL (replaces, no history push) */
  useEffect(() => {
    const p = new URLSearchParams()
    if (filters.namespace) p.set('ns', filters.namespace)
    if (filters.health !== 'all') p.set('health', filters.health)
    if (filters.depthOrigin) p.set('depthOrigin', filters.depthOrigin)
    if (filters.depthHops > 0) p.set('depthHops', String(filters.depthHops))
    if (searchQuery.trim()) p.set('q', searchQuery.trim())
    setSearchParams(p, { replace: true })
  }, [filters, searchQuery, setSearchParams])

  /* Path tracing: select two service nodes to highlight shortest path */
  const [pathTraceMode, setPathTraceMode] = useState(false)
  const [pathTraceNodes, setPathTraceNodes] = useState<[string | null, string | null]>([null, null])

  /* Pulse animation is handled via CSS to avoid re-layouting the graph */

  const handleFilterChange = useCallback((patch: Partial<TopologyFilters>) => {
    setFilters((prev) => ({ ...prev, ...patch }))
  }, [])

  /* Compute unique namespaces */
  const namespaces = useMemo(() => {
    const ns = new Set<string>()
    services.forEach((svc) => { if (svc.namespace) ns.add(svc.namespace) })
    return Array.from(ns).sort()
  }, [services])

  /* Auto-zoom to fit all nodes on initial load */
  const hasAutoZoomed = useRef(false)
  useEffect(() => {
    if (hasAutoZoomed.current || !graphRef.current) return
    if (gNodes.length === 0) return
    // Small delay to let the graph layout settle before fitting
    const timer = setTimeout(() => {
      graphRef.current?.fitNodesInView?.()
      hasAutoZoomed.current = true
    }, 600)
    return () => clearTimeout(timer)
  })

  const graphTheme = useMemo(() => createTopologyTheme(resolvedTheme === 'dark'), [resolvedTheme])

  const { nodes: gNodes, edges: gEdges } = useMemo(
    () => buildTopologyGraph(services, allNodes, dependencyEdges, filters, serviceMetrics, alertRollups),
    [services, allNodes, dependencyEdges, filters, serviceMetrics, alertRollups]
  )

  /** BFS shortest path between two node IDs across all edges */
  const tracedPath = useMemo(() => {
    const [startId, endId] = pathTraceNodes
    if (!startId || !endId) return new Set<string>()

    const adj = new Map<string, string[]>()
    gEdges.forEach((e) => {
      const s = typeof e.source === 'string' ? e.source : ''
      const t = typeof e.target === 'string' ? e.target : ''
      if (!adj.has(s)) adj.set(s, [])
      if (!adj.has(t)) adj.set(t, [])
      adj.get(s)!.push(t)
      adj.get(t)!.push(s)
    })

    const visited = new Set<string>()
    const parent = new Map<string, string | null>()
    const queue = [startId]
    visited.add(startId)
    parent.set(startId, null)
    let found = false

    while (queue.length > 0 && !found) {
      const cur = queue.shift()!
      for (const neighbor of adj.get(cur) ?? []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor)
          parent.set(neighbor, cur)
          if (neighbor === endId) { found = true; break }
          queue.push(neighbor)
        }
      }
    }

    if (!found) return new Set<string>()

    const pathIds = new Set<string>()
    let cur: string | null = endId
    while (cur != null) {
      pathIds.add(cur)
      cur = parent.get(cur) ?? null
    }
    return pathIds
  }, [pathTraceNodes, gEdges])

  /** Edge IDs on the traced path */
  const tracedEdgeIds = useMemo(() => {
    if (tracedPath.size < 2) return new Set<string>()
    const edgeIds = new Set<string>()
    gEdges.forEach((e) => {
      const s = typeof e.source === 'string' ? e.source : ''
      const t = typeof e.target === 'string' ? e.target : ''
      if (tracedPath.has(s) && tracedPath.has(t)) edgeIds.add(e.id)
    })
    return edgeIds
  }, [tracedPath, gEdges])

  /* Search: compute matched IDs, then override fill to amber for matches */
  const searchMatchIds = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return new Set<string>()
    const matched = new Set<string>()
    gNodes.forEach((n) => {
      const name: string = n.data?.name ?? n.label ?? ''
      if (name.toLowerCase().includes(q)) matched.add(n.id)
    })
    return matched
  }, [searchQuery, gNodes])

  const displayNodes = useMemo(() => {
    return gNodes.map((n) => {
      let patched = n
      /* Search highlight */
      if (searchMatchIds.size > 0 && searchMatchIds.has(n.id)) {
        patched = { ...patched, fill: '#FBBF24' }
      }
      /* Path-trace highlight: cyan for nodes on traced path */
      if (tracedPath.size > 0 && tracedPath.has(n.id)) {
        patched = { ...patched, fill: '#22d3ee' } // cyan-400
      }
      /* High error rate: use a static red fill (no pulse to avoid re-layout) */
      if (n.data?.highErrorRate) {
        patched = { ...patched, fill: '#ef4444', size: 44 }
      }
      /* Alert badge: add subLabel count */
      if (n.data?.openIncidents > 0) {
        const badgeText = `⚠ ${n.data.openIncidents} alert${n.data.openIncidents > 1 ? 's' : ''}`
        patched = { ...patched, subLabel: badgeText }
        if (n.data.criticalAlerts > 0) {
          patched = { ...patched, fill: '#ef4444' }
        }
      }
      return patched
    })
  }, [gNodes, searchMatchIds, tracedPath])

  const displayEdges = useMemo(() => {
    if (tracedEdgeIds.size === 0) return gEdges
    return gEdges.map((e) =>
      tracedEdgeIds.has(e.id) ? { ...e, fill: '#22d3ee', size: (e.size ?? 1) + 3 } : e
    )
  }, [gEdges, tracedEdgeIds])

  const activeSelections = useMemo(() => {
    // Hover neighborhood takes priority; else path trace; else search matches
    if (isNodeHovered) return selections
    if (tracedPath.size > 0) return Array.from(tracedPath)
    if (searchMatchIds.size > 0) return Array.from(searchMatchIds)
    return []
  }, [isNodeHovered, selections, searchMatchIds, tracedPath])

  /* Summary counts */
  const summary = useMemo(() => {
    let k8sNodes = 0
    let svcs = 0
    let pods = 0
    let deps = 0
    gNodes.forEach((n) => {
      const kind = n.data?.kind
      if (kind === 'node') k8sNodes++
      else if (kind === 'service') svcs++
      else if (kind === 'pod') pods++
    })
    gEdges.forEach((e) => {
      if (e.id.startsWith('dep::')) deps++
    })
    return { k8sNodes, svcs, pods, deps }
  }, [gNodes, gEdges])

  /* Highlight only the hovered node (not its neighbors) */
  const handlePointerOver = (node: ReagraphNode) => {
    setHoveredNode(node)
    setIsNodeHovered(true)
    setSelections([node.id])
  }

  const handlePointerOut = () => {
    setHoveredNode(null)
    setIsNodeHovered(false)
    setSelections([])
  }

  /* ---- Simulate Failure handler ---- */
  const handleSimulateFailure = useCallback(async (serviceName: string, namespace: string) => {
    setSimulationState({ type: 'failure', serviceName, namespace, loading: true })
    try {
      const result = await simulateFailure({ serviceId: namespace ? `${namespace}:${serviceName}` : serviceName, maxDepth: 3 })
      setSimulationState((prev) => prev ? { ...prev, loading: false, failureResult: result } : null)
      toast.success(`Failure simulation complete for ${serviceName}`)
      // Refresh topology to reflect any real cluster state changes
      await refetch()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Simulation failed'
      setSimulationState((prev) => prev ? { ...prev, loading: false, error: msg } : null)
      toast.error(`Failure simulation failed: ${msg}`)
    }
  }, [refetch])

  /* ---- Run Drill handler ---- */
  const handleRunDrill = useCallback(async (serviceName: string, namespace: string) => {
    const toastId = toast.loading(`Planning drill for ${serviceName}…`)
    try {
      // Plan the drill
      const drillPlan = await planDrill({
        type: 'ServiceShutdown',
        target: serviceName,
        config: { replicas: 0, gracePeriod: 30, namespace: namespace || 'onlineboutique' },
      })
      toast.loading(`Running drill ${drillPlan.id}…`, { id: toastId })
      setSimulationState((prev) => prev
        ? { ...prev, drillRunId: drillPlan.id, drillStatus: 'planned' }
        : { type: 'failure', serviceName, namespace, loading: false, drillRunId: drillPlan.id, drillStatus: 'planned' }
      )

      // Execute the drill
      const runResult = await runDrill(drillPlan.id)
      setSimulationState((prev) => prev ? { ...prev, drillStatus: runResult.status } : null)
      toast.success(`Drill started: ${runResult.status}`, { id: toastId })

      // Start polling to reflect drill effects on the topology map
      startDrillRefreshPolling(drillPlan.id)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      toast.error(`Drill failed: ${msg}`, { id: toastId })
      setSimulationState((prev) => prev ? { ...prev, drillStatus: `Error: ${msg}` } : null)
    }
  }, [startDrillRefreshPolling])

  /* ---- Scale Service handler ---- */
  const handleScaleService = useCallback(async (serviceName: string, direction: 'up' | 'down', currentPods: number, namespace: string) => {
    const newPods = direction === 'up' ? currentPods + 1 : Math.max(currentPods - 1, 1)
    if (direction === 'down' && currentPods <= 1) {
      toast.error('Cannot scale below 1 pod')
      return
    }
    setSimulationState({ type: 'scale', serviceName, namespace, loading: true, scaleDirection: direction })
    try {
      const result = await simulateScale({
        serviceId: serviceName,
        currentPods,
        newPods,
        latencyMetric: 'p95',
        maxDepth: 3,
      })
      setSimulationState((prev) => prev ? { ...prev, loading: false, scaleResult: result } : null)
      toast.success(`Scale ${direction} simulation complete: ${currentPods} → ${newPods} pods`)
      // Refresh topology to pick up any concurrent cluster changes
      await refetch()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Scale simulation failed'
      setSimulationState((prev) => prev ? { ...prev, loading: false, error: msg } : null)
      toast.error(`Scale simulation failed: ${msg}`)
    }
  }, [refetch])

  /* ---- Scale Drill handler (actually scales via K8s) ---- */
  const handleScaleDrill = useCallback(async (serviceName: string, direction: 'up' | 'down', currentPods: number, namespace: string) => {
    const newPods = direction === 'up' ? currentPods + 1 : Math.max(currentPods - 1, 1)
    if (direction === 'down' && currentPods <= 1) {
      toast.error('Cannot scale below 1 pod')
      return
    }
    const drillType = direction === 'up' ? 'PodScaleUp' : 'PodScaleDown'
    const toastId = toast.loading(`Planning ${direction} drill for ${serviceName}…`)
    setSimulationState({ type: 'scale', serviceName, namespace, loading: true, scaleDirection: direction })
    try {
      const drillPlan = await planDrill({
        type: drillType,
        target: serviceName,
        config: { replicas: newPods, gracePeriod: 30, namespace: namespace || 'onlineboutique' },
      })
      toast.loading(`Executing scale ${direction} drill ${drillPlan.id}…`, { id: toastId })
      setSimulationState((prev) => prev
        ? { ...prev, drillRunId: drillPlan.id, drillStatus: 'planned' }
        : { type: 'scale', serviceName, namespace, loading: true, scaleDirection: direction, drillRunId: drillPlan.id, drillStatus: 'planned' }
      )

      const runResult = await runDrill(drillPlan.id)
      setSimulationState((prev) => prev
        ? { ...prev, loading: false, drillStatus: runResult.status }
        : null
      )
      toast.success(`Scale ${direction} drill started: ${currentPods} → ${newPods} pods`, { id: toastId })

      // Start polling to reflect the scale drill's effect on the topology map.
      // Initial refetch after 3 s to give k8s time to create / terminate pods,
      // then every 3 s thereafter so the map stays in sync while the drill is active.
      startDrillRefreshPolling(drillPlan.id)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Scale drill failed'
      setSimulationState((prev) => prev ? { ...prev, loading: false, error: msg, drillStatus: `Error: ${msg}` } : null)
      toast.error(`Scale drill failed: ${msg}`, { id: toastId })
    }
  }, [startDrillRefreshPolling])

  /* ---- Migrate Service handler (enter migration mode) ---- */
  const handleMigrateService = useCallback((serviceName: string, namespace: string) => {
    setMigrationMode({ serviceName, namespace })
    toast('Click a target node to simulate migration', { icon: '🔀', duration: 4000 })
  }, [])

  /* ---- Complete migration when a node is clicked in migration mode ---- */
  const completeMigration = useCallback(async (targetNodeName: string) => {
    if (!migrationMode) return
    const { serviceName } = migrationMode
    setMigrationMode(null)

    // Find the target K8s node resources
    const targetNode = allNodes.find((n) => n.name === targetNodeName)
    const cpuAvail = targetNode?.resources?.cpu ? (100 - (targetNode.resources.cpu.usagePercent ?? 0)) : 0
    const ramTotal = targetNode?.resources?.ram?.totalMB ?? 0
    const ramUsed = targetNode?.resources?.ram?.usedMB ?? 0
    const ramAvail = ramTotal - ramUsed

    // Find current service resource usage from pod data
    const svc = services.find((s) => s.name === serviceName)
    const pods = svc?.placement?.nodes?.flatMap((np) => np.pods ?? []) ?? []
    const avgCpuPct = pods.length > 0 ? pods.reduce((s, p) => s + (p.cpuUsagePercent ?? 0), 0) / pods.length : 10
    const avgRamMB = pods.length > 0 ? pods.reduce((s, p) => s + (p.ramUsedMB ?? 0), 0) / pods.length : 128

    // Check feasibility
    const cpuFeasible = cpuAvail > avgCpuPct * 0.5  // Needs at least 50% of what pods use
    const ramFeasible = ramAvail > avgRamMB
    const feasible = cpuFeasible && ramFeasible

    let reason = ''
    if (feasible) {
      reason = `Target node has ${cpuAvail.toFixed(0)}% CPU available and ${friendlyMemory(ramAvail)} free memory — enough to host this service.`
    } else {
      const issues: string[] = []
      if (!cpuFeasible) issues.push(`not enough CPU (only ${cpuAvail.toFixed(0)}% free)`)
      if (!ramFeasible) issues.push(`not enough memory (only ${friendlyMemory(ramAvail)} free)`)
      reason = `Target node may not have enough resources: ${issues.join(', ')}.`
    }

    setSimulationState({
      type: 'migration',
      serviceName,
      namespace: migrationMode.namespace,
      loading: true,
      migrationTarget: targetNodeName,
      migrationFeasible: feasible,
      migrationReason: reason,
    })

    // Also run failure simulation to show migration impact
    try {
      const failureResult = await simulateFailure({ serviceId: serviceName, maxDepth: 2 })
      setSimulationState((prev) => prev ? { ...prev, loading: false, failureResult } : null)
    } catch {
      setSimulationState((prev) => prev ? { ...prev, loading: false } : null)
    }
  }, [migrationMode, allNodes, services])

  /* ---- Handle node drag end for drag-and-drop migration ---- */
  const handleNodeDragged = useCallback((node: InternalGraphNode) => {
    // Only trigger migration for service nodes
    if (node.data?.kind !== 'service') return

    const serviceName = node.data?.name
    if (!serviceName) return

    // Since reagraph doesn't expose reliable position access for all nodes,
    // we enter migration mode so the user can click the target node.
    const svcName = node.data?.name as string
    const namespace = node.data?.namespace as string || ''
    setMigrationMode({ serviceName: svcName, namespace })
    toast('Service picked up! Click a target node to complete migration', { icon: '🔀', duration: 4000 })
  }, [])

  /* Double-click to set depth origin */
  const handleNodeDoubleClick = useCallback((node: ReagraphNode) => {
    setFilters((prev) => ({
      ...prev,
      depthOrigin: node.id,
      depthHops: prev.depthHops || 3,
    }))
  }, [])

  /* Single-click to open inspect drawer (or pick path-trace endpoint or migration target) */
  const handleNodeClick = useCallback((node: ReagraphNode) => {
    // Migration mode: click a K8s node to complete migration
    if (migrationMode && node.data?.kind === 'node') {
      completeMigration(node.data.name)
      return
    }
    if (migrationMode && node.data?.kind !== 'node') {
      toast.error('Please click a Kubernetes node (blue) as the migration target')
      return
    }
    if (pathTraceMode) {
      setPathTraceNodes((prev) => {
        if (!prev[0]) return [node.id, null]
        if (prev[0] && !prev[1]) return [prev[0], node.id]
        return [node.id, null] // reset if both already set
      })
    } else {
      setInspectedNode(node)
    }
  }, [pathTraceMode, migrationMode, completeMigration])

  /* ---- Loading skeleton ---- */
  if (loading && gNodes.length === 0) {
    return (
      <TopologyShell>
        <div
          className="p-4 border-b border-[var(--border)] flex justify-between items-center bg-[var(--surface-soft)]"
          aria-busy="true"
        >
          <SkeletonBlock variant="line" className="h-7 w-52" />
          <SkeletonBlock variant="line" className="h-4 w-36" />
        </div>
        <div className="px-4 py-2 bg-[var(--surface-subtle)] border-b border-[var(--border)]">
          <SkeletonBlock variant="line" className="h-4 w-2/3" />
        </div>
        <div className="flex-1 p-4">
          <SkeletonBlock variant="card" className="h-full w-full rounded-lg" />
        </div>
      </TopologyShell>
    )
  }

  const hasData = gNodes.length > 0

  return (
    <TopologyShell>
      {/* Header */}
      <div className="px-4 py-3 border-b border-[var(--border)] flex flex-wrap items-center gap-3 bg-[var(--surface-soft)]">
        {/* Title */}
        <div className="flex items-center gap-2 shrink-0">
          <Network className="w-5 h-5 text-[var(--color-emerald-300)]" />
          <h3 className="text-lg font-medium text-[var(--text-primary)]">Cluster Topology</h3>
        </div>

        {/* Search input */}
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)]" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search nodes, services, pods…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-md border border-[var(--border)] bg-[var(--surface-subtle)] py-1.5 pl-8 pr-8 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--ring)] focus:ring-1 focus:ring-[var(--ring)]"
            aria-label="Search topology"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => { setSearchQuery(''); searchInputRef.current?.focus() }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Match badge */}
        {searchQuery.trim() && (
          <span className="shrink-0 rounded-full bg-amber-400/15 px-2 py-0.5 text-[11px] font-semibold text-amber-400">
            {searchMatchIds.size} match{searchMatchIds.size !== 1 ? 'es' : ''}
          </span>
        )}

        {/* Stats */}
        <div className="ml-auto text-xs text-[var(--text-dim)] flex items-center gap-3 shrink-0">
          <span>{summary.k8sNodes} nodes</span>
          <span className="text-[var(--border)]">·</span>
          <span>{summary.svcs} services</span>
          <span className="text-[var(--border)]">·</span>
          <span>{summary.pods} pods</span>
          <span className="text-[var(--border)]">·</span>
          <span>{summary.deps} dependencies</span>
        </div>
      </div>

      {/* Legend */}
      <div className="px-4 py-2 bg-[var(--surface-subtle)] border-b border-[var(--border)]">
        <Legend />
      </div>

      {/* Filter Bar */}
      <FilterBar namespaces={namespaces} filters={filters} onFilterChange={handleFilterChange} />

      {/* Canvas */}
      <div className="flex-1 relative">
        {hasData ? (
          <div
            ref={canvasContainerRef}
            className={`absolute inset-0 ${isNodeHovered ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'}`}
            onMouseMove={(e) => setMousePosition({ x: e.clientX, y: e.clientY })}
            onContextMenu={(e) => {
              if (hoveredNode) {
                e.preventDefault()
                setContextMenu({ node: hoveredNode, x: e.clientX, y: e.clientY })
              }
            }}
            role="presentation"
          >
            {/* Zoom controls & path-trace toggle */}
            <div className="absolute right-4 top-4 z-20 flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setPathTraceMode((m) => !m)
                  setPathTraceNodes([null, null])
                }}
                className={cn(
                  'neon-focus-ring interactive-soft rounded-md border p-2 text-[var(--text-secondary)]',
                  pathTraceMode
                    ? 'border-cyan-400 bg-cyan-400/10 text-cyan-400'
                    : 'border-[var(--border)] bg-[var(--surface-subtle)] hover:border-[var(--ring)] hover:text-[var(--text-primary)]'
                )}
                aria-label="Toggle path tracing"
                title="Path tracing — click two nodes to find shortest path"
              >
                <ArrowRightLeft className="h-4 w-4" />
              </button>
              <ZoomButton icon={Minus} label="Zoom out" onClick={() => graphRef.current?.zoomOut?.()} />
              <ZoomButton icon={Plus} label="Zoom in" onClick={() => graphRef.current?.zoomIn?.()} />
              <ZoomButton icon={LocateFixed} label="Fit graph" onClick={() => graphRef.current?.fitNodesInView?.()} />
              <span className="w-px h-5 bg-[var(--border)]" />
              <ZoomButton icon={Image} label="Export PNG" onClick={() => exportCanvasAsPng(canvasContainerRef)} />
              <ZoomButton icon={ClipboardCopy} label="Copy YAML" onClick={() => copyTopologyYaml(gNodes, gEdges)} />
              <span className="w-px h-5 bg-[var(--border)]" />
              <ZoomButton
                icon={resolvedTheme === 'dark' ? Sun : Moon}
                label={resolvedTheme === 'dark' ? 'Light mode' : 'Dark mode'}
                onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
              />
            </div>

            {/* Path-trace status bar */}
            {pathTraceMode && (
              <div className="absolute left-4 top-4 z-20 rounded-lg bg-cyan-900/80 border border-cyan-400/50 px-3 py-2 text-xs text-cyan-200 flex items-center gap-2">
                <ArrowRightLeft className="h-3.5 w-3.5 text-cyan-400" />
                {!pathTraceNodes[0]
                  ? 'Click source node…'
                  : !pathTraceNodes[1]
                    ? 'Click target node…'
                    : tracedPath.size > 0
                      ? `Path found: ${tracedPath.size} hops`
                      : 'No path found'}
                {(pathTraceNodes[0] || pathTraceNodes[1]) && (
                  <button
                    type="button"
                    onClick={() => setPathTraceNodes([null, null])}
                    className="ml-1 underline hover:text-white"
                  >
                    Reset
                  </button>
                )}
              </div>
            )}

            {/* Migration mode status bar */}
            {migrationMode && (
              <div className="absolute left-4 top-14 z-20 rounded-lg bg-purple-900/80 border border-purple-400/50 px-3 py-2 text-xs text-purple-200 flex items-center gap-2">
                <Move className="h-3.5 w-3.5 text-purple-400" />
                <span>Migrating <strong>{migrationMode.serviceName}</strong> — click a target node (blue)</span>
                <button
                  type="button"
                  onClick={() => setMigrationMode(null)}
                  className="ml-1 underline hover:text-white"
                >
                  Cancel
                </button>
              </div>
            )}

            <GraphCanvas
              ref={graphRef}
              nodes={displayNodes}
              edges={displayEdges}
              selections={activeSelections}
              layoutType="forceDirected2d"
              labelType="all"
              draggable={!!migrationMode}
              theme={graphTheme}
              onNodePointerOver={handlePointerOver}
              onNodePointerOut={handlePointerOut}
              onNodeClick={handleNodeClick}
              onNodeDoubleClick={handleNodeDoubleClick}
              onNodeDragged={handleNodeDragged}
              onCanvasClick={() => {
                setSelections([])
                setIsNodeHovered(false)
                setInspectedNode(null)
                setContextMenu(null)
                if (migrationMode) setMigrationMode(null)
                if (!searchQuery) setSelections([])
              }}
              minZoom={0.05}
              maxZoom={6}
            />

            {/* Tooltip */}
            {hoveredNode && mousePosition && (
              <TopologyTooltip node={hoveredNode} position={mousePosition} />
            )}

            {/* Inspect drawer */}
            {inspectedNode && (
              <TopologyDetailsDrawer
                node={inspectedNode}
                edges={gEdges}
                allGraphNodes={gNodes}
                onClose={() => setInspectedNode(null)}
              />
            )}

            {/* Context menu */}
            {contextMenu && (
              <TopologyContextMenu
                state={contextMenu}
                onClose={() => setContextMenu(null)}
                onInspect={(node) => setInspectedNode(node)}
                navigate={navigate}
                onSimulateFailure={handleSimulateFailure}
                onRunDrill={handleRunDrill}
                onScaleService={handleScaleService}
                onScaleDrill={handleScaleDrill}
                onMigrateService={handleMigrateService}
              />
            )}

            {/* Simulation results drawer */}
            {simulationState && (
              <SimulationResultsDrawer
                state={simulationState}
                onClose={() => setSimulationState(null)}
                onRunDrill={handleRunDrill}
              />
            )}
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center p-8 bg-[var(--graph-canvas)]">
            <EmptyState
              icon={<Network className="h-12 w-12 text-[var(--text-dim)]" />}
              message="No cluster topology data available"
              action={
                <span className="text-xs text-[var(--text-dim)] mt-2 block max-w-xs text-center">
                  Waiting for infrastructure data. Ensure the graph engine is connected and services
                  are deployed.
                </span>
              }
            />
          </div>
        )}
      </div>
    </TopologyShell>
  )
}

/* ------------------------------------------------------------------ */
/*  Shared UI pieces                                                  */
/* ------------------------------------------------------------------ */

function TopologyShell({
  children,
}: {
  readonly children: React.ReactNode
}) {
  return (
    <div className="bg-[var(--surface-solid)] border border-[var(--border)] rounded-lg overflow-hidden flex flex-col h-[640px]">
      {children}
    </div>
  )
}

function ZoomButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Plus
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="neon-focus-ring interactive-soft rounded-md border border-[var(--border)] bg-[var(--surface-subtle)] p-2 text-[var(--text-secondary)] hover:border-[var(--ring)] hover:text-[var(--text-primary)]"
      aria-label={label}
      title={label}
    >
      <Icon className="h-4 w-4" />
    </button>
  )
}
