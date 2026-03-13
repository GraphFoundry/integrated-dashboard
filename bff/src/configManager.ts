// ── Config Manager: K8s ConfigMap CRUD + service reload ─────────────────────

import fs from 'fs'
import https from 'https'
import axios, { AxiosRequestConfig } from 'axios'
import {
  SERVICE_CONFIG_REGISTRY,
  getServiceSchema,
  type ServiceConfigSchema,
  type ConfigKeySchema,
} from './configRegistry'

// ── K8s auth (same pattern as k8s.ts) ──────────────────────────────────────
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
    cfg.httpsAgent = new https.Agent({ ca: fs.readFileSync(SA_CA_PATH) })
  }
  return cfg
}

// ── ConfigMap data parsing ──────────────────────────────────────────────────

function parseRuntimeEnv(raw: string): Record<string, string> {
  const result: Record<string, string> = {}
  raw.split('\n').forEach((line) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) return
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx < 0) return
    result[trimmed.substring(0, eqIdx).trim()] = trimmed.substring(eqIdx + 1).trim()
  })
  return result
}

function serializeRuntimeEnv(data: Record<string, string>): string {
  return (
    Object.entries(data)
      .map(([k, v]) => `${k}=${v}`)
      .join('\n') + '\n'
  )
}

// ── K8s ConfigMap CRUD ──────────────────────────────────────────────────────

interface K8sConfigMap {
  apiVersion: string
  kind: string
  metadata: {
    name: string
    namespace: string
    resourceVersion?: string
    labels?: Record<string, string>
    [key: string]: unknown
  }
  data?: Record<string, string>
}

async function getConfigMap(namespace: string, name: string): Promise<K8sConfigMap> {
  const cfg = buildK8sAxiosConfig()
  const url = `${K8S_API_URL}/api/v1/namespaces/${encodeURIComponent(namespace)}/configmaps/${encodeURIComponent(name)}`
  const { data } = await axios.get<K8sConfigMap>(url, cfg)
  return data
}

async function updateConfigMap(namespace: string, name: string, cm: K8sConfigMap): Promise<void> {
  const cfg = buildK8sAxiosConfig()
  const url = `${K8S_API_URL}/api/v1/namespaces/${encodeURIComponent(namespace)}/configmaps/${encodeURIComponent(name)}`
  cfg.headers = { ...cfg.headers, 'Content-Type': 'application/json' }
  await axios.put(url, cm, cfg)
}

// ── Public API ──────────────────────────────────────────────────────────────

export interface ConfigKeyInfo {
  key: string
  label: string
  description: string
  type: string
  currentValue: string
  defaultValue: string
  group: string
  validation?: { min?: number; max?: number; pattern?: string }
}

export interface ConfigGroupInfo {
  name: string
  keys: ConfigKeyInfo[]
}

export interface ServiceConfigInfo {
  serviceId: string
  displayName: string
  groups: ConfigGroupInfo[]
}

/**
 * Get the full config for all services (schema + current values from ConfigMaps).
 */
export async function getAllConfigs(): Promise<ServiceConfigInfo[]> {
  const results: ServiceConfigInfo[] = []
  for (const schema of SERVICE_CONFIG_REGISTRY) {
    try {
      const info = await getServiceConfig(schema.serviceId)
      if (info) results.push(info)
    } catch (err) {
      // If ConfigMap doesn't exist yet, return schema with defaults
      results.push(buildConfigInfoFromDefaults(schema))
    }
  }
  return results
}

/**
 * Get config for a specific service.
 */
export async function getServiceConfig(serviceId: string): Promise<ServiceConfigInfo | null> {
  const schema = getServiceSchema(serviceId)
  if (!schema) return null

  try {
    const cm = await getConfigMap(schema.namespace, schema.configMapName)
    const runtimeData = cm.data?.['runtime.env'] ? parseRuntimeEnv(cm.data['runtime.env']) : {}
    return buildConfigInfo(schema, runtimeData)
  } catch (err: unknown) {
    // If 404, return defaults
    if (axios.isAxiosError(err) && err.response?.status === 404) {
      return buildConfigInfoFromDefaults(schema)
    }
    throw err
  }
}

/**
 * Update a single config key for a service.
 */
export async function updateConfigKey(
  serviceId: string,
  key: string,
  value: string
): Promise<{ updated: boolean; error?: string }> {
  const schema = getServiceSchema(serviceId)
  if (!schema) return { updated: false, error: 'Unknown service' }

  const keySchema = schema.keys.find((k) => k.key === key)
  if (!keySchema) return { updated: false, error: `Key "${key}" is not configurable for ${serviceId}` }

  const validationError = validateValue(keySchema, value)
  if (validationError) return { updated: false, error: validationError }

  const cm = await getConfigMap(schema.namespace, schema.configMapName)
  const runtimeData = cm.data?.['runtime.env'] ? parseRuntimeEnv(cm.data['runtime.env']) : {}
  runtimeData[key] = value

  cm.data = { ...cm.data, 'runtime.env': serializeRuntimeEnv(runtimeData) }
  await updateConfigMap(schema.namespace, schema.configMapName, cm)

  return { updated: true }
}

