import { lineByCode, segments, stationByCode } from '@/lib/network'
import { parseHongKongTime } from '@/lib/schedule'
import { ROUTES } from '@/lib/routes'
import type { TrainSnapshot } from '@/lib/snapshot'

const SPEED_KMH: Record<string, number> = {
  AEL: 105,
  TCL: 62,
  EAL: 58,
  TML: 52,
  DRL: 50,
}

type Sighting = {
  line: string
  station: string
  dest: string
  eta: number
  viaRacecourse: boolean
}

type Placement = {
  from: string
  to: string
  kind: 'approach' | 'wait' | 'depart'
}

export type TrainRun = {
  id: string
  line: string
  color: string
  station: string
  label: string
  path: [number, number][]
  cumulative: number[]
  eta: number
  runMs: number
  kind: 'approach' | 'wait' | 'depart'
}

const segmentPaths = new Map<string, [number, number][]>()
for (const segment of segments) {
  const forward = segment.coordinates.map((point) => [point[0], point[1]] as [number, number])
  segmentPaths.set(`${segment.line}:${segment.from}:${segment.to}`, forward)
  segmentPaths.set(`${segment.line}:${segment.to}:${segment.from}`, [...forward].reverse())
}

function meters(a: [number, number], b: [number, number]) {
  const lat = ((a[1] + b[1]) / 2) * Math.PI / 180
  const dx = (a[0] - b[0]) * Math.cos(lat) * 111320
  const dy = (a[1] - b[1]) * 110540
  return Math.hypot(dx, dy)
}

function cumulativeOf(path: [number, number][]) {
  const cumulative = [0]
  for (let index = 1; index < path.length; index += 1) {
    cumulative.push(cumulative[index - 1] + meters(path[index - 1], path[index]))
  }
  return cumulative
}

function segmentRunMs(line: string, path: [number, number][]) {
  const distance = cumulativeOf(path).at(-1) ?? 0
  const speed = (SPEED_KMH[line] ?? 42) / 3.6
  return Math.min(14 * 60 * 1000, Math.max(50 * 1000, (distance / speed) * 1000))
}

function placements(sighting: Sighting): Placement[] {
  let routes = ROUTES[sighting.line] ?? []
  if (sighting.viaRacecourse) {
    const raced = routes.filter((route) => route.includes('RAC'))
    if (raced.some((route) => route.includes(sighting.station) && route.includes(sighting.dest))) {
      routes = raced
    }
  }
  const found: Placement[] = []
  for (const route of routes) {
    const at = route.indexOf(sighting.station)
    const dest = route.indexOf(sighting.dest)
    if (at < 0 || dest < 0) continue
    if (at === dest) {
      const fromHigher = at < route.length / 2
      const previous = fromHigher ? route[at + 1] : route[at - 1]
      if (previous) found.push({ from: previous, to: sighting.station, kind: 'approach' })
      continue
    }
    const forward = dest > at
    const previous = forward ? route[at - 1] : route[at + 1]
    if (!previous) {
      const next = forward ? route[at + 1] : route[at - 1]
      if (next) {
        found.push({
          from: sighting.station,
          to: next,
          kind: next === sighting.dest ? 'depart' : 'wait',
        })
      }
      continue
    }
    found.push({ from: previous, to: sighting.station, kind: 'approach' })
  }
  return found
}

function choosePlacement(sighting: Sighting, sightings: Sighting[]) {
  const options = placements(sighting)
  if (options.length === 0) return null
  let best = options[0]
  let bestScore = -1
  for (const option of options) {
    const matched = sightings.some((other) => {
      return (
        other.line === sighting.line &&
        other.station === option.from &&
        other.dest === sighting.dest &&
        other.viaRacecourse === sighting.viaRacecourse &&
        other.eta < sighting.eta &&
        sighting.eta - other.eta < 8 * 60 * 1000
      )
    })
    const score = matched ? 2 : option.kind === 'wait' ? 1 : 0
    if (score > bestScore) {
      best = option
      bestScore = score
    }
  }
  return best
}

