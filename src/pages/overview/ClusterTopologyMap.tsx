import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import {
  GraphCanvas,
  GraphNode as ReagraphNode,
  GraphEdge as ReagraphEdge,
  type GraphCanvasRef,
} from 'reagraph'
import {
  Server,
  Package,
  Box,
  Cpu,
  HardDrive,
  TrendingUp,
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
} from 'lucide-react'
import EmptyState from '@/components/layout/EmptyState'
import SkeletonBlock from '@/components/common/SkeletonBlock'
import { cn } from '@/components/common/uiClassTokens'
import { useServicesWithPlacement } from '@/lib/useGraphStream'
import { useTheme } from '@/theme/useTheme'
import type { ServiceWithPlacement, NodeWithResources } from '@/lib/types'

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

  /* ---------- 2. K8s-node graph-nodes (skip control plane) ---------- */
  const visibleK8sNodes = Array.from(k8sNodeNames).filter(
    (name) => !isControlPlaneNode(name)
  )

  visibleK8sNodes.forEach((name) => {
    const infra = infraNodeMap.get(name)
    nodes.push({
      id: nodeId(name),
      label: name,
      fill: '#3b82f6', // blue-500
      size: 65,
      data: {
        kind: 'node' as EntityKind,
        name,
        cpu: infra?.resources?.cpu,
        ram: infra?.resources?.ram,
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
    if (!svc.placement?.nodes || svc.placement.nodes.length === 0) return

    svc.placement.nodes.forEach((np) => {
      if (!visibleNodeSet.has(np.node)) return

      /* Service node (add only once) */
      if (!addedServices.has(svc.name)) {
        addedServices.add(svc.name)
        const avail = typeof svc.availability === 'number' ? svc.availability : 1
        let fill = '#ef4444'
        if (avail >= 0.95) fill = '#10b981'
        else if (avail >= 0.8) fill = '#f59e0b'

        const metrics = serviceMetrics?.get(svc.name)
        const highErrorRate = (metrics?.errorRate ?? 0) > 0.05

        nodes.push({
          id: svcId(svc.name),
          label: svc.name,
          fill,
          size: 40,
          data: {
            kind: 'service' as EntityKind,
            name: svc.name,
            namespace: svc.namespace,
            podCount: svc.podCount,
            availability: avail,
            rps: metrics?.rps,
            errorRate: metrics?.errorRate,
            p95: metrics?.p95,
            highErrorRate,
          },
        })
      }

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
  const tooltipWidth = 260
  const tooltipHeight = 200
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
        {kind === 'node' && (
          <>
            <div className="flex items-center gap-2 mb-2">
              <Server className="w-4 h-4 text-blue-400" />
              <span className="font-semibold text-sm text-[var(--text-primary)]">{node.data.name}</span>
            </div>
            {node.data.cpu && (
              <div className="flex items-center gap-2">
                <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                <span className="text-[var(--text-muted)]">CPU:</span>
                <span className="font-mono font-semibold text-[var(--text-primary)]">
                  {node.data.cpu.usagePercent?.toFixed?.(1) ?? 'N/A'}% — {node.data.cpu.cores ?? '?'} cores
                </span>
              </div>
            )}
            {node.data.ram && (
              <div className="flex items-center gap-2">
                <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-[var(--text-muted)]">RAM:</span>
                <span className="font-mono font-semibold text-[var(--text-primary)]">
                  {(node.data.ram.usedMB / 1024).toFixed(1)} / {(node.data.ram.totalMB / 1024).toFixed(1)} GB
                </span>
              </div>
            )}
          </>
        )}

        {/* Service tooltip */}
        {kind === 'service' && (
          <>
            <div className="flex items-center gap-2 mb-2">
              <Package className="w-4 h-4 text-purple-400" />
              <div>
                <div className="font-semibold text-sm text-[var(--text-primary)]">{node.data.name}</div>
                <div className="text-[10px] text-[var(--text-muted)]">{node.data.namespace}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Box className="w-3.5 h-3.5 text-indigo-400" />
              <span className="text-[var(--text-muted)]">Pods:</span>
              <span className="font-mono font-semibold text-[var(--text-primary)]">{node.data.podCount ?? 0}</span>
            </div>
            <div className="flex items-center gap-2">
              <TrendingUp
                className={cn(
                  'w-3.5 h-3.5',
                  (node.data.availability ?? 0) >= 0.95 ? 'text-green-400' : 'text-red-400'
                )}
              />
              <span className="text-[var(--text-muted)]">Availability:</span>
              <span className="font-mono font-semibold text-[var(--text-primary)]">
                {((node.data.availability ?? 0) * 100).toFixed(1)}%
              </span>
            </div>
            {node.data.rps != null && (
              <div className="flex items-center gap-2">
                <Network className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-[var(--text-muted)]">RPS:</span>
                <span className="font-mono font-semibold text-[var(--text-primary)]">
                  {node.data.rps.toFixed(1)}
                </span>
              </div>
            )}
            {node.data.errorRate != null && (
              <div className="flex items-center gap-2">
                <TrendingUp className={cn('w-3.5 h-3.5', node.data.errorRate > 0.05 ? 'text-red-400' : 'text-green-400')} />
                <span className="text-[var(--text-muted)]">Error rate:</span>
                <span className={cn('font-mono font-semibold', node.data.errorRate > 0.05 ? 'text-red-400' : 'text-[var(--text-primary)]')}>
                  {(node.data.errorRate * 100).toFixed(2)}%
                </span>
              </div>
            )}
            {node.data.p95 != null && (
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-[var(--text-muted)]">p95:</span>
                <span className="font-mono font-semibold text-[var(--text-primary)]">
                  {node.data.p95.toFixed(0)} ms
                </span>
              </div>
            )}
          </>
        )}

        {/* Pod tooltip */}
        {kind === 'pod' && (
          <>
            <div className="flex items-center gap-2 mb-2">
              <Box className="w-4 h-4 text-teal-400" />
              <span className="font-semibold text-sm text-[var(--text-primary)] break-all leading-tight">
                {node.data.name}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Server className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-[var(--text-muted)]">Node:</span>
              <span className="font-mono font-semibold text-[var(--text-primary)]">{node.data.nodeName}</span>
            </div>
            <div className="flex items-center gap-2">
              <Package className="w-3.5 h-3.5 text-purple-400" />
              <span className="text-[var(--text-muted)]">Service:</span>
              <span className="font-mono font-semibold text-[var(--text-primary)]">{node.data.serviceName}</span>
            </div>
            <div className="flex items-center gap-2">
              <Cpu className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-[var(--text-muted)]">CPU:</span>
              <span className="font-mono font-semibold text-[var(--text-primary)]">
                {node.data.cpuUsagePercent?.toFixed?.(1) ?? 'N/A'}%
              </span>
            </div>
            <div className="flex items-center gap-2">
              <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-[var(--text-muted)]">RAM:</span>
              <span className="font-mono font-semibold text-[var(--text-primary)]">
                {node.data.ramUsedMB != null ? `${(node.data.ramUsedMB / 1024).toFixed(2)} GB` : 'N/A'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-[var(--text-muted)]" />
              <span className="text-[var(--text-muted)]">Uptime:</span>
              <span className="font-mono font-semibold text-[var(--text-primary)]">
                {formatUptime(node.data.uptimeSeconds)}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Graph theme (matches existing pattern)                             */
/* ------------------------------------------------------------------ */

function createTopologyTheme() {
  const rootStyles =
    typeof window !== 'undefined' ? window.getComputedStyle(document.documentElement) : null
  const getVar = (name: string, fallback: string) =>
    rootStyles?.getPropertyValue(name).trim() || fallback

  return {
    canvas: { background: getVar('--graph-canvas', '#0f172a') },
    node: {
      fill: getVar('--graph-node-fill', '#64748b'),
      activeFill: getVar('--graph-node-active-fill', '#38bdf8'),
      opacity: 0.9,
      selectedOpacity: 1,
      inactiveOpacity: 0.35,
      label: {
        color: getVar('--graph-node-label', '#e2e8f0'),
        stroke: getVar('--graph-node-label-stroke', '#0f172a'),
        activeColor: getVar('--graph-edge-label-active', '#ffffff'),
      },
      subLabel: {
        color: getVar('--graph-node-sublabel', '#94a3b8'),
        stroke: 'transparent',
        activeColor: getVar('--graph-node-label', '#e2e8f0'),
      },
    },
    lasso: {
      border: `1px solid ${getVar('--graph-lasso-border', '#38bdf8')}`,
      background: getVar('--graph-lasso-bg', 'rgba(56, 189, 248, 0.1)'),
    },
    ring: {
      fill: getVar('--graph-ring-fill', '#334155'),
      activeFill: getVar('--graph-ring-active-fill', '#3b82f6'),
    },
    edge: {
      fill: getVar('--graph-edge-fill', '#475569'),
      activeFill: getVar('--graph-edge-active-fill', '#94a3b8'),
      opacity: 0.5,
      selectedOpacity: 1,
      inactiveOpacity: 0.08,
      label: {
        stroke: 'transparent',
        color: getVar('--graph-node-sublabel', '#94a3b8'),
        activeColor: getVar('--graph-edge-label', '#f8fafc'),
        fontSize: 6,
      },
    },
    arrow: {
      fill: getVar('--graph-arrow-fill', '#475569'),
      activeFill: getVar('--graph-arrow-active-fill', '#94a3b8'),
    },
  }
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
/*  Main Component                                                    */
/* ------------------------------------------------------------------ */

export default function ClusterTopologyMap() {
  const { resolvedTheme } = useTheme()
  const {
    services,
    allNodes,
    loading,
    dependencyEdges,
    serviceMetrics,
  } = useServicesWithPlacement()

  const graphRef = useRef<GraphCanvasRef | null>(null)
  const [hoveredNode, setHoveredNode] = useState<ReagraphNode | null>(null)
  const [mousePosition, setMousePosition] = useState<{ x: number; y: number } | null>(null)
  const [isNodeHovered, setIsNodeHovered] = useState(false)
  const [selections, setSelections] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const [inspectedNode, setInspectedNode] = useState<ReagraphNode | null>(null)
  const [filters, setFilters] = useState<TopologyFilters>(DEFAULT_FILTERS)

  /* Pulse tick — toggles every 800 ms for high-error-rate node animation */
  const [pulseTick, setPulseTick] = useState(false)
  useEffect(() => {
    const id = setInterval(() => setPulseTick((t) => !t), 800)
    return () => clearInterval(id)
  }, [])

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

  const graphTheme = useMemo(() => createTopologyTheme(), [resolvedTheme]) // eslint-disable-line react-hooks/exhaustive-deps

  const { nodes: gNodes, edges: gEdges } = useMemo(
    () => buildTopologyGraph(services, allNodes, dependencyEdges, filters, serviceMetrics),
    [services, allNodes, dependencyEdges, filters, serviceMetrics]
  )

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
      /* Pulse animation: oscillate size for high-error-rate services */
      if (n.data?.highErrorRate) {
        patched = { ...patched, size: pulseTick ? 48 : 40 }
      }
      return patched
    })
  }, [gNodes, searchMatchIds, pulseTick])

  const activeSelections = useMemo(() => {
    // Hover neighborhood takes priority; else show search matches
    if (isNodeHovered) return selections
    if (searchMatchIds.size > 0) return Array.from(searchMatchIds)
    return []
  }, [isNodeHovered, selections, searchMatchIds])

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

  /* Highlight connected neighborhood on hover */
  const handlePointerOver = (node: ReagraphNode) => {
    setHoveredNode(node)
    setIsNodeHovered(true)

    const connected = new Set<string>([node.id])
    gEdges.forEach((e) => {
      if (e.source === node.id) connected.add(typeof e.target === 'string' ? e.target : '')
      if (e.target === node.id) connected.add(typeof e.source === 'string' ? e.source : '')
    })
    setSelections(Array.from(connected))
  }

  const handlePointerOut = () => {
    setHoveredNode(null)
    setIsNodeHovered(false)
    setSelections([])
  }

  /* Double-click to set depth origin */
  const handleNodeDoubleClick = useCallback((node: ReagraphNode) => {
    setFilters((prev) => ({
      ...prev,
      depthOrigin: node.id,
      depthHops: prev.depthHops || 3,
    }))
  }, [])

  /* Single-click to open inspect drawer */
  const handleNodeClick = useCallback((node: ReagraphNode) => {
    setInspectedNode(node)
  }, [])

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
            className={`absolute inset-0 ${isNodeHovered ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'}`}
            onMouseMove={(e) => setMousePosition({ x: e.clientX, y: e.clientY })}
            role="presentation"
          >
            {/* Zoom controls */}
            <div className="absolute right-4 top-4 z-20 flex items-center gap-2">
              <ZoomButton icon={Minus} label="Zoom out" onClick={() => graphRef.current?.zoomOut?.()} />
              <ZoomButton icon={Plus} label="Zoom in" onClick={() => graphRef.current?.zoomIn?.()} />
              <ZoomButton icon={LocateFixed} label="Fit graph" onClick={() => graphRef.current?.fitNodesInView?.()} />
            </div>

            <GraphCanvas
              ref={graphRef}
              nodes={displayNodes}
              edges={gEdges}
              selections={activeSelections}
              layoutType="forceDirected2d"
              labelType="all"
              theme={graphTheme}
              onNodePointerOver={handlePointerOver}
              onNodePointerOut={handlePointerOut}
              onNodeClick={handleNodeClick}
              onNodeDoubleClick={handleNodeDoubleClick}
              onCanvasClick={() => {
                setSelections([])
                setIsNodeHovered(false)
                setInspectedNode(null)
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