/**
 * Apply config: update all dirty keys in the ConfigMap, then trigger reload on the service.
 */
export async function applyConfig(
  serviceId: string,
  updates?: Record<string, string>
): Promise<{ applied: boolean; reloaded: boolean; error?: string }> {
  const schema = getServiceSchema(serviceId)
  if (!schema) return { applied: false, reloaded: false, error: 'Unknown service' }

  // If updates provided, write them to ConfigMap first
  if (updates && Object.keys(updates).length > 0) {
    const cm = await getConfigMap(schema.namespace, schema.configMapName)
    const runtimeData = cm.data?.['runtime.env'] ? parseRuntimeEnv(cm.data['runtime.env']) : {}

    for (const [key, value] of Object.entries(updates)) {
      const keySchema = schema.keys.find((k) => k.key === key)
      if (!keySchema) return { applied: false, reloaded: false, error: `Key "${key}" is not configurable` }
      const validationError = validateValue(keySchema, value)
      if (validationError) return { applied: false, reloaded: false, error: validationError }
      runtimeData[key] = value
    }

    cm.data = { ...cm.data, 'runtime.env': serializeRuntimeEnv(runtimeData) }
    await updateConfigMap(schema.namespace, schema.configMapName, cm)
  }

  // Trigger reload on the service, passing updates as env overrides
  // so the service picks them up immediately (kubelet ConfigMap sync can lag)
  try {
    const reloadUrl = `http://${schema.k8sServiceName}.${schema.namespace}.svc.cluster.local:${schema.k8sServicePort}/admin/reload-config`
    await axios.post(reloadUrl, { env: updates || {} }, { timeout: 10_000 })
    return { applied: true, reloaded: true }
  } catch (err: unknown) {
    const message = axios.isAxiosError(err) ? err.message : String(err)
    console.error(`[ConfigManager] Failed to reload ${serviceId}: ${message}`)
    return { applied: true, reloaded: false, error: `ConfigMap updated but reload failed: ${message}` }
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function buildConfigInfo(schema: ServiceConfigSchema, runtimeData: Record<string, string>): ServiceConfigInfo {
  const groupMap = new Map<string, ConfigKeyInfo[]>()
  for (const key of schema.keys) {
    const info: ConfigKeyInfo = {
      key: key.key,
      label: key.label,
      description: key.description,
      type: key.type,
      currentValue: runtimeData[key.key] ?? key.defaultValue,
      defaultValue: key.defaultValue,
      group: key.group,
      validation: key.validation,
    }
    const arr = groupMap.get(key.group) || []
    arr.push(info)
    groupMap.set(key.group, arr)
  }
  return {
    serviceId: schema.serviceId,
    displayName: schema.displayName,
    groups: Array.from(groupMap.entries()).map(([name, keys]) => ({ name, keys })),
  }
}

function buildConfigInfoFromDefaults(schema: ServiceConfigSchema): ServiceConfigInfo {
  const defaults: Record<string, string> = {}
  for (const key of schema.keys) {
    defaults[key.key] = key.defaultValue
  }
  return buildConfigInfo(schema, defaults)
}

function validateValue(keySchema: ConfigKeySchema, value: string): string | null {
  if (keySchema.type === 'boolean') {
    if (value !== 'true' && value !== 'false') {
      return `"${keySchema.key}" must be "true" or "false"`
    }
    return null
  }

  if (keySchema.type === 'number') {
    const n = Number.parseInt(value, 10)
    if (!Number.isFinite(n)) return `"${keySchema.key}" must be an integer`
    if (keySchema.validation?.min !== undefined && n < keySchema.validation.min) {
      return `"${keySchema.key}" must be >= ${keySchema.validation.min}`
    }
    if (keySchema.validation?.max !== undefined && n > keySchema.validation.max) {
      return `"${keySchema.key}" must be <= ${keySchema.validation.max}`
    }
    return null
  }

  if (keySchema.type === 'float') {
    const f = Number.parseFloat(value)
    if (!Number.isFinite(f)) return `"${keySchema.key}" must be a number`
    if (keySchema.validation?.min !== undefined && f < keySchema.validation.min) {
      return `"${keySchema.key}" must be >= ${keySchema.validation.min}`
    }
    if (keySchema.validation?.max !== undefined && f > keySchema.validation.max) {
      return `"${keySchema.key}" must be <= ${keySchema.validation.max}`
    }
    return null
  }

  if (keySchema.type === 'string' && keySchema.validation?.pattern) {
    const regex = new RegExp(keySchema.validation.pattern)
    if (!regex.test(value)) {
      return `"${keySchema.key}" does not match pattern ${keySchema.validation.pattern}`
    }
  }

  return null
}
