import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cameraImageUrl, type Camera } from '@/lib/cameras'
import { X } from 'lucide-react'
import { useState } from 'react'

type CameraPanelProps = {
  camera: Camera
  onClose: () => void
}

export function CameraPanel({ camera, onClose }: CameraPanelProps) {
  const [failed, setFailed] = useState(false)
  const [cacheKey, setCacheKey] = useState(0)

  return (
    <section
      aria-label={camera.description || '交通快拍'}
      className="pointer-events-auto flex max-h-[min(58vh,560px)] flex-col overflow-hidden rounded-2xl border bg-white shadow-xl sm:h-full sm:max-h-none"
    >
      <header className="flex items-start justify-between gap-3 border-b px-4 py-3">
        <div>
          <p className="text-xs text-muted-foreground">運輸署交通快拍</p>
          <h2 className="text-lg font-semibold leading-snug">
            {camera.description || camera.key}
          </h2>
          <p className="text-sm text-muted-foreground">
            {[camera.region, camera.district].filter(Boolean).join(' · ')}
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="關閉快拍">
          <X />
        </Button>
      </header>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-3 px-4 py-4">
          {failed ? (
            <p className="rounded-xl bg-stone-100 px-3 py-3 text-sm leading-6 text-stone-800">
              暫時沒有這處的快拍照片。鏡頭可能暫停服務，或圖片暫時載入不到。
            </p>
          ) : (
            <img
              src={cameraImageUrl(camera.key, cacheKey)}
              alt={camera.description || `${camera.key} 的交通快拍`}
              width={320}
              height={240}
              className="w-full rounded-xl bg-stone-100"
              onError={() => setFailed(true)}
            />
          )}
          <p className="text-xs leading-5 text-muted-foreground">
            這是運輸署目前提供的最新快拍，約每兩分鐘更新。拍攝時間印在照片角落。照片大小為 320×240。
          </p>
          <Button
            variant="outline"
            onClick={() => {
              setFailed(false)
              setCacheKey(Date.now())
            }}
          >
            重新載入照片
          </Button>
        </div>
      </ScrollArea>
    </section>
  )
}
