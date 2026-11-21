import { Component, StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import 'maplibre-gl/dist/maplibre-gl.css'
import '@fontsource/noto-sans-hk/400.css'
import '@fontsource/noto-sans-hk/600.css'
import '@fontsource/noto-sans-hk/700.css'
import './index.css'
import App from './App.tsx'

type BoundaryState = { message: string | null }

class AppErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { message: null }

  static getDerivedStateFromError(error: unknown): BoundaryState {
    const message = error instanceof Error ? error.message : '未知錯誤'
    return { message }
  }

  render() {
    if (!this.state.message) return this.props.children
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          textAlign: 'center',
          fontFamily: 'sans-serif',
          background: '#f5f5f4',
          color: '#1c1917',
        }}
      >
        <div>
          <h1 style={{ fontSize: 20, margin: '0 0 8px' }}>地圖暫時開不起來</h1>
          <p style={{ margin: '0 0 16px', fontSize: 14, lineHeight: 1.6 }}>{this.state.message}</p>
          <button type="button" onClick={() => window.location.reload()}>
            重新載入
          </button>
        </div>
      </div>
    )
  }
}

const root = document.getElementById('root')
if (!root) {
  throw new Error('找不到頁面根節點。')
}

createRoot(root).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
)
