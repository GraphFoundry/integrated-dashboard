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
 * Normalizes error rate into percentage points [0, 100].
 * Accepts either fraction form (0..1) or percent form (0..100).
 */
export function normalizeErrorRatePercent(value: number | null | undefined): number | null {
  if (value === null || value === undefined || Number.isNaN(value) || !Number.isFinite(value))
    return null
  if (value < 0) return null
  if (value <= 1) return value * 100
  return Math.min(value, 100)
}

function normalizeAvailabilityPercent(value: number | null | undefined): number | undefined {
  if (value === null || value === undefined || Number.isNaN(value) || !Number.isFinite(value))
    return undefined
  if (value < 0) return undefined
  if (value <= 1) return value * 100
  return Math.min(value, 100)
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
  const errorRatePct = normalizeErrorRatePercent(errorRate)
  const availabilityPct = normalizeAvailabilityPercent(availability)

  // High risk conditions
  if (errorRatePct !== null && errorRatePct > 5) {
    return {
      service,
      namespace,
      riskLevel: 'high',
      reason: 'High error rate',
      errorRate: errorRatePct,
    }
  }

  if (availabilityPct !== undefined && availabilityPct < 95) {
    return {
      service,
      namespace,
      riskLevel: 'high',
      reason: 'Low availability',
      availability: availabilityPct,
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
  if (errorRatePct !== null && errorRatePct > 1) {
    return {
      service,
      namespace,
      riskLevel: 'medium',
      reason: 'Elevated error rate',
      errorRate: errorRatePct,
    }
  }

  if (availabilityPct !== undefined && availabilityPct < 99) {
    return {
      service,
      namespace,
      riskLevel: 'medium',
      reason: 'Availability degraded',
      availability: availabilityPct,
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
    errorRate: errorRatePct ?? undefined,
    p95,
    availability: availabilityPct,
  }
}

/**
 * Sort services by risk (high -> medium -> low)
 */
export function sortByRisk(risks: ServiceRisk[]): ServiceRisk[] {
  const order: Record<RiskLevel, number> = { high: 0, medium: 1, low: 2 }
  return [...risks].sort((a, b) => order[a.riskLevel] - order[b.riskLevel])
}
