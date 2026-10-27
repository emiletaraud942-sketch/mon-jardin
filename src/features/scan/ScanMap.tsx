import { useEffect, useRef, useState } from 'react'
import maplibregl, { type GeoJSONSource, type Map as MLMap } from 'maplibre-gl'
import { SPECIES_BY_ID } from '../../data/species'
import { IGN_ATTRIBUTION, ORTHO_MAXZOOM, ORTHO_TILES, TILE_SIZE } from '../../lib/ign'
import { toLocal, toLonLat } from '../../lib/geo'
import type { Garden, Plant, XY } from '../../types'
import { cssVar } from '../map/colors'
import { orthoPaint, photoCapZoom, review } from '../map/photoZoom'
import { dragThresholdPx, nudgePosition } from '../map/nudge'

/** Point fixe avec une étiquette courte (repère, point choisi…). */
export interface MapDot {
  id: string
  pos: XY
  /** Texte court dans la pastille : « 1 », « A »… */
  label: string
  /** Texte lu par les lecteurs d'écran. */
  aria: string
  tone: 'repere' | 'verite' | 'choix' | 'ref'
}

/** Marqueur « à valider » : pastille en pointillés, que l'on peut glisser. */
export interface PendingDot {
  id: string
  pos: XY
  label: string
  aria: string
  selected: boolean
}

export interface MapCircle {
  center: XY
  radiusM: number
}

interface Props {
  garden: Garden
  plants: Plant[]
  onTap?: (p: XY) => void
  dots?: MapDot[]
  pending?: PendingDot[]
  onSelectPending?: (id: string) => void
  onMovePending?: (id: string, pos: XY) => void
  circles?: MapCircle[]
  /** Quand cette liste change, la carte se recadre dessus. */
  fitTo?: XY[]
  label?: string
  className?: string
}

function ring(center: Garden['center'], c: MapCircle): number[][] {
  const out: number[][] = []
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * Math.PI * 2
    const p = toLonLat(center, { x: c.center.x + Math.cos(a) * c.radiusM, y: c.center.y + Math.sin(a) * c.radiusM })
    out.push([p.lon, p.lat])
  }
  return out
}

