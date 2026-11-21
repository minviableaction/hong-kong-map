import { cameraImageResponse, camerasResponse, trainsResponse, warmSchedules } from '../src/server/liveCache.ts'

type AssetBinding = {
  fetch(request: Request): Promise<Response>
}

export default {
  async fetch(request: Request, env: { ASSETS: AssetBinding }) {
    const url = new URL(request.url)
    if (url.pathname === '/api/trains') return trainsResponse()
    if (url.pathname === '/api/cameras') return camerasResponse()
    if (url.pathname === '/api/camera-image') {
      return cameraImageResponse(url.searchParams.get('key') ?? '', url.searchParams.get('fresh') === '1')
    }
    return env.ASSETS.fetch(request)
  },
  scheduled() {
    return warmSchedules()
  },
}
