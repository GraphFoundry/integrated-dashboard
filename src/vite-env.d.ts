/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEV_SERVER_PORT: string
  readonly VITE_PREDICTIVE_API_BASE_URL: string
  readonly VITE_GRAPH_ALERT_API_BASE_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
