import { AlertEvent, Incident, IncidentDetail, Overview, ServiceRollup, WSMessage } from './types'
import { IncidentListFilter, Storage } from './storage'

import { SmsService } from './sms.service'

function isInvalidAlertEvent(event: AlertEvent): boolean {
  return !event.event_id || !event.dedupe_key || !event.service?.name || !event.service?.namespace
}

function toIncidentStatus(state: AlertEvent['alert']['state']): Incident['status'] {
  return state === 'resolved' ? 'RESOLVED' : 'OPEN'
}

export class AlertService {
  constructor(
    private storage: Storage,
    private broadcast: (msg: WSMessage) => void,
    private smsService?: SmsService
  ) {}

  // Ingest webhook event (source of truth)
  ingestAlertEvent(event: AlertEvent): { success: boolean; message: string } {
    try {
      // Validate required fields
      if (isInvalidAlertEvent(event)) {
        return { success: false, message: 'Missing required fields' }
      }

      // Store event (idempotent)
      const inserted = this.storage.insertEvent(event)
      if (!inserted) {
        return { success: true, message: 'Event already exists (idempotent)' }
      }

      // Update incident projection
      this.updateIncidentProjection(event)

      // Broadcast to connected clients
      this.broadcast({
        type: 'event_received',
        data: { event_id: event.event_id, dedupe_key: event.dedupe_key },
      })

      // Send SMS notification
      if (this.smsService) {
        // fail-safe: don't block response on SMS sending
        this.smsService.sendAlertSms(event).catch(err =>
          console.error('Failed to trigger SMS for webhook:', err)
        )
      }

      return { success: true, message: 'Event ingested successfully' }
    } catch (error) {
      console.error('Failed to ingest event:', error)
      return { success: false, message: (error as { message: string }).message }
    }
  }

  private updateIncidentProjection(event: AlertEvent): void {
    // Check if incident already exists
    const existing = this.storage.getIncident(event.dedupe_key, event.service.namespace, event.service.name)

    if (existing) {
      // Get all events for this incident to compute accurate quality flags
      const allEvents = this.storage.getEventsByDedupeKey(event.dedupe_key, event.service.namespace, event.service.name)

      // Update existing incident
      const incident = this.createUpdatedIncident(existing, event, allEvents)

      this.storage.upsertIncident(incident)
    } else {
      // Create new incident - pass array with single event
      const incident = this.createNewIncident(event)

      this.storage.upsertIncident(incident)
    }

    // Broadcast incident update
    this.broadcast({
      type: 'incident_updated',
      data: {
        dedupe_key: event.dedupe_key,
        namespace: event.service.namespace,
        service: event.service.name,
        state: event.alert.state,
      },
    })
  }

  private createUpdatedIncident(
    existing: Incident,
    event: AlertEvent,
    allEvents: AlertEvent[]
  ): Incident {
    return {
      ...existing,
      current_severity: event.alert.severity,
      current_priority: event.decision.priority,
      current_action: event.decision.action,
      auto: event.decision.auto,
      risk_score: event.decision.risk_score || 0,
      reason_codes: event.decision.reason_codes,
      last_observed_at: event.observed_at,
      latest_event_id: event.event_id,
      status: toIncidentStatus(event.alert.state),
      event_count: existing.event_count + 1,
      quality_flags: this.computeQualityFlagsForIncident(allEvents),
    }
  }

  private createNewIncident(event: AlertEvent): Incident {
    return {
      dedupe_key: event.dedupe_key,
      namespace: event.service.namespace,
      service: event.service.name,
      status: toIncidentStatus(event.alert.state),
      current_severity: event.alert.severity,
      current_priority: event.decision.priority,
      current_action: event.decision.action,
      auto: event.decision.auto,
      risk_score: event.decision.risk_score || 0,
      reason_codes: event.decision.reason_codes,
      first_observed_at: event.observed_at,
      last_observed_at: event.observed_at,
      latest_event_id: event.event_id,
      event_count: 1,
      quality_flags: this.computeQualityFlagsForIncident([event]),
    }
  }

  // Compute quality flags for an incident based on ALL its events
  // A flag is only raised if ALL events are missing that data
  private computeQualityFlagsForIncident(events: AlertEvent[]): string[] {
    const flags: string[] = []

    // Check if ALL events are missing evidence
    const allMissingEvidence = events.every(
      (e) => !e.evidence || Object.keys(e.evidence).length === 0
    )
    if (allMissingEvidence) {
      flags.push('missing_evidence')
    }

    // Check if ALL events are missing context
    const allMissingContext = events.every(
      (e) => !e.context || Object.keys(e.context).length === 0
    )
    if (allMissingContext) {
      flags.push('missing_context')
    }

    // Check if ALL events are missing links
    const allMissingLinks = events.every(
      (e) => !e.links || (!e.links.details_ref && !e.links.runbook && !e.links.dashboard)
    )
    if (allMissingLinks) {
      flags.push('missing_links')
    }

    return flags
  }

  // Query methods
  getOverview(): Overview {
    return this.storage.getOverview()
  }

  listIncidents(filter?: IncidentListFilter): Incident[] {
    return this.storage.listIncidents(filter)
  }

  getIncidentDetail(dedupeKey: string, namespace: string, service: string): IncidentDetail | null {
    return this.storage.getIncidentDetail(dedupeKey, namespace, service)
  }

  getServices(): ServiceRollup[] {
    return this.storage.getServices()
  }

  getEvent(eventId: string): AlertEvent | null {
    return this.storage.getEvent(eventId)
  }
}
