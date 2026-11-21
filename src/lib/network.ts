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

export const lines = network.lines
export const stations = network.stations
export const segments = network.segments
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

export function lineFeatures() {
  return {
    type: 'FeatureCollection' as const,
    features: segments.map((segment) => ({
      type: 'Feature' as const,
      properties: {
        line: segment.line,
        color: lineByCode[segment.line]?.color ?? '#334155',
      },
      geometry: {
        type: 'LineString' as const,
        coordinates: segment.coordinates,
      },
    })),
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
