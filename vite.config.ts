import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const devServerPort = Number(env.VITE_DEV_SERVER_PORT) || 5173
  const predictiveBaseUrl = env.VITE_PREDICTIVE_API_BASE_URL || 'http://localhost:7000'

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: devServerPort,
      host: true,
      proxy: {
        '/api': {
          target: predictiveBaseUrl,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
      },
    },
  }
})
