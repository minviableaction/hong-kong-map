import { CameraPanel } from '@/components/CameraPanel'
import { MapView } from '@/components/MapView'
import { StationPanel } from '@/components/StationPanel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { fetchCameras, type Camera } from '@/lib/cameras'
import { lineByCode, lineInk, lines, searchStations, stationByCode } from '@/lib/network'
import { viewFromSnapshot } from '@/lib/schedule'
import type { TrainSnapshot } from '@/lib/snapshot'
import { fetchTrainSnapshot, runsFromSnapshot } from '@/lib/trains'
import { Building2, Camera as CameraIcon, Search, TrainFront } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

function App() {
  const [showNetwork, setShowNetwork] = useState(true)
  const [showCameras, setShowCameras] = useState(true)
  const [cameras, setCameras] = useState<Camera[]>([])
  const [cameraStatus, setCameraStatus] = useState('正在讀取快拍點…')
  const [stationCode, setStationCode] = useState<string | null>(null)
  const [lineCode, setLineCode] = useState<string | null>(null)
  const [cameraKey, setCameraKey] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [focusToken, setFocusToken] = useState(0)
  const [fitToken, setFitToken] = useState(0)
  const [threeD, setThreeD] = useState(false)
  const [snapshot, setSnapshot] = useState<TrainSnapshot | null>(null)
  const [scheduleError, setScheduleError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetchCameras(controller.signal)
      .then((list) => {
        setCameras(list)
        setCameraStatus(list.length > 0 ? `${list.length} 個快拍點` : '清單暫時沒有快拍點。')
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setCameraStatus(error instanceof Error ? error.message : '暫時無法讀取快拍點。')
      })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (!showNetwork) return
    const controller = new AbortController()
    let timer = 0
    let stopped = false

    let running = false

    async function load() {
      try {
        const next = await fetchTrainSnapshot(controller.signal)
        if (stopped) return
        if (next) {
          setSnapshot(next)
          setScheduleError(null)
        } else {
          setScheduleError('暫時未能讀取共用班次。')
        }
      } catch {
        if (!stopped) setScheduleError('暫時未能讀取共用班次。')
      }
    }

    async function tick() {
      if (stopped || document.hidden || running) return
      running = true
      try {
        await load()
      } finally {
        running = false
      }
      if (stopped || document.hidden) return
      timer = window.setTimeout(() => void tick(), 45_000)
    }

    void tick()
    const onVisibility = () => {
      window.clearTimeout(timer)
      if (!document.hidden) void tick()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stopped = true
      controller.abort()
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [showNetwork])

  const runs = useMemo(() => (snapshot ? runsFromSnapshot(snapshot) : []), [snapshot])
  const scheduleView = useMemo(() => {
    if (!snapshot || !stationCode || !lineCode) return null
    const selected = stationByCode[stationCode]
    if (!selected) return null
    return viewFromSnapshot(selected, lineCode, snapshot)
  }, [snapshot, stationCode, lineCode])

  const station = stationCode ? stationByCode[stationCode] : undefined
  const camera = cameras.find((item) => item.key === cameraKey)
  const matches = useMemo(() => searchStations(query), [query])

  function chooseStation(code: string) {
    const next = stationByCode[code]
    if (!next) return
    setStationCode(code)
    setLineCode((current) => (current && next.lines.includes(current) ? current : next.lines[0] ?? null))
    setCameraKey(null)
    setQuery('')
    setShowNetwork(true)
    setFocusToken((value) => value + 1)
  }

  function chooseCamera(key: string) {
    setCameraKey(key)
    setStationCode(null)
    setLineCode(null)
    setShowCameras(true)
    setFocusToken((value) => value + 1)
  }

  return (
    <main className="relative h-full min-h-screen w-full overflow-hidden bg-stone-100">
      <MapView
        showNetwork={showNetwork}
        showCameras={showCameras}
        cameras={cameras}
        selectedStation={stationCode}
        selectedCamera={cameraKey}
        focusToken={focusToken}
        fitToken={fitToken}
        threeD={threeD}
        runs={runs}
        onSelectStation={chooseStation}
        onSelectCamera={chooseCamera}
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center p-3 pr-16">
        <div className="pointer-events-auto w-full max-w-3xl rounded-2xl border bg-white/95 p-3 shadow-lg backdrop-blur">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h1 className="text-lg font-semibold tracking-tight">香港智慧城市地圖</h1>
              <p className="text-xs text-muted-foreground">點車站查看到站班次，點快拍點查看最新照片。</p>
            </div>
            <p className="text-xs text-muted-foreground">{cameraStatus}</p>
          </div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute top-2 left-2.5 size-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜尋車站，例如中環"
                aria-label="搜尋車站"
                className="pl-8"
              />
              {query.trim() && (
                <ul className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-xl border bg-white p-1 shadow-lg">
                  {matches.length === 0 && (
                    <li className="px-3 py-2 text-sm text-muted-foreground">沒有這個車站。</li>
                  )}
                  {matches.map((item) => (
                    <li key={item.code}>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-stone-100"
                        onClick={() => chooseStation(item.code)}
                      >
                        <span>
                          {item.name}
                          <span className="ml-2 text-xs text-muted-foreground">{item.en}</span>
                        </span>
                        <span className="flex gap-1">
                          {item.lines.slice(0, 3).map((code) => (
                            <span
                              key={code}
                              className="size-2.5 rounded-full"
                              style={{ background: lineByCode[code]?.color }}
                            />
                          ))}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant={showNetwork ? 'default' : 'outline'}
                aria-pressed={showNetwork}
                onClick={() => setShowNetwork((value) => !value)}
              >
                <TrainFront />
                港鐵
              </Button>
              <Button
                variant={showCameras ? 'default' : 'outline'}
                aria-pressed={showCameras}
                onClick={() => setShowCameras((value) => !value)}
              >
                <CameraIcon />
                快拍
              </Button>
              <Button variant="outline" onClick={() => setFitToken((value) => value + 1)}>
                全港
              </Button>
              <Button
                variant={threeD ? 'default' : 'outline'}
                aria-pressed={threeD}
                onClick={() => setThreeD((value) => !value)}
              >
                <Building2 />
                {threeD ? '俯視' : '立體'}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-3 left-3 z-20 hidden w-56 rounded-2xl border bg-white/95 p-3 shadow-lg backdrop-blur sm:block">
        <p className="mb-2 text-xs font-medium text-muted-foreground">港鐵綫</p>
        <ul className="space-y-1">
          {lines.map((line) => (
            <li key={line.code} className="flex items-center gap-2 text-xs">
              <span className="h-1.5 w-5 rounded-full" style={{ background: line.color }} />
              <span>{line.name}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
          橙色標記是交通快拍，縮小時會合併。路綫沿軌道形狀繪製。圓點是按到站時間估算的列車位置，不是衛星定位。
        </p>
      </div>

      <div className="pointer-events-auto absolute bottom-3 left-3 z-20 sm:hidden">
        <details className="max-w-[70vw] rounded-2xl border bg-white/95 p-2 text-xs shadow-lg">
          <summary className="cursor-pointer px-1 font-medium">路綫圖例</summary>
          <ul className="mt-2 space-y-1">
            {lines.map((line) => (
              <li key={line.code} className="flex items-center gap-2">
                <span
                  className="rounded-full px-1.5 py-0.5 text-[10px]"
                  style={{ background: line.color, color: lineInk(line.color) }}
                >
                  {line.name}
                </span>
              </li>
            ))}
          </ul>
        </details>
      </div>

      {(station && lineCode) || camera ? (
        <div className="pointer-events-none absolute inset-x-3 bottom-3 z-30 sm:inset-y-28 sm:right-3 sm:bottom-3 sm:left-auto sm:w-[380px]">
          {station && lineCode ? (
            <StationPanel
              station={station}
              line={lineCode}
              view={scheduleView}
              loading={snapshot === null && !scheduleError}
              error={scheduleError}
              onLineChange={setLineCode}
              onClose={() => {
                setStationCode(null)
                setLineCode(null)
              }}
            />
          ) : camera ? (
            <CameraPanel key={camera.key} camera={camera} onClose={() => setCameraKey(null)} />
          ) : null}
        </div>
      ) : null}
    </main>
  )
}

export default App
