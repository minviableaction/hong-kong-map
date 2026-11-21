import type { Camera } from '../lib/cameras.ts'
import { stationJobs } from '../lib/routes.ts'
import type { CachedStation, CachedTrain, TrainSnapshot } from '../lib/snapshot.ts'

const SCHEDULE_URL = 'https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php'
const CAMERA_LIST_URL =
  'https://static.data.gov.hk/td/traffic-snapshot-images/code/Traffic_Camera_Locations_Tc.xml'
const CAMERA_IMAGE_ORIGIN = 'https://tdcctv.data.one.gov.hk'

const SCHEDULE_FRESH_MS = 60_000
const CAMERA_LIST_FRESH_MS = 6 * 60 * 60 * 1000
const IMAGE_FRESH_MS = 90_000
const IMAGE_REFRESH_MIN_MS = 30_000
const UPSTREAM_CONCURRENCY = 2
const UPSTREAM_GAP_MS = 40
const WORKER_CHUNK = 40
const STORE_URL = 'https://hk-map.internal/schedule-store'
const RATE_LIMIT_COOLDOWN_MS = 120_000
const IMAGE_CACHE_LIMIT = 80
const CAMERA_KEY = /^[A-Za-z0-9]{2,16}$/

const SHARED_CACHE = 'public, max-age=20, s-maxage=45, stale-while-revalidate=120'

type RawTrain = { dest?: string; time?: string; plat?: string; route?: string; valid?: string }

type ScheduleStore = TrainSnapshot & { cursor: number; updatedAt: number }

let schedule: ScheduleStore | null = null
let scheduleRefresh: Promise<void> | null = null
let scheduleBlockedUntil = 0
let scheduleUpstreamFetches = 0

let cameraList: { fetchedAt: number; cameras: Camera[] } | null = null
let cameraRefresh: Promise<void> | null = null

type ImageEntry = { at: number; body: Uint8Array; type: string }
const images = new Map<string, ImageEntry>()
const imageRefresh = new Map<string, Promise<ImageFetch>>()
const imageBlockedUntil = new Map<string, number>()
const imageUpstreamAt: number[] = []
const IMAGE_UPSTREAM_WINDOW_MS = 10_000
const IMAGE_UPSTREAM_BUDGET = 8
const IMAGE_FAILURE_COOLDOWN_MS = 60_000

type ImageFetch = 'ok' | 'throttled' | 'failed'

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function cacheHeaders(hit: string, extra?: Record<string, string>) {
  return {
    'cache-control': SHARED_CACHE,
    'x-cache': hit,
    'x-upstream-fetches': String(scheduleUpstreamFetches),
    ...extra,
  }
}

function keepTrain(train: RawTrain): CachedTrain | null {
  if (train.valid === 'N' || !train.dest || !train.time) return null
  return {
    dest: train.dest,
    time: train.time,
    ...(train.plat ? { plat: train.plat } : {}),
    ...(train.route ? { route: train.route } : {}),
  }
}

async function fetchStation(line: string, station: string): Promise<CachedStation | 'blocked' | null> {
  if (Date.now() < scheduleBlockedUntil) return 'blocked'
  const url = new URL(SCHEDULE_URL)
  url.searchParams.set('line', line)
  url.searchParams.set('sta', station)
  url.searchParams.set('lang', 'TC')
  scheduleUpstreamFetches += 1
  let response: Response
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(8000) })
  } catch {
    return null
  }
  if (response.status === 429) {
    scheduleBlockedUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS
    return 'blocked'
  }
  if (!response.ok) return null
  const payload = (await response.json()) as {
    isdelay?: string
    curr_time?: string
    sys_time?: string
    data?: Record<string, { curr_time?: string; UP?: RawTrain[]; DOWN?: RawTrain[] }>
  }
  const bucket = payload.data?.[`${line}-${station}`]
  const up = (bucket?.UP ?? []).map(keepTrain).filter((train) => train !== null)
  const down = (bucket?.DOWN ?? []).map(keepTrain).filter((train) => train !== null)
  return {
    currTime: bucket?.curr_time ?? payload.curr_time ?? payload.sys_time ?? null,
    delay: payload.isdelay === 'Y',
    up,
    down,
  }
}

function edgeCache() {
  const cachesApi = (globalThis as {
    caches?: { default?: { match(request: string): Promise<Response | undefined>; put(request: string, response: Response): Promise<void> } }
  }).caches
  return cachesApi?.default ?? null
}

async function loadStore() {
  if (schedule) return schedule
  const cache = edgeCache()
  if (!cache) return null
  const hit = await cache.match(STORE_URL)
  if (!hit) return null
  const stored = (await hit.json()) as ScheduleStore
  schedule = stored
  return stored
}

async function saveStore(store: ScheduleStore) {
  schedule = store
  const cache = edgeCache()
  if (!cache) return
  try {
    await cache.put(
      STORE_URL,
      new Response(JSON.stringify(store), { headers: { 'content-type': 'application/json' } }),
    )
  } catch {
    // This instance still serves the merged snapshot if the edge cache rejects the write.
  }
}

