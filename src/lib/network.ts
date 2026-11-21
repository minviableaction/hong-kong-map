import raw from '@/data/network.json' with { type: 'json' }

export type Station = {
  code: string
  name: string
  en: string
  lat: number
  lon: number
  lines: string[]
  terminalLines: string[]
}

export type LineInfo = {
  code: string
  name: string
  color: string
}

export type Segment = {
  line: string
  from: string
  to: string
  coordinates: [number, number][]
}

type NetworkFile = {
  source: string
  lines: LineInfo[]
  stations: Station[]
  segments: Segment[]
}

const network = raw as NetworkFile

type LngLat = [number, number]

const networkLines = network.lines
const networkStations = network.stations

export const lines = networkLines
export const stations = networkStations
export const networkSourceNote = network.source

export const lineByCode: Record<string, LineInfo> = Object.fromEntries(
  lines.map((line) => [line.code, line]),
)

export const stationByCode: Record<string, Station> = Object.fromEntries(
  stations.map((station) => [station.code, station]),
)

export function lineInk(color: string) {
  return color === '#5EB6E4' || color === '#B5A800' ? '#1c1917' : '#ffffff'
}

export function stationBounds(): [[number, number], [number, number]] {
  const lons = stations.map((station) => station.lon)
  const lats = stations.map((station) => station.lat)
  return [
    [Math.min(...lons) - 0.04, Math.min(...lats) - 0.04],
    [Math.max(...lons) + 0.04, Math.max(...lats) + 0.04],
  ]
}

function meters(a: LngLat, b: LngLat) {
  const lat = ((a[1] + b[1]) / 2) * Math.PI / 180
  const dx = (a[0] - b[0]) * Math.cos(lat) * 111320
  const dy = (a[1] - b[1]) * 110540
  return Math.hypot(dx, dy)
}

function turnDegrees(a: LngLat, b: LngLat, c: LngLat) {
  const bearing = (from: LngLat, to: LngLat) => {
    const lat = ((from[1] + to[1]) / 2) * Math.PI / 180
    const dx = (to[0] - from[0]) * Math.cos(lat)
    const dy = to[1] - from[1]
    return (Math.atan2(dx, dy) * 180) / Math.PI
  }
  const delta = Math.abs(bearing(b, c) - bearing(a, b))
  return Math.min(delta, 360 - delta)
}

function withoutDuplicates(points: LngLat[]) {
  if (points.length === 0) return []
  const unique: LngLat[] = [[points[0][0], points[0][1]]]
  for (let index = 1; index < points.length; index += 1) {
    const point: LngLat = [points[index][0], points[index][1]]
    if (meters(unique[unique.length - 1], point) >= 0.4) unique.push(point)
  }
  return unique
}

// Parallel OSM rails were linked by short sideways hops. Those hops read as breaks in the stroke.
function smoothTrack(points: LngLat[]) {
  let current = withoutDuplicates(points)
  for (let pass = 0; pass < 8 && current.length >= 3; pass += 1) {
    const next: LngLat[] = [current[0]]
    let dropped = false
    for (let index = 1; index < current.length - 1; index += 1) {
      const previous = next[next.length - 1]
      const point = current[index]
      const after = current[index + 1]
      const inbound = meters(previous, point)
      const outbound = meters(point, after)
      if (Math.min(inbound, outbound) <= 24 && turnDegrees(previous, point, after) >= 50) {
        dropped = true
        continue
      }
      next.push(point)
    }
    next.push(current[current.length - 1])
    current = withoutDuplicates(next)
    if (!dropped) break
  }
  return current
}

export const segments: Segment[] = network.segments.map((segment) => ({
  ...segment,
  coordinates: smoothTrack(segment.coordinates),
}))

function trackChains(line: string) {
  const lineSegments = segments.filter((segment) => segment.line === line)
  const neighbors = new Map<string, number[]>()
  lineSegments.forEach((segment, index) => {
    for (const code of [segment.from, segment.to]) {
      const list = neighbors.get(code) ?? []
      list.push(index)
      neighbors.set(code, list)
    }
  })
  const used = new Array<boolean>(lineSegments.length).fill(false)

  const orient = (index: number, start: string) => {
    const segment = lineSegments[index]
    const coords = segment.coordinates.map((point) => [point[0], point[1]] as LngLat)
    return segment.from === start ? coords : coords.reverse()
  }

  const extend = (points: LngLat[], start: string) => {
    let node = start
    while ((neighbors.get(node)?.length ?? 0) === 2) {
      const nextIndex = (neighbors.get(node) ?? []).find((index) => !used[index])
      if (nextIndex === undefined) break
      used[nextIndex] = true
      const coords = orient(nextIndex, node)
      points.push(...coords.slice(1))
      const next = lineSegments[nextIndex]
      node = next.from === node ? next.to : next.from
    }
  }

  const chains: LngLat[][] = []
  for (let index = 0; index < lineSegments.length; index += 1) {
    if (used[index]) continue
    used[index] = true
    const segment = lineSegments[index]
    const forward = orient(index, segment.from)
    extend(forward, segment.to)
    const backward = [...forward].reverse()
    extend(backward, segment.from)
    const chain = smoothTrack(backward.reverse())
    if (chain.length >= 2) chains.push(chain)
  }
  return chains
}

export function lineFeatures() {
  return {
    type: 'FeatureCollection' as const,
    features: lines.flatMap((line) =>
      trackChains(line.code).map((coordinates) => ({
        type: 'Feature' as const,
        properties: {
          line: line.code,
          color: line.color,
        },
        geometry: {
          type: 'LineString' as const,
          coordinates,
        },
      })),
    ),
  }
}

export function stationFeatures() {
  return {
    type: 'FeatureCollection' as const,
    features: stations.map((station) => ({
      type: 'Feature' as const,
      properties: {
        code: station.code,
        name: station.name,
        lines: station.lines.join(','),
      },
      geometry: {
        type: 'Point' as const,
        coordinates: [station.lon, station.lat],
      },
    })),
  }
}

export function searchStations(query: string) {
  const needle = query.trim().toLowerCase()
  if (!needle) return []
  return stations
    .filter((station) => {
      return (
        station.name.toLowerCase().includes(needle) ||
        station.en.toLowerCase().includes(needle) ||
        station.code.toLowerCase().includes(needle)
      )
    })
    .slice(0, 8)
}
