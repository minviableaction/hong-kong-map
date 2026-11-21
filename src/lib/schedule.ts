import { stationByCode, type Station } from '@/lib/network'
import type { TrainSnapshot } from '@/lib/snapshot'

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
  sys_time?: string
  data?: Record<string, { UP?: RawTrain[]; DOWN?: RawTrain[]; curr_time?: string }>
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

const HONG_KONG_OFFSET_MS = 8 * 60 * 60 * 1000

export function parseHongKongTime(value: string | undefined) {
  if (!value) return null
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(value)
  if (!match) return null
  const [, year, month, day, hour, minute, second] = match
  return Date.UTC(+year, +month - 1, +day, +hour, +minute, +second) - HONG_KONG_OFFSET_MS
}

function whenLabel(trainTime: string | undefined, reference: string | undefined) {
  const due = parseHongKongTime(trainTime)
  const now = parseHongKongTime(reference)
  if (due === null || now === null) return '即將開出'
  const minutes = Math.round((due - now) / 60000)
  if (minutes <= 0) return '即將開出'
  return minutes === 1 ? '約 1 分鐘' : `約 ${minutes} 分鐘`
}

function clockLabel(time: string | undefined) {
  if (!time || time.length < 16) return ''
  return time.slice(11, 16)
}

function presentTrains(trains: RawTrain[], reference: string | undefined): DisplayTrain[] {
  return trains
    .filter((train) => train.valid !== 'N')
    .map((train) => ({
      destination: destinationName(train.dest),
      platform: train.plat ? `${train.plat} 號月台` : '月台未明',
      when: whenLabel(train.time, reference),
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

export function viewFromSnapshot(station: Station, line: string, snapshot: TrainSnapshot): ScheduleView {
  const key = `${line}-${station.code}`
  const cached = snapshot.stations[key]
  if (!cached) {
    return {
      delay: false,
      updatedAt: null,
      stationNote: '共用班次暫時沒有這站。請稍後再看。',
      directions: [],
    }
  }
  return interpretSchedule(station, line, {
    status: 1,
    isdelay: cached.delay ? 'Y' : 'N',
    curr_time: cached.currTime ?? undefined,
    data: {
      [key]: {
        curr_time: cached.currTime ?? undefined,
        UP: cached.up,
        DOWN: cached.down,
      },
    },
  })
}

export function interpretSchedule(station: Station, line: string, payload: RawPayload): ScheduleView {
  if (payload.status !== 1) {
    throw new ScheduleRequestError('港鐵暫時沒有這站的班次資料。')
  }

  const bucket = payload.data?.[`${line}-${station.code}`]
  const reference = bucket?.curr_time ?? payload.curr_time ?? payload.sys_time
  const up = presentTrains(bucket?.UP ?? [], reference)
  const down = presentTrains(bucket?.DOWN ?? [], reference)
  const updatedAt = reference ? reference.slice(11, 16) : null
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
