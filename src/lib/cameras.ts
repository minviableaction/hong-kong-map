export type Camera = {
  key: string
  region: string
  district: string
  description: string
  lat: number
  lon: number
}

export function cameraImageUrl(key: string, cacheKey: number) {
  const url = new URL('/api/camera-image', 'http://local')
  url.searchParams.set('key', key)
  if (cacheKey > 0) url.searchParams.set('fresh', '1')
  return `${url.pathname}${url.search}`
}

export function cameraFeatures(cameras: Camera[]) {
  return {
    type: 'FeatureCollection' as const,
    features: cameras.map((camera) => ({
      type: 'Feature' as const,
      properties: {
        key: camera.key,
        description: camera.description,
      },
      geometry: {
        type: 'Point' as const,
        coordinates: [camera.lon, camera.lat],
      },
    })),
  }
}

export async function fetchCameras(signal: AbortSignal): Promise<Camera[]> {
  const response = await fetch('/api/cameras', { signal })
  if (!response.ok) {
    throw new Error('暫時無法讀取運輸署的快拍點清單。')
  }
  const cameras = (await response.json()) as Camera[]
  return cameras.filter((camera) => camera.key && Number.isFinite(camera.lat) && Number.isFinite(camera.lon))
}
