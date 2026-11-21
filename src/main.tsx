import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { setWorkerUrl } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'
import '@fontsource/noto-sans-hk/400.css'
import '@fontsource/noto-sans-hk/600.css'
import '@fontsource/noto-sans-hk/700.css'
import './index.css'
import App from './App.tsx'

setWorkerUrl(workerUrl)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
