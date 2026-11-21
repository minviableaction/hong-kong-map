import { cameraFeatures, type Camera } from '@/lib/cameras'
import { trainFeatures, type TrainRun } from '@/lib/trains'
import {
  lineFeatures,
  lines,
  stationBounds,
  stationByCode,
  stationFeatures,
} from '@/lib/network'
import { Map, NavigationControl, type GeoJSONSource, type MapMouseEvent } from 'maplibre-gl'
import { useEffect, useRef, useState } from 'react'

const STYLE = 'https://tiles.openfreemap.org/styles/liberty'

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath()
  context.moveTo(x + radius, y)
  context.arcTo(x + width, y, x + width, y + height, radius)
  context.arcTo(x + width, y + height, x, y + height, radius)
  context.arcTo(x, y + height, x, y, radius)
  context.arcTo(x, y, x + width, y, radius)
  context.closePath()
}

function trainMarker(color: string) {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (!context) return null
  context.clearRect(0, 0, size, size)
  roundedRect(context, 2, 8, 60, 42, 14)
  context.fillStyle = '#ffffff'
  context.fill()
  roundedRect(context, 8, 14, 48, 28, 10)
  context.fillStyle = color
  context.fill()
  context.fillStyle = '#ffffff'
  context.fillRect(16, 22, 12, 9)
  context.fillRect(36, 22, 12, 9)
  context.beginPath()
  context.arc(20, 46, 5, 0, Math.PI * 2)
  context.arc(44, 46, 5, 0, Math.PI * 2)
  context.fillStyle = '#1c1917'
  context.fill()
  return context.getImageData(0, 0, size, size)
}

function trainImageId(color: string) {
  return `train-${color.slice(1)}`
}

function browserCanDrawMap() {
  if (typeof document === 'undefined') return true
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
  } catch {
    return false
  }
}

function stationFocusData(code: string | null) {
  const station = code ? stationByCode[code] : undefined
  if (!station) return { type: 'FeatureCollection' as const, features: [] }
  return {
    type: 'FeatureCollection' as const,
    features: [
      {
        type: 'Feature' as const,
        properties: {},
        geometry: { type: 'Point' as const, coordinates: [station.lon, station.lat] },
      },
    ],
  }
}

type MapViewProps = {
  showNetwork: boolean
  showCameras: boolean
  cameras: Camera[]
  selectedStation: string | null
  selectedCamera: string | null
  focusToken: number
  fitToken: number
  threeD: boolean
  runs: TrainRun[]
  onSelectStation: (code: string) => void
  onSelectCamera: (key: string) => void
}

