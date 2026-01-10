// Domain types based on alerts.v1 schema

export interface AlertEvent {
  schema_version: string
  event_id: string
  dedupe_key: string
  observed_at: string
  sent_at: string
  service: ServiceInfo
  alert: AlertInfo
  decision: Decision
  evidence?: Evidence
  impact?: Impact
  context?: Context
  links?: Links
  meta?: Meta
}

export interface ServiceInfo {
  name: string
  namespace: string
}

export interface AlertInfo {
  type: string
  state: 'firing' | 'resolved'
  severity: 'info' | 'warning' | 'low' | 'medium' | 'high' | 'critical'
}

export interface Impact {
  downstream_count?: number
  [key: string]: any
}

export interface Decision {
  action: string
  auto: boolean
  priority: string
  risk_score?: number
  reason_codes: string[]
}

export interface Evidence {
  http_errors?: number
  latency_p99?: number
  cpu_percent?: number
  memory_percent?: number
  [key: string]: any // Allow additional evidence fields
}

export interface Context {
  pod_name?: string
  cluster?: string
  environment?: string
  [key: string]: any
}

export interface Links {
  details_ref?: string
  runbook?: string
  dashboard?: string
  [key: string]: string | undefined
}

export interface Meta {
  model_version?: string
  threshold_version?: string
  producer?: string
  trace_id?: string
  [key: string]: any
}

export interface Incident {
  dedupe_key: string
  namespace: string
  service: string
  status: 'OPEN' | 'RESOLVED'
  current_severity: string
  current_priority: string
  current_action: string
  auto: boolean
  risk_score: number
  reason_codes: string[]
  first_observed_at: string
  last_observed_at: string
  latest_event_id: string
  event_count: number
  quality_flags: string[]
}

export interface ServiceRollup {
  namespace: string
  service: string
  open_incidents: number
  critical_count: number
  high_count: number
  medium_count: number
  low_count: number
  last_alert_at: string
}

export interface Overview {
  total_incidents: number
  open_incidents: number
  resolved_incidents: number
  critical_count: number
  high_count: number
  medium_count: number
  low_count: number
  auto_actions_count: number
  manual_actions_count: number
  services_affected: number
  last_updated_at: string
}

export interface IncidentDetail extends Incident {
  events: AlertEvent[]
}

export interface WSMessage {
  type: 'incident_updated' | 'event_received' | 'stats' | 'connection'
  data: any
}

export interface IncidentFilter {
  status?: 'open' | 'resolved' | 'all'
  severity?: string
  namespace?: string
  service?: string
  priority?: string
  auto?: boolean
}
