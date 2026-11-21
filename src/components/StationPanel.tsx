import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { lineByCode, lineInk, type Station } from '@/lib/network'
import type { ScheduleView } from '@/lib/schedule'
import { X } from 'lucide-react'

type StationPanelProps = {
  station: Station
  line: string
  view: ScheduleView | null
  loading: boolean
  error: string | null
  onLineChange: (line: string) => void
  onClose: () => void
}

export function StationPanel({
  station,
  line,
  view,
  loading,
  error,
  onLineChange,
  onClose,
}: StationPanelProps) {

  const lineInfo = lineByCode[line]

  return (
    <section
      aria-label={`${station.name}到站班次`}
      className="pointer-events-auto flex max-h-[min(58vh,560px)] flex-col overflow-hidden rounded-2xl border bg-white shadow-xl sm:max-h-none sm:h-full"
    >
      <header className="flex items-start justify-between gap-3 border-b px-4 py-3">
        <div>
          <p className="text-xs text-muted-foreground">港鐵到站班次</p>
          <h2 className="text-xl font-semibold tracking-tight">{station.name}</h2>
          <p className="text-sm text-muted-foreground">{station.en}</p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="關閉班次">
          <X />
        </Button>
      </header>
      <div className="flex flex-wrap gap-1.5 px-4 py-3">
        {station.lines.map((code) => {
          const info = lineByCode[code]
          const selected = code === line
          return (
            <button
              key={code}
              type="button"
              aria-pressed={selected}
              onClick={() => onLineChange(code)}
              className="rounded-full px-2.5 py-1 text-xs font-medium"
              style={{
                background: info?.color ?? '#334155',
                color: lineInk(info?.color ?? '#334155'),
                outline: selected ? '2px solid #1c1917' : '2px solid transparent',
                outlineOffset: 1,
              }}
            >
              {info?.name ?? code}
            </button>
          )
        })}
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 px-4 pb-4">
          {loading && !view && <p className="text-sm text-muted-foreground">正在查詢到站班次…</p>}
          {error && (
            <p className="rounded-xl bg-amber-50 px-3 py-3 text-sm text-amber-950">{error}</p>
          )}
          {view && (
            <>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>{lineInfo?.name}</span>
                {view.updatedAt && <span>資料時間 {view.updatedAt}</span>}
                {view.delay && <Badge variant="destructive">有延誤</Badge>}
              </div>
              {view.stationNote && (
                <p className="rounded-xl bg-stone-100 px-3 py-3 text-sm leading-6 text-stone-800">
                  {view.stationNote}
                </p>
              )}
              {view.directions.map((direction) => (
                <div key={direction.label + (direction.emptyNote ?? '')} className="space-y-2">
                  <h3 className="text-sm font-semibold">{direction.label}</h3>
                  {direction.emptyNote && (
                    <p className="rounded-xl bg-stone-100 px-3 py-3 text-sm text-stone-800">
                      {direction.emptyNote}
                    </p>
                  )}
                  <ul className="space-y-2">
                    {direction.trains.map((train, index) => (
                      <li
                        key={`${train.destination}-${train.clock}-${index}`}
                        className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2"
                      >
                        <div>
                          <p className="font-medium">
                            往{train.destination}
                            {train.viaRacecourse ? '（經馬場）' : ''}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {train.platform}
                            {train.clock ? ` · ${train.clock}` : ''}
                          </p>
                        </div>
                        <p className="shrink-0 text-sm font-semibold">{train.when}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <p className="text-xs leading-5 text-muted-foreground">
                班次來自共用的港鐵到站快取，大約每分鐘更新一次，所有人讀同一份。終點站代碼已改寫成中文站名。
              </p>
            </>
          )}
        </div>
      </ScrollArea>
    </section>
  )
}
