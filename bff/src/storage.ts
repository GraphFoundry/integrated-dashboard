import { AlertEvent, Incident, ServiceRollup, Overview, IncidentDetail } from './types'

// In-memory storage implementation (production should use SQLite/Postgres)
export class Storage {
  private events: Map<string, AlertEvent> = new Map()
  private incidents: Map<string, Incident> = new Map()

  constructor(_dbPath?: string) {
    // In-memory implementation - dbPath ignored for now
    console.log('Using in-memory storage')
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
    return events.sort((a, b) => 
      new Date(b.observed_at).getTime() - new Date(a.observed_at).getTime()
    )
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

  listIncidents(filter?: {
    status?: string
    severity?: string
    namespace?: string
    service?: string
    priority?: string
    auto?: boolean
  }): Incident[] {
    let incidents = Array.from(this.incidents.values())

    if (filter) {
      if (filter.status) {
        incidents = incidents.filter((i) => i.status === filter.status!.toUpperCase())
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
    return incidents.sort((a, b) => 
      new Date(b.last_observed_at).getTime() - new Date(a.last_observed_at).getTime()
    )
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
            new Date(i.last_observed_at).getTime() > new Date(latest).getTime()
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
      if (new Date(incident.last_observed_at).getTime() > new Date(rollup.last_alert_at).getTime()) {
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

  private getIncidentKey(dedupeKey: string, namespace: string, service: string): string {
    return `${dedupeKey}:${namespace}:${service}`
  }

  close() {
    // No-op for in-memory storage
  }
}

