import { trainsResponse } from '../src/server/liveCache.ts'

export function GET() {
  return trainsResponse()
}
