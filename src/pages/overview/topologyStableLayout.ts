import type {
  GraphEdge as ReagraphEdge,
  GraphNode as ReagraphNode,
  InternalGraphPosition,
  LayoutOverrides,
  NodePositionArgs,
} from 'reagraph'

type Position3D = { x: number; y: number; z: number }

const NODE_PREFIX = 'node::'
const SERVICE_PREFIX = 'svc::'
const POD_PREFIX = 'pod::'

const NODE_X_SPACING = 420
const NODE_LANE_Y = -40
const SERVICE_BASE_OFFSET_Y = 180
const SERVICE_COL_SPACING = 300
const SERVICE_ROW_SPACING = 260
const UNPLACED_SERVICE_Y = 420
const UNPLACED_SERVICE_X_SPACING = 280
const POD_RING_RADIUS = 62
const POD_RING_RADIUS_LARGE = 82
const OTHER_LANE_Y = 860
const OTHER_X_SPACING = 180

function isK8sNode(id: string): boolean {
  return id.startsWith(NODE_PREFIX)
}

function isServiceNode(id: string): boolean {
  return id.startsWith(SERVICE_PREFIX)
}

function isPodNode(id: string): boolean {
  return id.startsWith(POD_PREFIX)
}

function toPosition(value?: Partial<Position3D>): Position3D {
  return {
    x: typeof value?.x === 'number' ? value.x : 0,
    y: typeof value?.y === 'number' ? value.y : 0,
    z: typeof value?.z === 'number' ? value.z : 0,
  }
}

function toInternalGraphPosition(id: string, value: Position3D): InternalGraphPosition {
  return {
    id,
    data: {},
    links: [],
    index: 0,
    vx: 0,
    vy: 0,
    x: value.x,
    y: value.y,
    z: value.z,
  }
}

function normalizeEdgeEndpoint(endpoint: unknown): string {
  return typeof endpoint === 'string' ? endpoint : ''
}

function buildPrimaryNodeByService(edges: ReagraphEdge[]): Map<string, string> {
  const map = new Map<string, string[]>()

  edges.forEach((edge) => {
    const source = normalizeEdgeEndpoint(edge.source)
    const target = normalizeEdgeEndpoint(edge.target)

    if (isK8sNode(source) && isServiceNode(target)) {
      const list = map.get(target) ?? []
      list.push(source)
      map.set(target, list)
    } else if (isK8sNode(target) && isServiceNode(source)) {
      const list = map.get(source) ?? []
      list.push(target)
      map.set(source, list)
    }
  })

  const primary = new Map<string, string>()
  map.forEach((nodeIds, serviceId) => {
    if (nodeIds.length === 0) return
    const sortedNodeIds = [...new Set(nodeIds)].sort()
    primary.set(serviceId, sortedNodeIds[0])
  })

  return primary
}

function buildPodsByService(edges: ReagraphEdge[]): Map<string, string[]> {
  const map = new Map<string, string[]>()

  edges.forEach((edge) => {
    const source = normalizeEdgeEndpoint(edge.source)
    const target = normalizeEdgeEndpoint(edge.target)

    if (isServiceNode(source) && isPodNode(target)) {
      const list = map.get(source) ?? []
      list.push(target)
      map.set(source, list)
    } else if (isServiceNode(target) && isPodNode(source)) {
      const list = map.get(target) ?? []
      list.push(source)
      map.set(target, list)
    }
  })

  return map
}

function makeCenteredLanePosition(index: number, total: number, spacing: number, y: number): Position3D {
  const centeredIndex = index - (total - 1) / 2
  return {
    x: centeredIndex * spacing,
    y,
    z: 0,
  }
}

function serviceGridOffset(index: number, total: number): Position3D {
  const cols = Math.max(1, Math.ceil(Math.sqrt(total)))
  const row = Math.floor(index / cols)
  const col = index % cols
  return {
    x: (col - (cols - 1) / 2) * SERVICE_COL_SPACING,
    y: SERVICE_BASE_OFFSET_Y + row * SERVICE_ROW_SPACING,
    z: 0,
  }
}

function deterministicAngleOffset(id: string): number {
  let hash = 0
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  }
  return (hash % 360) * (Math.PI / 180)
}

