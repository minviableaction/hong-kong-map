import { cameraImageResponse } from '../../src/server/liveCache.ts'

export function GET(request: Request) {
  const url = new URL(request.url)
  return cameraImageResponse(url.searchParams.get('key') ?? '', url.searchParams.get('fresh') === '1')
}
