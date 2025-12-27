import type { ServiceWithPlacement } from './types'

/**
 * Extract unique Kubernetes nodes from services with aggregated metrics
 */
export function extractNodesFromServices(services: ServiceWithPlacement[]): Array<{
  id: string
  label: string
  totalPods: number
  cpuUsed: number
  cpuTotal: number
  cpuUsagePercent: number
  ramUsageMB: number
  ramTotalMB: number
  ramUsagePercent: number
}> {
  const nodeMap = new Map<
    string,
    {
      id: string
      label: string
      totalPods: number
      cpuUsed: number
      cpuTotal: number
      cpuUsagePercent: number
      ramUsageMB: number
      ramTotalMB: number
      ramUsagePercent: number
    }
  >()

  services.forEach((service) => {
    // Skip services without placement data
    if (!service.placement?.nodes || service.placement.nodes.length === 0) return

    service.placement.nodes.forEach((nodePlacement) => {
      const nodeId = nodePlacement.node

      if (!nodeMap.has(nodeId)) {
        nodeMap.set(nodeId, {
          id: nodeId,
          label: nodeId,
          totalPods: 0,
          cpuUsed: 0,
          cpuTotal: nodePlacement.resources?.cpu?.cores || 0,
          cpuUsagePercent: 0,
          ramUsageMB: 0,
          ramTotalMB: nodePlacement.resources?.ram?.totalMB || 0,
          ramUsagePercent: 0,
        })
      }

      const node = nodeMap.get(nodeId)!

      // Aggregate pod count
      node.totalPods += nodePlacement.pods?.length || 0

      // Aggregate CPU usage from pods
      const nodeCores = nodePlacement.resources?.cpu?.cores || 0
      const podCpuSum =
        nodePlacement.pods?.reduce((sum, pod) => {
          const podCores = ((pod.cpuUsagePercent || 0) / 100) * nodeCores
          return sum + podCores
        }, 0) || 0
      node.cpuUsed += podCpuSum

      // Use node-level RAM usage if available, otherwise fallback to pod sum
      if (nodePlacement.resources?.ram?.usedMB) {
        // If we have multiple placements for the same node (unlikely but possible), take the max or latest
        node.ramUsageMB = Math.max(node.ramUsageMB, nodePlacement.resources.ram.usedMB)
      } else {
        // Aggregate RAM usage from pods as fallback
        const podRamSum = nodePlacement.pods?.reduce((sum, pod) => sum + (pod.ramUsedMB || 0), 0) || 0
        node.ramUsageMB += podRamSum
      }

      // Update totals if they're higher (in case of inconsistencies)
      if (nodePlacement.resources?.cpu?.cores) {
        node.cpuTotal = Math.max(node.cpuTotal, nodePlacement.resources.cpu.cores)
      }
      if (nodePlacement.resources?.ram?.totalMB) {
        node.ramTotalMB = Math.max(node.ramTotalMB, nodePlacement.resources.ram.totalMB)
      }
      // Capture backend usagePercent if available
      if (nodePlacement.resources?.cpu?.usagePercent !== undefined) {
        node.cpuUsagePercent = Math.max(node.cpuUsagePercent, nodePlacement.resources.cpu.usagePercent)
      }
    })
  })

  // Calculate percentages
  nodeMap.forEach((node) => {
    // If usage percent is still 0 (not set by backend), and we have capacity, calc from pods
    if (node.cpuUsagePercent === 0 && node.cpuTotal > 0) {
      node.cpuUsagePercent = (node.cpuUsed / node.cpuTotal) * 100
    }
    node.ramUsagePercent = node.ramTotalMB > 0 ? (node.ramUsageMB / node.ramTotalMB) * 100 : 0
  })

  return Array.from(nodeMap.values())
}

/**
 * Extract services running on a specific node
 */
export function extractServicesForNode(
  services: ServiceWithPlacement[],
  nodeId: string
): Array<{
  id: string
  label: string
  namespace: string
  podCount: number
  availability: number
}> {
  const servicesOnNode: Array<{
    id: string
    label: string
    namespace: string
    podCount: number
    availability: number
    avgUptimeSeconds: number
  }> = []

  services.forEach((service) => {
    // Skip services without placement data
    if (!service.placement?.nodes || service.placement.nodes.length === 0) return

    const nodePlacement = service.placement.nodes.find((n) => n.node === nodeId)

    if (nodePlacement) {
      const pods = nodePlacement.pods || []
      // Calculate average uptime from pods ensuring we handle missing values
      const totalUptime = pods.reduce((sum, pod) => sum + ((pod as any).uptimeSeconds || 0), 0)
      const avgUptimeSeconds = pods.length > 0 ? totalUptime / pods.length : 0

      servicesOnNode.push({
        id: service.name,
        label: service.name,
        namespace: service.namespace,
        podCount: service.podCount || 0,
        availability: service.availability || 0,
        avgUptimeSeconds
      })
    }
  })

  return servicesOnNode
}

/**
 * Extract pods for a specific service
 */
export function extractPodsForService(service: ServiceWithPlacement): Array<{
  id: string
  label: string
  nodeName: string
  cpuUsagePercent: number
  ramUsedMB: number
  serviceAvailability: number
  uptimeSeconds?: number
}> {
  const pods: Array<{
    id: string
    label: string
    nodeName: string
    cpuUsagePercent: number
    ramUsedMB: number
    serviceAvailability: number
    uptimeSeconds?: number
  }> = []

  // Skip if no placement data
  if (!service.placement?.nodes || service.placement.nodes.length === 0) return pods

  service.placement.nodes.forEach((nodePlacement) => {
    nodePlacement.pods?.forEach((pod) => {
      pods.push({
        id: pod.name,
        label: pod.name,
        nodeName: nodePlacement.node,
        cpuUsagePercent: pod.cpuUsagePercent || 0,
        ramUsedMB: pod.ramUsedMB || 0,
        serviceAvailability: service.availability || 0,
        uptimeSeconds: pod.uptimeSeconds
      })
    })
  })

  return pods
}

/**
 * Get color based on resource usage percentage
 */
export function getResourceColor(usagePercent: number): string {
  if (usagePercent < 50) return '#10b981' // green
  if (usagePercent < 75) return '#f59e0b' // yellow
  return '#ef4444' // red
}
