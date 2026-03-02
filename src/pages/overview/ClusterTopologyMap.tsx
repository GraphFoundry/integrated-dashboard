import { useState, useMemo, useRef, useEffect } from 'react'
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
} from 'lucide-react'
import EmptyState from '@/components/layout/EmptyState'
import SkeletonBlock from '@/components/common/SkeletonBlock'
import { cn } from '@/components/common/uiClassTokens'
import { useServicesWithPlacement } from '@/lib/useGraphStream'
import { useTheme } from '@/theme/useTheme'
import type { ServiceWithPlacement, NodeWithResources } from '@/lib/types'


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

/* Prefixes ensure globally unique ids */
const nodeId = (n: string) => `node::${n}`
const svcId = (s: string) => `svc::${s}`
const podId = (p: string) => `pod::${p}`

/* ------------------------------------------------------------------ */
/*  Graph data builder                                                */
/* ------------------------------------------------------------------ */

function buildTopologyGraph(
  services: ServiceWithPlacement[],
  allNodes: NodeWithResources[],
  dependencyEdges: { source: string; target: string }[]
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

  services.forEach((svc) => {
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
            fill: '#B589D6', // lavender — distinct pod color
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
  dependencyEdges.forEach((de, idx) => {
    if (!addedServices.has(de.source) || !addedServices.has(de.target)) return
    edges.push({
      id: `dep::${idx}::${de.source}->${de.target}`,
      source: svcId(de.source),
      target: svcId(de.target),
      label: '',
    })
  })

  return { nodes, edges }
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
        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#B589D6' }} />
        Pod
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-400" />
        Search match
      </span>
      <span className="flex items-center gap-1.5">
        <ArrowRightLeft className="h-3 w-3" />
        Dependency
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
/*  Main Component                                                    */
/* ------------------------------------------------------------------ */

export default function ClusterTopologyMap() {
  const { resolvedTheme } = useTheme()
  const {
    services,
    allNodes,
    loading,
    dependencyEdges,
  } = useServicesWithPlacement()

  const graphRef = useRef<GraphCanvasRef | null>(null)
  const [hoveredNode, setHoveredNode] = useState<ReagraphNode | null>(null)
  const [mousePosition, setMousePosition] = useState<{ x: number; y: number } | null>(null)
  const [isNodeHovered, setIsNodeHovered] = useState(false)
  const [selections, setSelections] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const searchInputRef = useRef<HTMLInputElement | null>(null)

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
    () => buildTopologyGraph(services, allNodes, dependencyEdges),
    [services, allNodes, dependencyEdges]
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
    if (searchMatchIds.size === 0) return gNodes
    return gNodes.map((n) =>
      searchMatchIds.has(n.id) ? { ...n, fill: '#FBBF24' } : n
    )
  }, [gNodes, searchMatchIds])

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
              onCanvasClick={() => {
                setSelections([])
                setIsNodeHovered(false)
                if (!searchQuery) setSelections([])
              }}
              minZoom={0.05}
              maxZoom={6}
            />

            {/* Tooltip */}
            {hoveredNode && mousePosition && (
              <TopologyTooltip node={hoveredNode} position={mousePosition} />
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
