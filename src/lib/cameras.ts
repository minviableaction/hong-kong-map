export type Camera = {
  key: string
  region: string
  district: string
  description: string
  lat: number
  lon: number
}

const LIST_URL =
  'https://static.data.gov.hk/td/traffic-snapshot-images/code/Traffic_Camera_Locations_Tc.xml'

export function cameraImageUrl(key: string, cacheKey: number) {
  const url = new URL(`https://tdcctv.data.one.gov.hk/${encodeURIComponent(key)}.JPG`)
  if (cacheKey > 0) url.searchParams.set('t', String(cacheKey))
  return url.toString()
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

function textOf(parent: Element, tag: string) {
  return parent.getElementsByTagName(tag)[0]?.textContent?.trim() ?? ''
}

export async function fetchCameras(signal: AbortSignal): Promise<Camera[]> {
  const response = await fetch(LIST_URL, { signal })
  if (!response.ok) {
    throw new Error('暫時無法讀取運輸署的快拍點清單。')
  }
  const xml = await response.text()
  const document = new DOMParser().parseFromString(xml, 'text/xml')
  if (document.querySelector('parsererror')) {
    throw new Error('快拍點清單的格式未能讀取。')
  }

  const cameras: Camera[] = []
  for (const image of document.getElementsByTagName('image')) {
    const lat = Number(textOf(image, 'latitude'))
    const lon = Number(textOf(image, 'longitude'))
    const key = textOf(image, 'key')
    if (!key || !Number.isFinite(lat) || !Number.isFinite(lon)) continue
    if (lat < 22 || lat > 23 || lon < 113.5 || lon > 114.6) continue
    cameras.push({
      key,
      region: textOf(image, 'region'),
      district: textOf(image, 'district'),
      description: textOf(image, 'description'),
      lat,
      lon,
    })
  }
  return cameras
}
