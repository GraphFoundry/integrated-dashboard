import { AlertEvent, Incident, ServiceRollup, Overview, IncidentDetail } from './types'
import { K8sService } from './k8sService'

export interface IncidentListFilter {
  status?: string
  severity?: string
  namespace?: string
  service?: string
  priority?: string
  auto?: boolean
}

function toEpoch(isoTimestamp: string): number {
  return new Date(isoTimestamp).getTime()
}

function sortByObservedAtDesc(events: AlertEvent[]): AlertEvent[] {
  return events.sort((a, b) => toEpoch(b.observed_at) - toEpoch(a.observed_at))
}

function sortByLastObservedDesc(incidents: Incident[]): Incident[] {
  return incidents.sort((a, b) => toEpoch(b.last_observed_at) - toEpoch(a.last_observed_at))
}

// In-memory storage implementation (production should use SQLite/Postgres)
export class Storage {
  private events: Map<string, AlertEvent> = new Map()
  private incidents: Map<string, Incident> = new Map()
  private k8s: K8sService

  constructor(dbPath?: string) {
    // In-memory implementation - dbPath ignored for now
    void dbPath
    console.log('Using in-memory storage')
    this.k8s = new K8sService()
  }

  // Event operations
  insertEvent(event: AlertEvent): boolean {
    if (this.events.has(event.event_id)) {
      // Duplicate event_id - idempotency
      return false
    }

    this.events.set(event.event_id, event)
    return true
  }

  getEvent(eventId: string): AlertEvent | null {
    return this.events.get(eventId) || null
  }

  getEventsByDedupeKey(dedupeKey: string, namespace: string, service: string): AlertEvent[] {
    const events: AlertEvent[] = []

    for (const event of this.events.values()) {
      if (
        event.dedupe_key === dedupeKey &&
        event.service.namespace === namespace &&
        event.service.name === service
      ) {
        events.push(event)
      }
    }

    // Sort by observed_at DESC
    return sortByObservedAtDesc(events)
  }

  // Incident operations
  upsertIncident(incident: Incident): void {
    const key = this.getIncidentKey(incident.dedupe_key, incident.namespace, incident.service)
    const existing = this.incidents.get(key)

    if (existing) {
      // Update existing incident
      this.incidents.set(key, {
        ...incident,
        event_count: existing.event_count + 1,
      })
    } else {
      // Insert new incident
      this.incidents.set(key, incident)
    }
  }

  getIncident(dedupeKey: string, namespace: string, service: string): Incident | null {
    const key = this.getIncidentKey(dedupeKey, namespace, service)
    return this.incidents.get(key) || null
  }

  listIncidents(filter?: IncidentListFilter): Incident[] {
    let incidents = Array.from(this.incidents.values())

    if (filter) {
      if (filter.status) {
        const status = filter.status.toUpperCase()
        incidents = incidents.filter((i) => i.status === status)
      }
      if (filter.severity) {
        incidents = incidents.filter((i) => i.current_severity === filter.severity)
      }
      if (filter.namespace) {
        incidents = incidents.filter((i) => i.namespace === filter.namespace)
      }
      if (filter.service) {
        incidents = incidents.filter((i) => i.service === filter.service)
      }
      if (filter.priority) {
        incidents = incidents.filter((i) => i.current_priority === filter.priority)
      }
      if (filter.auto !== undefined) {
        incidents = incidents.filter((i) => i.auto === filter.auto)
      }
    }

    // Sort by last_observed_at DESC
    return sortByLastObservedDesc(incidents)
  }

  getIncidentDetail(dedupeKey: string, namespace: string, service: string): IncidentDetail | null {
    const incident = this.getIncident(dedupeKey, namespace, service)
    if (!incident) return null

    const events = this.getEventsByDedupeKey(dedupeKey, namespace, service)
    return { ...incident, events }
  }

  // Overview and stats
  getOverview(): Overview {
    const incidents = Array.from(this.incidents.values())

    const openIncidents = incidents.filter((i) => i.status === 'OPEN')
    const resolvedIncidents = incidents.filter((i) => i.status === 'RESOLVED')

    const criticalCount = incidents.filter((i) => i.current_severity === 'critical').length
    const highCount = incidents.filter((i) => i.current_severity === 'high').length
    const mediumCount = incidents.filter((i) => i.current_severity === 'medium').length
    const lowCount = incidents.filter((i) => i.current_severity === 'low').length

    const autoActionsCount = incidents.filter((i) => i.auto === true).length
    const manualActionsCount = incidents.filter((i) => i.auto === false).length

    const servicesAffected = new Set(
      incidents.map((i) => `${i.namespace}:${i.service}`)
    ).size

    const lastUpdatedAt =
      incidents.length > 0
        ? incidents.reduce((latest, i) =>
          toEpoch(i.last_observed_at) > toEpoch(latest)
            ? i.last_observed_at
            : latest
          , incidents[0].last_observed_at)
        : new Date().toISOString()

    return {
      total_incidents: incidents.length,
      open_incidents: openIncidents.length,
      resolved_incidents: resolvedIncidents.length,
      critical_count: criticalCount,
      high_count: highCount,
      medium_count: mediumCount,
      low_count: lowCount,
      auto_actions_count: autoActionsCount,
      manual_actions_count: manualActionsCount,
      services_affected: servicesAffected,
      last_updated_at: lastUpdatedAt,
    }
  }

