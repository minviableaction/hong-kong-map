import { camerasResponse } from '../../src/server/liveCache.ts'

export function GET() {
  return camerasResponse()
}