export function MapView({
  showNetwork,
  showCameras,
  cameras,
  selectedStation,
  selectedCamera,
  focusToken,
  fitToken,
  threeD,
  runs,
  onSelectStation,
  onSelectCamera,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<Map | null>(null)
  const camerasRef = useRef(cameras)
  const selectedStationRef = useRef(selectedStation)
  const visibilityRef = useRef({ showNetwork, showCameras })
  const handlersRef = useRef({ onSelectStation, onSelectCamera })
  const runsRef = useRef(runs)
  const threeDRef = useRef(threeD)
  const [canDraw] = useState(browserCanDrawMap)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    camerasRef.current = cameras
    selectedStationRef.current = selectedStation
    visibilityRef.current = { showNetwork, showCameras }
    handlersRef.current = { onSelectStation, onSelectCamera }
    runsRef.current = runs
    threeDRef.current = threeD
  })

  useEffect(() => {
    const container = containerRef.current
    if (!container || !canDraw) return

    let map: Map
    try {
      map = new Map({
        container,
        style: STYLE,
        bounds: stationBounds(),
        fitBoundsOptions: { padding: 48 },
        maxBounds: [
          [113.55, 22.05],
          [114.62, 22.68],
        ],
        failIfMajorPerformanceCaveat: false,
        attributionControl: { compact: false },
        maxPitch: 75,
      })
    } catch (error) {
      console.error(error)
      queueMicrotask(() => setFailed(true))
      return
    }
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right')
    mapRef.current = map

    map.on('load', () => {
      map.addSource('mtr-lines', { type: 'geojson', data: lineFeatures() })
      map.addLayer({
        id: 'mtr-lines-casing',
        type: 'line',
        source: 'mtr-lines',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#ffffff',
          'line-width': ['interpolate', ['linear'], ['zoom'], 9, 4, 13, 7, 16, 11],
          'line-opacity': 0.92,
        },
      })
      map.addLayer({
        id: 'mtr-lines',
        type: 'line',
        source: 'mtr-lines',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': ['interpolate', ['linear'], ['zoom'], 9, 2.2, 13, 4.2, 16, 7],
          'line-opacity': 0.95,
        },
      })

      map.addSource('stations', { type: 'geojson', data: stationFeatures() })
      map.addLayer({
        id: 'stations',
        type: 'circle',
        source: 'stations',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 3.5, 13, 5.5, 16, 7.5],
          'circle-color': '#ffffff',
          'circle-stroke-color': '#1c1917',
          'circle-stroke-width': 1.6,
        },
      })
      map.addLayer({
        id: 'station-labels',
        type: 'symbol',
        source: 'stations',
        minzoom: 12,
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Regular'],
          'text-size': 13,
          'text-offset': [0, 0.95],
          'text-anchor': 'top',
          'text-allow-overlap': true,
          'text-padding': 1,
        },
        paint: {
          'text-color': '#1c1917',
          'text-halo-color': '#ffffff',
          'text-halo-width': 1.4,
        },
      })

      map.addSource('cameras', {
        type: 'geojson',
        data: cameraFeatures(camerasRef.current),
        cluster: true,
        clusterRadius: 46,
        clusterMaxZoom: 14,
      })
      map.addLayer({
        id: 'cameras-cluster',
        type: 'circle',
        source: 'cameras',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#c2410c',
          'circle-radius': ['step', ['get', 'point_count'], 14, 30, 18, 120, 24],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
        },
      })
      map.addLayer({
        id: 'cameras-count',
        type: 'symbol',
        source: 'cameras',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-font': ['Noto Sans Bold'],
          'text-size': 12,
        },
        paint: { 'text-color': '#ffffff' },
      })
      map.addLayer({
        id: 'cameras',
        type: 'circle',
        source: 'cameras',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-radius': 5,
          'circle-color': '#ea580c',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1.5,
        },
      })

      map.addSource('station-focus', {
        type: 'geojson',
        data: stationFocusData(selectedStationRef.current),
      })
      map.addLayer({
        id: 'station-focus',
        type: 'circle',
        source: 'station-focus',
        paint: {
          'circle-radius': 12,
          'circle-color': 'rgba(0,0,0,0)',
          'circle-stroke-color': '#1c1917',
          'circle-stroke-width': 2,
        },
      })

      for (const line of lines) {
        const image = trainMarker(line.color)
        const imageId = trainImageId(line.color)
        if (image && !map.hasImage(imageId)) map.addImage(imageId, image, { pixelRatio: 2 })
      }
      map.addSource('trains', { type: 'geojson', data: trainFeatures(runsRef.current, Date.now(), map.getZoom()) })
      map.addLayer({
        id: 'trains',
        type: 'symbol',
        source: 'trains',
        layout: {
          'icon-image': ['concat', 'train-', ['slice', ['get', 'color'], 1]],
          'icon-size': ['interpolate', ['linear'], ['zoom'], 9, 0.78, 13, 0.92, 16, 1.05],
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'icon-pitch-alignment': 'viewport',
        },
      })
      map.addLayer({
        id: 'train-labels',
        type: 'symbol',
        source: 'trains',
        minzoom: 13,
        layout: {
          'text-field': ['get', 'label'],
          'text-font': ['Noto Sans Regular'],
          'text-size': 12,
          'text-offset': [0, 1.45],
          'text-anchor': 'top',
          'text-allow-overlap': false,
          'text-optional': true,
        },
        paint: {
          'text-color': '#1c1917',
          'text-halo-color': '#ffffff',
          'text-halo-width': 1.4,
        },
      })

      const interactive = ['trains', 'stations', 'cameras', 'cameras-cluster']
      for (const layer of interactive) {
        map.on('mouseenter', layer, () => {
          map.getCanvas().style.cursor = 'pointer'
        })
        map.on('mouseleave', layer, () => {
          map.getCanvas().style.cursor = ''
        })
      }
      const networkVisibility = visibilityRef.current.showNetwork ? 'visible' : 'none'
      const cameraVisibility = visibilityRef.current.showCameras ? 'visible' : 'none'
      for (const layer of ['mtr-lines', 'mtr-lines-casing', 'stations', 'station-labels', 'station-focus', 'trains', 'train-labels']) {
        map.setLayoutProperty(layer, 'visibility', networkVisibility)
      }
      for (const layer of ['cameras', 'cameras-cluster', 'cameras-count']) {
        map.setLayoutProperty(layer, 'visibility', cameraVisibility)
      }
      map.on('click', (event: MapMouseEvent) => {
        const features = map.queryRenderedFeatures(event.point, { layers: interactive })
        const feature = features[0]
        if (!feature) return
        const layerId = feature.layer?.id
        if (layerId === 'cameras-cluster') {
          const clusterId = Number(feature.properties?.cluster_id)
          const source = map.getSource('cameras')
          if (!(source instanceof Object) || !('getClusterExpansionZoom' in source)) return
          const geometry = feature.geometry
          if (geometry.type !== 'Point') return
          void (source as GeoJSONSource).getClusterExpansionZoom(clusterId).then((zoom) => {
            map.easeTo({
              center: geometry.coordinates as [number, number],
              zoom,
            })
          })
          return
        }
        if (layerId === 'trains' && typeof feature.properties?.station === 'string') {
          handlersRef.current.onSelectStation(feature.properties.station)
        }
        if (layerId === 'stations' && typeof feature.properties?.code === 'string') {
          handlersRef.current.onSelectStation(feature.properties.code)
        }
        if (layerId === 'cameras' && typeof feature.properties?.key === 'string') {
          handlersRef.current.onSelectCamera(feature.properties.key)
        }
      })
    })

    let frame = 0
      let lastDrawn = 0
      const moveTrains = (time: number) => {
        if (!document.hidden && time - lastDrawn >= 100) {
          lastDrawn = time
          const source = map.getSource('trains')
          if (source && 'setData' in source) {
            ;(source as GeoJSONSource).setData(trainFeatures(runsRef.current, Date.now(), map.getZoom()))
          }
        }
        frame = window.requestAnimationFrame(moveTrains)
      }
      frame = window.requestAnimationFrame(moveTrains)

      return () => {
      window.cancelAnimationFrame(frame)
      map.remove()
      mapRef.current = null
    }
  }, [canDraw])

  useEffect(() => {
    const map = mapRef.current
    const source = map?.getSource('cameras')
    if (!source || !('setData' in source)) return
    ;(source as GeoJSONSource).setData(cameraFeatures(cameras))
  }, [cameras])

  useEffect(() => {
    const map = mapRef.current
    if (!map?.getLayer('mtr-lines')) return
    const networkVisibility = showNetwork ? 'visible' : 'none'
    const cameraVisibility = showCameras ? 'visible' : 'none'
    for (const layer of ['mtr-lines', 'mtr-lines-casing', 'stations', 'station-labels', 'station-focus', 'trains', 'train-labels']) {
      map.setLayoutProperty(layer, 'visibility', networkVisibility)
    }
    for (const layer of ['cameras', 'cameras-cluster', 'cameras-count']) {
      map.setLayoutProperty(layer, 'visibility', cameraVisibility)
    }
  }, [showNetwork, showCameras])

  useEffect(() => {
    const map = mapRef.current
    const source = map?.getSource('station-focus')
    if (!source || !('setData' in source)) return
    ;(source as GeoJSONSource).setData(stationFocusData(selectedStation))
  }, [selectedStation])

  useEffect(() => {
    if (focusToken === 0) return
    const map = mapRef.current
    const station = selectedStation ? stationByCode[selectedStation] : undefined
    const camera = cameras.find((item) => item.key === selectedCamera)
    const center = station
      ? ([station.lon, station.lat] as [number, number])
      : camera
        ? ([camera.lon, camera.lat] as [number, number])
        : null
    if (!map || !center) return
    const pitched = threeDRef.current
    map.flyTo({
      center,
      zoom: Math.max(map.getZoom(), pitched ? 16 : station ? 14 : 15),
      pitch: pitched ? 67 : map.getPitch(),
      duration: 700,
    })
  }, [focusToken, selectedStation, selectedCamera, cameras])

  useEffect(() => {
    if (fitToken === 0) return
    const map = mapRef.current
    if (!map) return
    const pitched = threeDRef.current
    map.fitBounds(stationBounds(), {
      padding: 56,
      duration: 700,
      pitch: pitched ? 60 : 0,
      bearing: pitched ? -28 : 0,
    })
  }, [fitToken])

  const skipInitialView = useRef(true)
  useEffect(() => {
    if (skipInitialView.current) {
      skipInitialView.current = false
      return
    }
    const map = mapRef.current
    if (!map) return
    const apply = () => {
      if (threeD) {
        const zoomedOut = map.getZoom() < 14.5
        map.setMaxBounds(null)
        map.easeTo({
          pitch: 67,
          bearing: -28,
          zoom: Math.max(map.getZoom(), 16),
          center: zoomedOut ? [114.158, 22.281] : map.getCenter(),
          duration: 1100,
        })
        return
      }
      map.easeTo({ pitch: 0, bearing: 0, duration: 700 })
      map.once('moveend', () => {
        map.setMaxBounds([
          [113.55, 22.05],
          [114.62, 22.68],
        ])
      })
    }
    try {
      apply()
    } catch {
      map.once('load', apply)
    }
  }, [threeD])

  return (
    <>
      <div ref={containerRef} className="absolute inset-0 h-full w-full" />
      {!canDraw || failed ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-stone-100 px-6 text-center text-sm leading-6 text-stone-800">
          這個瀏覽器沒有可用的地圖繪圖功能。請在 Chrome 開啟「設定 → 系統 → 使用圖形加速功能」，然後重新載入。
        </div>
      ) : null}
    </>
  )
}