  getServices(): ServiceRollup[] {
    const serviceMap = new Map<string, ServiceRollup>()

    for (const incident of this.incidents.values()) {
      const key = `${incident.namespace}:${incident.service}`

      if (!serviceMap.has(key)) {
        serviceMap.set(key, {
          namespace: incident.namespace,
          service: incident.service,
          open_incidents: 0,
          critical_count: 0,
          high_count: 0,
          medium_count: 0,
          low_count: 0,
          last_alert_at: incident.last_observed_at,
        })
      }

      const rollup = serviceMap.get(key)!

      if (incident.status === 'OPEN') {
        rollup.open_incidents++

        if (incident.current_severity === 'critical') rollup.critical_count++
        else if (incident.current_severity === 'high') rollup.high_count++
        else if (incident.current_severity === 'medium') rollup.medium_count++
        else if (incident.current_severity === 'low') rollup.low_count++
      }

      // Update last_alert_at if this incident is more recent
      if (toEpoch(incident.last_observed_at) > toEpoch(rollup.last_alert_at)) {
        rollup.last_alert_at = incident.last_observed_at
      }
    }

    // Sort by open_incidents DESC, then critical_count DESC
    return Array.from(serviceMap.values()).sort((a, b) => {
      if (b.open_incidents !== a.open_incidents) {
        return b.open_incidents - a.open_incidents
      }
      return b.critical_count - a.critical_count
    })
  }

  // Config operations (Kubernetes/etcd integrated)
  async getConfigs(): Promise<any[]> {
    const namespace = process.env.K8S_NAMESPACE || 'default'
    const configMapName = process.env.CONFIG_MAP_NAME || 'dashboard-config'
    const secretName = process.env.SECRET_NAME || 'dashboard-secrets'

    try {
      const cmData = await this.k8s.getConfigMap(namespace, configMapName) || {}
      const secretData = await this.k8s.getSecret(namespace, secretName) || {}
      const combinedData = { ...cmData, ...secretData }

      // We want to ensure at least these default keys show up even if not in K8s yet
      const defaultKeys: Record<string, string> = {
        'S_SCH_EXTENDER_DELAY_MS': process.env.S_SCH_EXTENDER_DELAY_MS || '200'
      }

      const mergedData = { ...defaultKeys, ...combinedData }
      const allConfigs: any[] = []

      for (const [name, value] of Object.entries(mergedData)) {
        allConfigs.push({
          name,
          value,
          category: name.startsWith('S_SCH') ? 'Scheduler Engine' :
            name.startsWith('PRED') ? 'Analysis Engine' :
              name.startsWith('ALERT') || name.startsWith('WEBHOOK') ? 'Alert Engine' : 'Service Graph Engine'
        })
      }

      return allConfigs
    } catch (error) {
      console.warn('[k8s] Failed to fetch from Kubernetes, using environment variables as fallback')
      // Fallback: return current process.env values for known config names
      const knownKeys = ['S_SCH_EXTENDER_DELAY_MS']

      return knownKeys.map(name => ({
        name,
        value: process.env[name] || '',
        category: 'Scheduler Engine'
      }))
    }
  }

  async updateConfigs(configs: any[]): Promise<{ success: boolean; updatedCount: number; message?: string }> {
    console.log(`[k8s] Starting update for ${configs.length} configurations...`)
    const namespace = process.env.K8S_NAMESPACE || 'default'
    const configMapName = process.env.CONFIG_MAP_NAME || 'dashboard-config'
    const secretName = process.env.SECRET_NAME || 'dashboard-secrets'

    const cmData: Record<string, string> = {}
    const secretData: Record<string, string> = {}

    // In a real scenario, you'd know which configs are secrets. 
    // For this demo, let's say configs with 'SECRET' or 'KEY' in name are secrets.
    for (const config of configs) {
      if (config.name.includes('SECRET') || config.name.includes('KEY') || config.name.includes('PASSWORD')) {
        secretData[config.name] = String(config.value)
      } else {
        cmData[config.name] = String(config.value)
      }
    }

    try {
      if (Object.keys(cmData).length > 0) {
        await this.k8s.updateConfigMap(namespace, configMapName, cmData)
      }
      if (Object.keys(secretData).length > 0) {
        await this.k8s.updateSecret(namespace, secretName, secretData)
      }

      console.log('[k8s] Updates applied successfully to Kubernetes')

      // Update local process.env for immediate effect in BFF
      for (const config of configs) {
        process.env[config.name] = String(config.value)
      }

      return { success: true, updatedCount: configs.length }
    } catch (error: any) {
      console.error('[k8s] Failed to update Kubernetes:', error.message || error)

      // Fallback for development: just update process.env and return success with a warning
      console.warn('[k8s] Falling back to local process.env update (simulation mode)')
      for (const config of configs) {
        process.env[config.name] = String(config.value)
      }

      return {
        success: true,
        updatedCount: configs.length,
        message: 'Updated locally (Kubernetes update failed - check connection/RBAC)'
      }
    }
  }

  private getIncidentKey(dedupeKey: string, namespace: string, service: string): string {
    return `${dedupeKey}:${namespace}:${service}`
  }

  close(): void {
    // No-op for in-memory storage
  }
}
