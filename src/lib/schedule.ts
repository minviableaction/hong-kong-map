import { lineByCode, stationByCode, type Station } from '@/lib/network'

const ENDPOINT = 'https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php'

type RawTrain = {
  dest?: string
  plat?: string
  time?: string
  ttnt?: string
  valid?: string
  route?: string
}

type RawPayload = {
  status?: number
  message?: string
  isdelay?: string
  curr_time?: string
  data?: Record<string, { UP?: RawTrain[]; DOWN?: RawTrain[] }>
}

export type DisplayTrain = {
  destination: string
  platform: string
  when: string
  clock: string
  viaRacecourse: boolean
}

export type DirectionView = {
  label: string
  trains: DisplayTrain[]
  emptyNote: string | null
}

export type ScheduleView = {
  delay: boolean
  updatedAt: string | null
  stationNote: string | null
  directions: DirectionView[]
}

export class ScheduleRequestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ScheduleRequestError'
  }
}

function destinationName(code: string | undefined) {
  if (!code) return '未明方向'
  return stationByCode[code]?.name ?? code
}

function whenLabel(ttnt: string | undefined) {
  const minutes = Number(ttnt)
  if (!Number.isFinite(minutes) || minutes <= 0) return '即將開出'
  return minutes === 1 ? '約 1 分鐘' : `約 ${minutes} 分鐘`
}

function clockLabel(time: string | undefined) {
  if (!time || time.length < 16) return ''
  return time.slice(11, 16)
}

function presentTrains(trains: RawTrain[]): DisplayTrain[] {
  return trains
    .filter((train) => train.valid !== 'N')
    .map((train) => ({
      destination: destinationName(train.dest),
      platform: train.plat ? `${train.plat} 號月台` : '月台未明',
      when: whenLabel(train.ttnt),
      clock: clockLabel(train.time),
      viaRacecourse: train.route === 'RAC',
    }))
}

function directionLabel(trains: DisplayTrain[]) {
  const names = [...new Set(trains.map((train) => train.destination))]
  if (names.length === 0) return '另一方向'
  return `往${names.join('／')}`
}

function emptyDirectionNote(station: Station, line: string) {
  if (station.terminalLines.includes(line)) return '終點站，這個方向沒有班次。'
  return '這個方向現時沒有班次。'
}

export function interpretSchedule(station: Station, line: string, payload: RawPayload): ScheduleView {
  if (payload.status !== 1) {
    throw new ScheduleRequestError('港鐵暫時沒有這站的班次資料。')
  }

  const bucket = payload.data?.[`${line}-${station.code}`]
  const up = presentTrains(bucket?.UP ?? [])
  const down = presentTrains(bucket?.DOWN ?? [])
  const updatedAt = payload.curr_time ? payload.curr_time.slice(11, 16) : null
  const delay = payload.isdelay === 'Y'

  if (up.length === 0 && down.length === 0) {
    const stationNote =
      station.code === 'RAC'
        ? '馬場站通常只在賽馬日提供班次。現時沒有即將到站的列車。'
        : '現時沒有即將到站的班次。可能是非服務時間，或這站暫時沒有班次資料。'
    return { delay, updatedAt, stationNote, directions: [] }
  }

  const emptyNote = emptyDirectionNote(station, line)
  return {
    delay,
    updatedAt,
    stationNote: null,
    directions: [
      { label: directionLabel(up), trains: up, emptyNote: up.length ? null : emptyNote },
      { label: directionLabel(down), trains: down, emptyNote: down.length ? null : emptyNote },
    ],
  }
}

export async function fetchSchedule(station: Station, line: string, signal: AbortSignal) {
  if (!lineByCode[line] || !station.lines.includes(line)) {
    throw new ScheduleRequestError('這站沒有這條綫的班次。')
  }

  let response: Response
  try {
    const url = new URL(ENDPOINT)
    url.searchParams.set('line', line)
    url.searchParams.set('sta', station.code)
    url.searchParams.set('lang', 'TC')
    response = await fetch(url, { signal })
  } catch (error) {
    if (signal.aborted) throw error
    throw new ScheduleRequestError('暫時無法連到港鐵到站資料，請稍後再試。')
  }

  if (response.status === 429) {
    throw new ScheduleRequestError('查詢太密，請稍後再試。')
  }
  if (!response.ok) {
    throw new ScheduleRequestError('暫時無法連到港鐵到站資料，請稍後再試。')
  }

  const payload = (await response.json()) as RawPayload
  return interpretSchedule(station, line, payload)
}