function runsFromSightings(sightings: Sighting[]) {
  const runs: TrainRun[] = []
  const waiting = new Map<string, TrainRun>()
  for (const sighting of sightings) {
    const placement = choosePlacement(sighting, sightings)
    if (!placement) continue
    const path = segmentPaths.get(`${sighting.line}:${placement.from}:${placement.to}`)
    if (!path || path.length < 2) continue
    const station = stationByCode[sighting.dest]
    const run: TrainRun = {
      id: `${sighting.line}-${sighting.station}-${sighting.dest}-${sighting.eta}`,
      line: sighting.line,
      color: lineByCode[sighting.line]?.color ?? '#334155',
      station: sighting.station,
      label: `往${station?.name ?? sighting.dest}`,
      path,
      cumulative: cumulativeOf(path),
      eta: sighting.eta,
      runMs: segmentRunMs(sighting.line, path),
      kind: placement.kind,
    }
    if (run.kind !== 'approach') {
      const key = `${run.line}:${run.station}`
      const current = waiting.get(key)
      if (!current || run.eta < current.eta) waiting.set(key, run)
      continue
    }
    runs.push(run)
  }
  runs.push(...waiting.values())
  return runs
}

export function runsFromSnapshot(snapshot: TrainSnapshot) {
  const sightings: Sighting[] = []
  for (const [key, station] of Object.entries(snapshot.stations)) {
    const split = key.indexOf('-')
    if (split < 1) continue
    const line = key.slice(0, split)
    const code = key.slice(split + 1)
    for (const train of [...station.up, ...station.down]) {
      const eta = parseHongKongTime(train.time)
      if (eta === null) continue
      sightings.push({
        line,
        station: code,
        dest: train.dest,
        eta,
        viaRacecourse: train.route === 'RAC',
      })
    }
  }
  return runsFromSightings(sightings)
}

export async function fetchTrainSnapshot(signal: AbortSignal) {
  const response = await fetch('/api/trains', { signal })
  if (!response.ok) return null
  return (await response.json()) as TrainSnapshot
}

function phaseOf(id: string) {
  let hash = 0
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 33 + id.charCodeAt(index)) >>> 0
  }
  return (hash % 1000) / 1000
}

function metersPerPixel(zoom: number, latitude: number) {
  return (156543.03392 * Math.cos((latitude * Math.PI) / 180)) / 2 ** zoom
}

// At city zoom a real train crawls by a fraction of a pixel. Keep the hop from the timetable,
// but move fast enough to see until the map is close enough for the real speed.
function fractionAlong(run: TrainRun, now: number, zoom: number, timetableFraction: number) {
  const distance = run.cumulative[run.cumulative.length - 1] ?? 0
  if (distance < 1) return timetableFraction
  const latitude = run.path[0]?.[1] ?? 22.3
  const realSpeed = distance / (run.runMs / 1000)
  const visibleSpeed = 3 * metersPerPixel(zoom, latitude)
  if (realSpeed >= visibleSpeed) return timetableFraction
  const period = (distance / visibleSpeed) * 1000
  return ((now % period) / period + phaseOf(run.id)) % 1
}

export function trainCoordinate(run: TrainRun, now: number, zoom = 11): [number, number] | null {
  const remain = run.eta - now
  if (run.kind === 'wait') {
    if (remain < 0 || remain > 3 * 60 * 1000) return null
    return run.path[0]
  }
  if (run.kind === 'depart') {
    if (remain > 3 * 60 * 1000 || remain < -run.runMs) return null
    if (remain > 0) return run.path[0]
    return pointAlong(run, fractionAlong(run, now, zoom, Math.min(1, -remain / run.runMs)))
  }
  if (remain > run.runMs || remain < -20_000) return null
  const timetableFraction = Math.min(1, Math.max(0, 1 - remain / run.runMs))
  return pointAlong(run, fractionAlong(run, now, zoom, timetableFraction))
}

function pointAlong(run: TrainRun, fraction: number): [number, number] {
  const total = run.cumulative[run.cumulative.length - 1] ?? 0
  let target = total * fraction
  for (let index = 1; index < run.path.length; index += 1) {
    const step = run.cumulative[index] - run.cumulative[index - 1]
    if (target <= step || index === run.path.length - 1) {
      const ratio = step === 0 ? 0 : Math.min(1, target / step)
      const start = run.path[index - 1]
      const end = run.path[index]
      const point: [number, number] = [
        start[0] + (end[0] - start[0]) * ratio,
        start[1] + (end[1] - start[1]) * ratio,
      ]
      return point
    }
    target -= step
  }
  return run.path[run.path.length - 1] ?? run.path[0]
}

export function trainFeatures(runs: TrainRun[], now: number, zoom = 11) {
  return {
    type: 'FeatureCollection' as const,
    features: runs.flatMap((run) => {
      const coordinate = trainCoordinate(run, now, zoom)
      if (!coordinate) return []
      return [{
        type: 'Feature' as const,
        properties: {
          color: run.color,
          station: run.station,
          label: run.label,
        },
        geometry: { type: 'Point' as const, coordinates: coordinate },
      }]
    }),
  }
}
