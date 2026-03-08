/**
 * Runtime environment configuration.
 *
 * In production (Docker/k8s) values come from `window.__ENV__` which is
 * generated at container startup by env.sh from real environment variables.
 *
 * In local dev, values come from Vite's `import.meta.env.VITE_*` (set via .env file).
 */

declare global {
  interface Window {
    __ENV__?: {
      BFF_URL?: string
      ENABLE_GRAPH_DIRECT_FALLBACK?: string
      GRAPH_CACHE_REFRESH_MS?: string
      ALLOW_DEMO_CONSTRAINT_OVERRIDE?: string
    }
  }
}

function get(key: string): string {
  // Runtime (Docker/k8s) takes precedence
  const runtime = window.__ENV__?.[key as keyof NonNullable<typeof window.__ENV__>]
  if (runtime !== undefined && runtime !== '') return runtime

  // Fallback to Vite build-time env (local dev)
  const viteKey = `VITE_${key}`
  return (import.meta.env[viteKey] as string) ?? ''
}

export const env = {
  /** BFF base URL. Empty string = same-origin (nginx proxies to BFF). */
  BFF_URL: get('BFF_URL'),
  ENABLE_GRAPH_DIRECT_FALLBACK: get('ENABLE_GRAPH_DIRECT_FALLBACK'),
  GRAPH_CACHE_REFRESH_MS: get('GRAPH_CACHE_REFRESH_MS'),
  ALLOW_DEMO_CONSTRAINT_OVERRIDE: get('ALLOW_DEMO_CONSTRAINT_OVERRIDE'),
}
