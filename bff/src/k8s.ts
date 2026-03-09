import fs from 'fs'
import https from 'https'
import axios, { AxiosRequestConfig } from 'axios'

// ── In-cluster Kubernetes authentication (same pattern as service-graph-engine) ──
const SA_TOKEN_PATH = '/var/run/secrets/kubernetes.io/serviceaccount/token'
const SA_CA_PATH = '/var/run/secrets/kubernetes.io/serviceaccount/ca.crt'

const K8S_API_URL = process.env.KUBERNETES_API_URL || 'https://kubernetes.default.svc'

function buildK8sAxiosConfig(): AxiosRequestConfig {
  const cfg: AxiosRequestConfig = { timeout: 10_000 }

  if (fs.existsSync(SA_TOKEN_PATH)) {
    const token = fs.readFileSync(SA_TOKEN_PATH, 'utf8').trim()
    cfg.headers = { Authorization: `Bearer ${token}` }
  }
  if (fs.existsSync(SA_CA_PATH)) {
    cfg.httpsAgent = new https.Agent({
      ca: fs.readFileSync(SA_CA_PATH),
    })
  }
  return cfg
}

interface K8sPodItem {
  metadata: {
    name: string
    namespace: string
    labels?: Record<string, string>
    ownerReferences?: Array<{ kind: string; name: string }>
  }
  spec: {
    nodeName?: string
  }
  status?: {
    phase?: string
    conditions?: Array<{ type: string; status: string }>
  }
}

export interface PodsByService {
  [serviceName: string]: Array<{
    name: string
    namespace: string
    node: string
    phase: string
    ready: boolean
  }>
}

/**
 * Derive the service (deployment) name from a pod.
 * Priority matches the scheduler extender's label resolution so that
 * pod-to-decision mapping is consistent across the UI.
 */
function deriveServiceName(pod: K8sPodItem): string | null {
  const labels = pod.metadata.labels

  // 1. Standard Kubernetes labels
  if (labels?.app) return labels.app
  if (labels?.['app.kubernetes.io/name']) return labels['app.kubernetes.io/name']
  if (labels?.['service.istio.io/canonical-name']) return labels['service.istio.io/canonical-name']

  // 2. Fallback: Owner reference (ReplicaSet name → strip suffix)
  const owners = pod.metadata.ownerReferences
  if (owners?.length) {
    const rs = owners.find((o) => o.kind === 'ReplicaSet')
    if (rs) {
      const parts = rs.name.split('-')
      if (parts.length > 1) {
        parts.pop()
        return parts.join('-')
      }
      return rs.name
    }
    const other = owners[0]
    return other.name
  }

  return null
}

/**
 * Fetch all pods from the Kubernetes API and group them by service name.
 * Optionally filter to a single namespace.
 */
export async function fetchPodsByService(namespace?: string): Promise<PodsByService> {
  const cfg = buildK8sAxiosConfig()
  const url = namespace
    ? `${K8S_API_URL}/api/v1/namespaces/${encodeURIComponent(namespace)}/pods`
    : `${K8S_API_URL}/api/v1/pods`

  const { data } = await axios.get<{ items: K8sPodItem[] }>(url, cfg)

  const result: PodsByService = {}
  for (const pod of data.items) {
    const svc = deriveServiceName(pod)
    if (!svc) continue
    if (!pod.spec.nodeName) continue // not yet scheduled

    const ready =
      pod.status?.conditions?.some((c) => c.type === 'Ready' && c.status === 'True') ?? false

    if (!result[svc]) result[svc] = []
    result[svc].push({
      name: pod.metadata.name,
      namespace: pod.metadata.namespace,
      node: pod.spec.nodeName,
      phase: pod.status?.phase ?? 'Unknown',
      ready,
    })
  }

  return result
}