const URBAN_FIRST = new Set([
  'CEN', 'ADM', 'TST', 'JOR', 'YMT', 'MOK', 'HOK', 'KOW', 'HKU', 'SYP', 'SHW', 'WAC',
  'EXC', 'MKK', 'HUH', 'NOP', 'QUB', 'TAW',
])

function refreshOrder() {
  const byLine = new Map<string, { line: string; station: string }[]>()
  for (const job of stationJobs()) {
    const list = byLine.get(job.line) ?? []
    list.push(job)
    byLine.set(job.line, list)
  }
  for (const list of byLine.values()) {
    list.sort((a, b) => Number(URBAN_FIRST.has(b.station)) - Number(URBAN_FIRST.has(a.station)))
  }
  const lines = [...byLine.keys()]
  const ordered: { line: string; station: string }[] = []
  let index = 0
  let remaining = stationJobs().length
  while (remaining > 0) {
    for (const line of lines) {
      const list = byLine.get(line) ?? []
      if (index < list.length) {
        ordered.push(list[index])
        remaining -= 1
      }
    }
    index += 1
  }
  return ordered
}

async function refreshSchedules() {
  const jobs = refreshOrder()
  const store = (await loadStore()) ?? { fetchedAt: 0, updatedAt: 0, cursor: 0, stations: {} }
  const stations: Record<string, CachedStation> = { ...store.stations }
  const chunk = Math.min(WORKER_CHUNK, jobs.length)
  const selected = Array.from({ length: chunk }, (_, offset) => jobs[(store.cursor + offset) % jobs.length])
  let taken = 0
  let blocked = false

  async function worker() {
    while (!blocked) {
      const index = taken
      taken += 1
      if (index >= selected.length) return
      const job = selected[index]
      const result = await fetchStation(job.line, job.station)
      if (result === 'blocked') {
        blocked = true
        return
      }
      if (result) stations[`${job.line}-${job.station}`] = result
      await sleep(UPSTREAM_GAP_MS)
    }
  }

  await Promise.all(Array.from({ length: Math.min(UPSTREAM_CONCURRENCY, selected.length) }, () => worker()))
  const finished = blocked ? Math.max(0, taken - 1) : selected.length
  const nextCursor = (store.cursor + finished) % jobs.length
  const covered = Object.keys(stations).length >= jobs.length
  const next: ScheduleStore = {
    fetchedAt: !blocked && covered && nextCursor === 0 ? Date.now() : store.fetchedAt,
    updatedAt: Date.now(),
    cursor: nextCursor,
    stations,
  }
  await saveStore(next)
}

function shouldRefresh(store: ScheduleStore | null) {
  if (Date.now() < scheduleBlockedUntil && store && Object.keys(store.stations).length > 0) return false
  if (!store || Object.keys(store.stations).length === 0) return true
  const incomplete = Object.keys(store.stations).length < stationJobs().length || store.cursor !== 0
  if (incomplete) return Date.now() - store.updatedAt >= 8_000
  return Date.now() - store.fetchedAt >= SCHEDULE_FRESH_MS
}

function startScheduleRefresh() {
  if (scheduleRefresh) return scheduleRefresh
  if (!shouldRefresh(schedule)) return Promise.resolve()
  scheduleRefresh = refreshSchedules().finally(() => {
    scheduleRefresh = null
  })
  return scheduleRefresh
}

export async function trainsResponse() {
  if (!schedule) await loadStore()
  const covered = Object.keys(schedule?.stations ?? {}).length
  const thin = covered < 80
  if (shouldRefresh(schedule)) {
    const pending = startScheduleRefresh()
    if (thin) await pending
  }
  const age = schedule?.fetchedAt ? Date.now() - schedule.fetchedAt : Number.POSITIVE_INFINITY
  const hit = !schedule ? 'MISS' : age < SCHEDULE_FRESH_MS ? 'HIT' : 'STALE'
  const body: TrainSnapshot = schedule
    ? { fetchedAt: schedule.fetchedAt, stations: schedule.stations }
    : { fetchedAt: 0, stations: {} }
  return Response.json(body, {
    headers: cacheHeaders(hit, {
      'x-schedule-stations': String(Object.keys(body.stations).length),
      'x-schedule-cursor': String(schedule?.cursor ?? 0),
    }),
  })
}

export async function warmSchedules() {
  if (!schedule) await loadStore()
  if (!shouldRefresh(schedule)) return
  await startScheduleRefresh()
}

function tag(block: string, name: string) {
  const match = new RegExp(`<${name}>([^<]*)</${name}>`).exec(block)
  return match?.[1]?.trim() ?? ''
}

function parseCameras(xml: string) {
  const cameras: Camera[] = []
  for (const block of xml.split('<image>').slice(1)) {
    const key = tag(block, 'key')
    const lat = Number(tag(block, 'latitude'))
    const lon = Number(tag(block, 'longitude'))
    if (!CAMERA_KEY.test(key) || !Number.isFinite(lat) || !Number.isFinite(lon)) continue
    if (lat < 22 || lat > 23 || lon < 113.5 || lon > 114.6) continue
    cameras.push({
      key,
      region: tag(block, 'region'),
      district: tag(block, 'district'),
      description: tag(block, 'description'),
      lat,
      lon,
    })
  }
  return cameras
}

