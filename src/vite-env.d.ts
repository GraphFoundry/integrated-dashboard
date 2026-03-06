/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEV_SERVER_PORT: string
  readonly VITE_BFF_URL: string
  readonly VITE_ENABLE_GRAPH_DIRECT_FALLBACK: string
  readonly VITE_GRAPH_CACHE_REFRESH_MS: string
  readonly VITE_ALLOW_DEMO_CONSTRAINT_OVERRIDE: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
