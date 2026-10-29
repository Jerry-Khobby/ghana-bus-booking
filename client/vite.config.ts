import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // Where `npm run dev` sends /api: the deployed API by default, or a local
  // one with VITE_API_PROXY=http://localhost:3000 in .env.local
  const apiTarget = env.VITE_API_PROXY || 'https://seatline-api-ls9x.onrender.com'

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      port: 5173,
      proxy: {
        '/api': { target: apiTarget, changeOrigin: true, secure: true },
      },
    },
  }
})