function contextData(garden: Garden, plants: Plant[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = []
  const line = (pts: XY[], kind: string) => {
    const c = pts.map((p) => {
      const ll = toLonLat(garden.center, p)
      return [ll.lon, ll.lat]
    })
    features.push({ type: 'Feature', properties: { kind }, geometry: { type: 'LineString', coordinates: [...c, c[0]] } })
  }
  if (garden.parcel?.length) line(garden.parcel, 'parcel')
  for (const b of garden.buildings ?? []) if (b.ring.length) line(b.ring, 'building')
  for (const p of plants) {
    const ll = toLonLat(garden.center, p.position)
    features.push({ type: 'Feature', properties: { kind: 'plant', color: SPECIES_BY_ID[p.speciesId]?.couleur ?? '#6a9a5a' }, geometry: { type: 'Point', coordinates: [ll.lon, ll.lat] } })
  }
  return { type: 'FeatureCollection', features }
}

function boundsOf(garden: Garden, plants: Plant[], extra: XY[] = []): maplibregl.LngLatBoundsLike {
  const base: XY[] = extra.length ? extra : garden.parcel?.length ? garden.parcel : plants.map((p) => p.position)
  const local = base.length ? base : [{ x: -15, y: -15 }, { x: 15, y: 15 }]
  const xs = local.map((p) => p.x)
  const ys = local.map((p) => p.y)
  const pad = extra.length ? 4 : 2
  const sw = toLonLat(garden.center, { x: Math.min(...xs) - pad, y: Math.min(...ys) - pad })
  const ne = toLonLat(garden.center, { x: Math.max(...xs) + pad, y: Math.max(...ys) + pad })
  return [[sw.lon, sw.lat], [ne.lon, ne.lat]]
}

const isTouch = () => window.matchMedia('(pointer: coarse)').matches

/**
 * Carte photo du jardin pour les écrans de scan : toucher pour choisir un point, repères, cercles d'aide,
 * marqueurs « à valider » déplaçables (au doigt ou avec les flèches du clavier).
 */
export function ScanMap({ garden, plants, onTap, dots = [], pending = [], onSelectPending, onMovePending, circles = [], fitTo, label = 'Carte du jardin', className }: Props) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<MLMap>()
  const [ready, setReady] = useState(false)
  const latest = useRef({ garden, plants, onTap, onSelectPending, onMovePending, pending })
  latest.current = { garden, plants, onTap, onSelectPending, onMovePending, pending }
  const dotMarkers = useRef(new Map<string, maplibregl.Marker>())
  const pendMarkers = useRef(new Map<string, maplibregl.Marker>())

  useEffect(() => {
    if (!el.current) return
    const g = latest.current.garden
    const m = new maplibregl.Map({
      container: el.current,
      bounds: boundsOf(g, latest.current.plants),
      fitBoundsOptions: { padding: 24, maxZoom: 20 },
      maxZoom: photoCapZoom(review()), // 22, sauf variante de revue « repères »
      attributionControl: false,
      style: {
        version: 8,
        sources: { ortho: { type: 'raster', tiles: [ORTHO_TILES], tileSize: TILE_SIZE, maxzoom: ORTHO_MAXZOOM, attribution: IGN_ATTRIBUTION } },
        layers: [{ id: 'ortho', type: 'raster', source: 'ortho', paint: orthoPaint(review().ortho) }],
      },
    })
    m.addControl(new maplibregl.AttributionControl({ compact: true }))
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    m.on('load', () => {
      m.addSource('ctx', { type: 'geojson', data: contextData(g, latest.current.plants) })
      m.addSource('circles', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      m.addLayer({ id: 'parcel', type: 'line', source: 'ctx', filter: ['==', ['get', 'kind'], 'parcel'], paint: { 'line-color': cssVar('--parcel', '#ffe066'), 'line-width': 3 } })
      m.addLayer({ id: 'building', type: 'line', source: 'ctx', filter: ['==', ['get', 'kind'], 'building'], paint: { 'line-color': '#ffffff', 'line-width': 2, 'line-opacity': 0.8 } })
      m.addLayer({ id: 'plants', type: 'circle', source: 'ctx', filter: ['==', ['get', 'kind'], 'plant'], paint: { 'circle-radius': 5, 'circle-color': ['get', 'color'], 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.5 } })
      m.addLayer({ id: 'circles-halo', type: 'line', source: 'circles', paint: { 'line-color': '#000000', 'line-width': 6, 'line-opacity': 0.35 } })
      m.addLayer({ id: 'circles', type: 'line', source: 'circles', paint: { 'line-color': cssVar('--sun', '#e2a72e'), 'line-width': 3, 'line-dasharray': [2, 1] } })
      setReady(true)
    })
    m.on('click', (e) => latest.current.onTap?.(toLocal(latest.current.garden.center, { lon: e.lngLat.lng, lat: e.lngLat.lat })))
    map.current = m
    const dm = dotMarkers.current
    const pm = pendMarkers.current
    return () => {
      dm.forEach((mk) => mk.remove())
      dm.clear()
      pm.forEach((mk) => mk.remove())
      pm.clear()
      m.remove()
      map.current = undefined
      setReady(false)
    }
  }, [garden.id])

  useEffect(() => {
    const m = map.current
    if (!m || !ready) return
    ;(m.getSource('ctx') as GeoJSONSource | undefined)?.setData(contextData(garden, plants))
  }, [garden, plants, ready])

  useEffect(() => {
    const m = map.current
    if (!m || !ready) return
    ;(m.getSource('circles') as GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: circles.map((c) => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: ring(garden.center, c) } })),
    })
  }, [circles, garden.center, ready])

  const fitKey = fitTo ? fitTo.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(';') : ''
  useEffect(() => {
    const m = map.current
    if (!m || !ready || !fitTo?.length) return
    m.fitBounds(boundsOf(latest.current.garden, latest.current.plants, fitTo), { padding: 32, maxZoom: 21, duration: 0 })
  }, [fitKey, ready]) // eslint-disable-line react-hooks/exhaustive-deps

  // Repères fixes
  useEffect(() => {
    const m = map.current
    if (!m || !ready) return
    const seen = new Set<string>()
    for (const d of dots) {
      seen.add(d.id)
      const ll = toLonLat(garden.center, d.pos)
      let mk = dotMarkers.current.get(d.id)
      if (!mk) {
        const node = document.createElement('div')
        node.className = 'scan-dot'
        mk = new maplibregl.Marker({ element: node }).setLngLat([ll.lon, ll.lat]).addTo(m)
        dotMarkers.current.set(d.id, mk)
      } else mk.setLngLat([ll.lon, ll.lat])
      const node = mk.getElement()
      node.dataset.tone = d.tone
      node.textContent = d.label
      node.setAttribute('role', 'img')
      node.setAttribute('aria-label', d.aria)
    }
    for (const [id, mk] of dotMarkers.current) {
      if (!seen.has(id)) {
        mk.remove()
        dotMarkers.current.delete(id)
      }
    }
  }, [dots, garden.center, ready])

  // Plantes à valider : pastilles en pointillés, déplaçables
  useEffect(() => {
    const m = map.current
    if (!m || !ready) return
    const seen = new Set<string>()
    for (const p of pending) {
      seen.add(p.id)
      const ll = toLonLat(garden.center, p.pos)
      let mk = pendMarkers.current.get(p.id)
      if (!mk) {
        const hit = document.createElement('div')
        hit.className = 'scan-pending-hit'
        hit.tabIndex = 0
        hit.setAttribute('role', 'button')
        const dot = document.createElement('span')
        dot.className = 'scan-pending'
        hit.appendChild(dot)
        hit.addEventListener('click', (ev) => {
          ev.stopPropagation()
          latest.current.onSelectPending?.(p.id)
        })
        hit.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter' || ev.key === ' ') {
            ev.preventDefault()
            latest.current.onSelectPending?.(p.id)
            return
          }
          const cur = latest.current.pending.find((x) => x.id === p.id)
          const np = cur && nudgePosition(cur.pos, ev.key, ev.shiftKey)
          if (np) {
            ev.preventDefault()
            latest.current.onMovePending?.(p.id, np)
          }
        })
        mk = new maplibregl.Marker({ element: hit, draggable: true, clickTolerance: dragThresholdPx(isTouch()) }).setLngLat([ll.lon, ll.lat]).addTo(m)
        mk.on('dragend', () => {
          const pos = mk!.getLngLat()
          latest.current.onMovePending?.(p.id, toLocal(latest.current.garden.center, { lon: pos.lng, lat: pos.lat }))
          latest.current.onSelectPending?.(p.id)
        })
        pendMarkers.current.set(p.id, mk)
      } else mk.setLngLat([ll.lon, ll.lat])
      const hit = mk.getElement()
      hit.classList.toggle('selected', p.selected)
      hit.setAttribute('aria-label', p.aria)
      hit.setAttribute('aria-pressed', String(p.selected))
      ;(hit.firstElementChild as HTMLElement).textContent = p.label
    }
    for (const [id, mk] of pendMarkers.current) {
      if (!seen.has(id)) {
        mk.remove()
        pendMarkers.current.delete(id)
      }
    }
  }, [pending, garden.center, ready])

  return <div ref={el} className={'scan-map' + (className ? ' ' + className : '')} role="application" aria-label={label} />
}
