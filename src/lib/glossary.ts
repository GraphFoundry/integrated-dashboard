export type MetricTerm = 'requestRate' | 'errorRate' | 'p95' | 'availability' | 'p50' | 'p99'

export interface GlossaryDefinition {
  label: string
  tooltip: string
  originalTerm?: string
}

export const METRIC_GLOSSARY: Record<MetricTerm, GlossaryDefinition> = {
  requestRate: {
    label: 'Traffic (req/s)',
    tooltip: 'This shows how many requests hit this service every second. Bigger number means more load, so scaling or optimization may be needed during peaks.',
    originalTerm: 'Request Rate (RPS)',
  },
  errorRate: {
    label: 'Failed requests (%)',
    tooltip: 'This is the share of requests that fail. Example: 2% means about 2 out of 100 requests did not work, which directly affects user trust.',
    originalTerm: 'Error Rate',
  },
  p95: {
    label: 'Slow response time (worst 5%)',
    tooltip: 'This reflects slower user experiences. 95% of requests are faster than this value, so lower is better for perceived speed.',
    originalTerm: 'P95 Latency',
  },
  availability: {
    label: 'Uptime (%)',
    tooltip: 'This tells how often the service stayed online and reachable. Closer to 100% means more reliable and fewer interruptions.',
    originalTerm: 'Availability',
  },
  p50: {
    label: 'Typical response time (median)',
    tooltip: 'This is the normal response speed most users feel during everyday usage. It is a good baseline for day-to-day performance.',
    originalTerm: 'P50 Latency',
  },
  p99: {
    label: 'Very slow response time (worst 1%)',
    tooltip: 'This shows rare worst-case slow moments. It helps spot occasional heavy spikes that can hurt a small group of users badly.',
    originalTerm: 'P99 Latency',
  },
}

export function getGlossaryTerm(term: MetricTerm): GlossaryDefinition {
  return METRIC_GLOSSARY[term]
}
