import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { Agent as HttpAgent } from 'node:http'
import { Agent as HttpsAgent } from 'node:https'
import { setDefaultAutoSelectFamilyAttemptTimeout } from 'node:net'
import { fileURLToPath, URL } from 'node:url'

// Node tries each of a host's addresses for only 250 ms, which a slow
// connection misses: the dev proxy then fails with ETIMEDOUT. Allow 5 s.
setDefaultAutoSelectFamilyAttemptTimeout(5000)

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // Where `npm run dev` sends /api: the deployed API by default, or a local
  // one with VITE_API_PROXY=http://localhost:3000 in .env.local
  const apiTarget = env.VITE_API_PROXY || 'https://seatline-api-ls9x.onrender.com'
  // Reuse connections to the API instead of opening one per request, which
  // is where a slow or flaky connection fails
  const agentOptions = { keepAlive: true, timeout: 60_000 }
  const agent = apiTarget.startsWith('https:') ? new HttpsAgent(agentOptions) : new HttpAgent(agentOptions)

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      port: 5173,
      proxy: {
        '/api': { target: apiTarget, changeOrigin: true, secure: true, agent },
      },
    },
  }
})
