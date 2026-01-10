import type { RiskLevel } from '@/components/layout/RiskBadge'
import type { TelemetryDatapoint } from '@/lib/types'

export interface ServiceRisk {
  service: string
  namespace: string
  riskLevel: RiskLevel
  reason: string
  errorRate?: number
  p95?: number
  availability?: number
}

/**
 * Calculate risk level for a service based on telemetry metrics
 */
export function calculateServiceRisk(
  service: string,
  namespace: string,
  latestMetrics: TelemetryDatapoint | undefined
): ServiceRisk {
  if (!latestMetrics) {
    return {
      service,
      namespace,
      riskLevel: 'low',
      reason: 'No recent metrics',
    }
  }

  const { errorRate, p95, availability } = latestMetrics

  // High risk conditions
  if (errorRate > 5) {
    return {
      service,
      namespace,
      riskLevel: 'high',
      reason: 'High error rate',
      errorRate,
    }
  }

  if (availability < 95) {
    return {
      service,
      namespace,
      riskLevel: 'high',
      reason: 'Low availability',
      availability,
    }
  }

  if (p95 > 1000) {
    return {
      service,
      namespace,
      riskLevel: 'high',
      reason: 'P95 latency spike',
      p95,
    }
  }

  // Medium risk conditions
  if (errorRate > 1) {
    return {
      service,
      namespace,
      riskLevel: 'medium',
      reason: 'Elevated error rate',
      errorRate,
    }
  }

  if (availability < 99) {
    return {
      service,
      namespace,
      riskLevel: 'medium',
      reason: 'Availability degraded',
      availability,
    }
  }

  if (p95 > 500) {
    return {
      service,
      namespace,
      riskLevel: 'medium',
      reason: 'Elevated latency',
      p95,
    }
  }

  // Low risk (stable)
  return {
    service,
    namespace,
    riskLevel: 'low',
    reason: 'Stable',
    errorRate,
    p95,
    availability,
  }
}

/**
 * Sort services by risk (high -> medium -> low)
 */
export function sortByRisk(risks: ServiceRisk[]): ServiceRisk[] {
  const order: Record<RiskLevel, number> = { high: 0, medium: 1, low: 2 }
  return [...risks].sort((a, b) => order[a.riskLevel] - order[b.riskLevel])
}
