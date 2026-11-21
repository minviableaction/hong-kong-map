import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import type { Connect } from 'vite'
import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'
import { cameraImageResponse, camerasResponse, trainsResponse } from './src/server/liveCache.ts'

function attachSharedCache(middlewares: Connect.Server) {
  middlewares.use(async (req, res, next) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    let response: Response | null = null
    if (url.pathname === '/api/trains') response = await trainsResponse()
    else if (url.pathname === '/api/cameras') response = await camerasResponse()
    else if (url.pathname === '/api/camera-image') {
      response = await cameraImageResponse(url.searchParams.get('key') ?? '', url.searchParams.get('fresh') === '1')
    }
    if (!response) {
      next()
      return
    }
    res.statusCode = response.status
    response.headers.forEach((value, key) => {
      res.setHeader(key, value)
    })
    res.end(Buffer.from(await response.arrayBuffer()))
  })
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'hk-shared-cache',
      configureServer(server) {
        attachSharedCache(server.middlewares)
      },
      configurePreviewServer(server) {
        attachSharedCache(server.middlewares)
      },
    },
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 4317,
    strictPort: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 4317,
    strictPort: true,
  },
})
