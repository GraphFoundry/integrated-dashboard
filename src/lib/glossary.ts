
export type MetricTerm = 'requestRate' | 'errorRate' | 'p95' | 'availability' | 'p50' | 'p99'

export interface GlossaryDefinition {
    label: string
    tooltip: string
    originalTerm?: string
}

export const METRIC_GLOSSARY: Record<MetricTerm, GlossaryDefinition> = {
    requestRate: {
        label: 'Traffic (req/s)',
        tooltip: 'Number of requests received per second.',
        originalTerm: 'Request Rate (RPS)',
    },
    errorRate: {
        label: 'Failed requests (%)',
        tooltip: 'Percentage of requests that resulted in an error (non-200 OK).',
        originalTerm: 'Error Rate',
    },
    p95: {
        label: 'Slow response time (worst 5%)',
        tooltip: '95% of requests are faster than this. Shows the experience of the slowest users.',
        originalTerm: 'P95 Latency',
    },
    availability: {
        label: 'Uptime (%)',
        tooltip: 'Percentage of time the service was available and reachable.',
        originalTerm: 'Availability',
    },
    p50: {
        label: 'Typical response time (median)',
        tooltip: '50% of requests are faster than this. Shows the typical user experience.',
        originalTerm: 'P50 Latency',
    },
    p99: {
        label: 'Very slow response time (worst 1%)',
        tooltip: '99% of requests are faster than this. Used to find extreme outliers.',
        originalTerm: 'P99 Latency',
    },
}

export function getGlossaryTerm(term: MetricTerm): GlossaryDefinition {
    return METRIC_GLOSSARY[term]
}