function resolveStablePositions(
  nodes: ReagraphNode[],
  edges: ReagraphEdge[],
  cache: Map<string, Position3D>
): Map<string, Position3D> {
  const currentIds = new Set(nodes.map((node) => node.id))
  for (const cachedId of Array.from(cache.keys())) {
    if (!currentIds.has(cachedId)) {
      cache.delete(cachedId)
    }
  }

  const nodeIds = nodes
    .map((node) => node.id)
    .filter((id) => isK8sNode(id))
    .sort()
  const serviceIds = nodes
    .map((node) => node.id)
    .filter((id) => isServiceNode(id))
    .sort()
  const podIds = nodes
    .map((node) => node.id)
    .filter((id) => isPodNode(id))
    .sort()
  const otherIds = nodes
    .map((node) => node.id)
    .filter((id) => !isK8sNode(id) && !isServiceNode(id) && !isPodNode(id))
    .sort()

  const candidates = new Map<string, Position3D>()

  nodeIds.forEach((nodeId, index) => {
    candidates.set(nodeId, makeCenteredLanePosition(index, nodeIds.length, NODE_X_SPACING, NODE_LANE_Y))
  })

  const primaryNodeByService = buildPrimaryNodeByService(edges)
  const servicesByNode = new Map<string, string[]>()
  serviceIds.forEach((serviceId) => {
    const nodeId = primaryNodeByService.get(serviceId)
    if (!nodeId) return
    const list = servicesByNode.get(nodeId) ?? []
    list.push(serviceId)
    servicesByNode.set(nodeId, list)
  })

  nodeIds.forEach((nodeId) => {
    const nodeServices = (servicesByNode.get(nodeId) ?? []).sort()
    const nodeAnchor = cache.get(nodeId) ?? candidates.get(nodeId) ?? { x: 0, y: NODE_LANE_Y, z: 0 }

    nodeServices.forEach((serviceId, index) => {
      const offset = serviceGridOffset(index, nodeServices.length)
      candidates.set(serviceId, {
        x: nodeAnchor.x + offset.x,
        y: nodeAnchor.y + offset.y,
        z: 0,
      })
    })
  })

  const unplacedServices = serviceIds.filter((serviceId) => !primaryNodeByService.has(serviceId))
  unplacedServices.forEach((serviceId, index) => {
    candidates.set(
      serviceId,
      makeCenteredLanePosition(index, unplacedServices.length, UNPLACED_SERVICE_X_SPACING, UNPLACED_SERVICE_Y)
    )
  })

  const podsByService = buildPodsByService(edges)
  serviceIds.forEach((serviceId) => {
    const servicePosition = cache.get(serviceId) ?? candidates.get(serviceId)
    if (!servicePosition) return

    const attachedPods = (podsByService.get(serviceId) ?? []).sort()
    if (attachedPods.length === 0) return
    const radius = attachedPods.length > 6 ? POD_RING_RADIUS_LARGE : POD_RING_RADIUS
    const phase = deterministicAngleOffset(serviceId)

    attachedPods.forEach((podId, index) => {
      const angle = phase + (2 * Math.PI * index) / attachedPods.length
      candidates.set(podId, {
        x: servicePosition.x + Math.cos(angle) * radius,
        y: servicePosition.y + Math.sin(angle) * radius,
        z: 0,
      })
    })
  })

  otherIds.forEach((id, index) => {
    candidates.set(id, makeCenteredLanePosition(index, otherIds.length, OTHER_X_SPACING, OTHER_LANE_Y))
  })

  podIds.forEach((podId, index) => {
    if (!candidates.has(podId)) {
      candidates.set(podId, makeCenteredLanePosition(index, podIds.length, OTHER_X_SPACING, OTHER_LANE_Y + 140))
    }
  })

  const resolved = new Map<string, Position3D>()
  nodes.forEach((node) => {
    const cached = cache.get(node.id)
    if (cached) {
      resolved.set(node.id, cached)
      return
    }
    resolved.set(node.id, candidates.get(node.id) ?? { x: 0, y: 0, z: 0 })
  })

  resolved.forEach((position, id) => {
    if (!cache.has(id)) {
      cache.set(id, position)
    }
  })

  return resolved
}

export function createTopologyStableLayoutOverrides(
  nodes: ReagraphNode[],
  edges: ReagraphEdge[],
  cache: Map<string, Position3D>
): LayoutOverrides {
  const positions = resolveStablePositions(nodes, edges, cache)

  return {
    getNodePosition: (id: string, args: NodePositionArgs): InternalGraphPosition => {
      const dragged = args.drags?.[id]?.position
      if (dragged) {
        const normalized = toPosition(dragged)
        cache.set(id, normalized)
        return toInternalGraphPosition(id, normalized)
      }

      const resolved = positions.get(id) ?? cache.get(id) ?? { x: 0, y: 0, z: 0 }
      return toInternalGraphPosition(id, resolved)
    },
  }
}