async function refreshCameras() {
  const response = await fetch(CAMERA_LIST_URL, { signal: AbortSignal.timeout(20000) })
  if (!response.ok) return
  const cameras = parseCameras(await response.text())
  if (cameras.length > 0) cameraList = { fetchedAt: Date.now(), cameras }
}

function startCameraRefresh() {
  if (!cameraRefresh) {
    cameraRefresh = refreshCameras().finally(() => {
      cameraRefresh = null
    })
  }
  return cameraRefresh
}

export async function camerasResponse() {
  let fresh = Boolean(cameraList && Date.now() - cameraList.fetchedAt < CAMERA_LIST_FRESH_MS)
  if (!fresh) {
    const pending = startCameraRefresh()
    if (!cameraList) await pending
  }
  fresh = Boolean(cameraList && Date.now() - cameraList.fetchedAt < CAMERA_LIST_FRESH_MS)
  const hit = !cameraList ? 'MISS' : fresh ? 'HIT' : 'STALE'
  return Response.json(cameraList?.cameras ?? [], {
    headers: {
      'cache-control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
      'x-cache': hit,
    },
  })
}

function rememberImage(key: string, entry: ImageEntry) {
  images.delete(key)
  images.set(key, entry)
  while (images.size > IMAGE_CACHE_LIMIT) {
    const oldest = images.keys().next().value
    if (!oldest) break
    images.delete(oldest)
  }
}

function allowImageUpstream() {
  const now = Date.now()
  while (imageUpstreamAt.length > 0 && now - imageUpstreamAt[0] > IMAGE_UPSTREAM_WINDOW_MS) {
    imageUpstreamAt.shift()
  }
  if (imageUpstreamAt.length >= IMAGE_UPSTREAM_BUDGET) return false
  imageUpstreamAt.push(now)
  return true
}

async function refreshImage(key: string): Promise<ImageFetch> {
  if (!allowImageUpstream()) return 'throttled'
  try {
    const response = await fetch(`${CAMERA_IMAGE_ORIGIN}/${key}.JPG`, { signal: AbortSignal.timeout(8000) })
    const type = response.headers.get('content-type') ?? ''
    if (!response.ok || !type.startsWith('image/')) {
      imageBlockedUntil.set(key, Date.now() + IMAGE_FAILURE_COOLDOWN_MS)
      return 'failed'
    }
    const body = new Uint8Array(await response.arrayBuffer())
    if (body.byteLength < 32 || body.byteLength > 500_000) {
      imageBlockedUntil.set(key, Date.now() + IMAGE_FAILURE_COOLDOWN_MS)
      return 'failed'
    }
    imageBlockedUntil.delete(key)
    rememberImage(key, { at: Date.now(), body, type })
    return 'ok'
  } catch {
    imageBlockedUntil.set(key, Date.now() + IMAGE_FAILURE_COOLDOWN_MS)
    return 'failed'
  }
}

function startImageRefresh(key: string) {
  const existing = imageRefresh.get(key)
  if (existing) return existing
  const pending = refreshImage(key).finally(() => {
    imageRefresh.delete(key)
  })
  imageRefresh.set(key, pending)
  return pending
}

function knownCamera(key: string) {
  return cameraList?.cameras.some((camera) => camera.key === key) ?? false
}

export async function cameraImageResponse(key: string, fresh: boolean) {
  if (!CAMERA_KEY.test(key)) {
    return Response.json({ error: '未知的快拍編號。' }, { status: 400, headers: { 'cache-control': 'public, max-age=300' } })
  }
  if (!cameraList) await startCameraRefresh()
  if (!knownCamera(key)) {
    return Response.json(
      { error: '未知的快拍編號。' },
      { status: 404, headers: { 'cache-control': 'public, max-age=300' } },
    )
  }
  const cached = images.get(key)
  const age = cached ? Date.now() - cached.at : Number.POSITIVE_INFINITY
  const blocked = (imageBlockedUntil.get(key) ?? 0) > Date.now()
  const due = !blocked && (age >= IMAGE_FRESH_MS || (fresh && age >= IMAGE_REFRESH_MIN_MS))
  let outcome: ImageFetch | 'cached' = 'cached'
  if (due) {
    const pending = startImageRefresh(key)
    if (!cached) outcome = await pending
  }
  const image = images.get(key)
  if (!image) {
    const throttled = outcome === 'throttled'
    return Response.json(
      { error: throttled ? '快拍相片太忙，請稍後再看。' : '暫時沒有這處的快拍照片。' },
      {
        status: throttled ? 429 : 404,
        headers: {
          'cache-control': 'public, max-age=15',
          'retry-after': '15',
        },
      },
    )
  }
  const bytes = new Uint8Array(image.body)
  return new Response(bytes, {
    headers: {
      'content-type': image.type,
      'cache-control': 'public, max-age=30, s-maxage=60, stale-while-revalidate=120',
      'x-cache': age < IMAGE_FRESH_MS && !fresh ? 'HIT' : 'MISS',
    },
  })
}
