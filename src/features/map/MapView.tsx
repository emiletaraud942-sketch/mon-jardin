import { useEffect, useRef, useState } from 'react'
import maplibregl, { type GeoJSONSource, type Map as MLMap } from 'maplibre-gl'
import { SPECIES_BY_ID } from '../../data/species'
import { Icon } from '../../components/Icon'
import { CADASTRE_MAXZOOM, CADASTRE_TILES, IGN_ATTRIBUTION, ORTHO_MAXZOOM, ORTHO_TILES, PLAN_MAXZOOM, PLAN_TILES, TILE_SIZE } from '../../lib/ign'
import { toLocal, toLonLat } from '../../lib/geo'
import { detectRows, gridLines, measureRuler, snapPoint, thresholdMeters, uncertaintyRadiusM, type SnapResult, type SnapTargets } from '../../lib/snap'
import { frMeters } from '../../lib/format'
import { legalDistance } from '../../engine/planting'
import { PlaceAction } from '../../components/PlaceAction'
import { updatePlant, useGardenPlants } from '../../lib/store'
import { getUi, openHelp, setUi, useUi } from '../../lib/ui'
import { useBanner } from '../../lib/banners'
import { plantSizeAt } from '../../engine/growth'
import type { Garden, LonLat, Plant, XY } from '../../types'
import { GardenDataBanner } from '../settings/GardenDataBanner'
import { plantName } from '../plants/PlantPanel'
import { cssVar } from './colors'
import { GardenSide, PlacingBanner, useSheetHead } from './GardenSide'
import { SidePanel } from './SidePanel'
import { movePlant, moveWithUndo, placePlant } from './placing'
import { confirmBeforePlacing, registerAim, setPlacingInfo, usePlacingInfo } from './aimBridge'
import { MAP_MAXZOOM, PHOTO_MAP_MAXZOOM, PHOTO_NOTE_ZOOM, gridStepM, orthoPaint, review } from './photoZoom'
import { LOUPE_HOLD_MS, LOUPE_SIZE, LOUPE_SLOP_PX, LOUPE_ZOOM, gpsCircleRadiusM, loupeCenter, loupeSource, rulerSummary } from './placeAids'
import { useGps } from '../scan/useGps'
import { gpsMessage } from '../scan/gps'
import { proposePosition } from '../scan/capture'
import { dragThresholdPx, nudgePosition } from './nudge'
import { loadQueue, useScanQueue } from '../scan/queueStore'
import { itemName } from '../scan/queue'
import { forGarden } from '../scan/queue'
import { openScan } from '../scan/scanUi'
import { PlantScene } from '../../components/illustrations'

type Feature = GeoJSON.Feature<GeoJSON.Polygon, Record<string, unknown>>

function circle(center: LonLat, local: XY, radiusM: number, props: Record<string, unknown>): Feature {
  const ring: number[][] = []
  for (let i = 0; i <= 32; i++) {
    const a = (i / 32) * Math.PI * 2
    const p = toLonLat(center, { x: local.x + Math.cos(a) * radiusM, y: local.y + Math.sin(a) * radiusM })
    ring.push([p.lon, p.lat])
  }
  return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring] }, properties: props }
}

function ringFeature(center: LonLat, ring: XY[], props: Record<string, unknown> = {}): Feature {
  const coords = ring.map((p) => {
    const ll = toLonLat(center, p)
    return [ll.lon, ll.lat]
  })
  coords.push(coords[0])
  return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [coords] }, properties: props }
}

function canopyFeatures(garden: Garden, plants: Plant[], adult: boolean): Feature[] {
  const now = new Date()
  return plants.flatMap((p) => {
    const s = SPECIES_BY_ID[p.speciesId]
    if (!s) return []
    const spread = adult ? s.envergureAdulteM : plantSizeAt(p, s, now).spreadM
    return [circle(garden.center, p.position, Math.max(0.15, spread / 2), { color: s.couleur, projet: p.status === 'projet' })]
  })
}

/** Emprise (lon/lat) de la parcelle, à défaut des plantes, à défaut ±15 m autour du centre. */
function gardenBounds(garden: Garden, plants: Plant[]): maplibregl.LngLatBoundsLike {
  const pts: XY[] = garden.parcel?.length ? garden.parcel : plants.map((p) => p.position)
  const local = pts.length ? pts : [{ x: -15, y: -15 }, { x: 15, y: 15 }]
  const xs = local.map((p) => p.x)
  const ys = local.map((p) => p.y)
  const sw = toLonLat(garden.center, { x: Math.min(...xs), y: Math.min(...ys) })
  const ne = toLonLat(garden.center, { x: Math.max(...xs), y: Math.max(...ys) })
  return [[sw.lon, sw.lat], [ne.lon, ne.lat]]
}

/** Marges de cadrage : la barre d'outils flottante occupe le haut de la carte. */
const fitPadding = () => ({ top: window.innerWidth <= 760 ? 72 : 64, left: 24, right: 24, bottom: 24 })

/** Nombre d'erreurs de tuiles de suite avant d'avertir que l'IGN ne répond pas. */
const TILE_ERRORS_BEFORE_NOTICE = 3
const TILE_SOURCES = new Set(['ortho', 'plan', 'cadastre'])
const isPhone = () => window.matchMedia('(max-width: 760px)').matches
const isTouch = () => window.matchMedia('(pointer: coarse)').matches

/** « Afficher les noms » : choix mémorisé ; sans choix, les noms s'affichent tant que le jardin reste lisible. */
const NAMES_KEY = 'pj.mapNames'
const MANY_PLANTS = 15
function readNames(plantCount: number): boolean {
  try {
    const v = localStorage.getItem(NAMES_KEY)
    if (v === '1') return true
    if (v === '0') return false
  } catch {
    /* mémoire indisponible */
  }
  return plantCount <= MANY_PLANTS
}

/** Aimant : mémorisé, activé par défaut. */
const SNAP_KEY = 'pj.snap'
const SNAP_PX = 18
function readSnap(): boolean {
  try {
    return localStorage.getItem(SNAP_KEY) !== '0'
  } catch {
    return true
  }
}
/** Grille d'aide au placement (1 m ou 5 m selon le zoom, voir gridStepM) : mémorisée, activée par défaut. */
const GRID_KEY = 'pj.grid'
function readGrid(): boolean {
  try {
    return localStorage.getItem(GRID_KEY) !== '0'
  } catch {
    return true
  }
}
const PLACE_ZOOM = 20
/** Fond schématique (placement) : uni et sombre, pour que les traits blancs et jaunes restent lisibles. */
const SCHEMA_BG = '#2b3a2f'

const emptyFc = (): GeoJSON.FeatureCollection => ({ type: 'FeatureCollection', features: [] })

export function MapView({ garden }: { garden: Garden }) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<MLMap>()
  const markers = useRef(new Map<string, maplibregl.Marker>())
  const plants = useGardenPlants(garden.id)
  const { selectedPlantId, placingSpeciesId, movingPlantId, aim, placingSpot } = useUi()
  const head = useSheetHead(garden)
  const placingInfo = usePlacingInfo()
  const rv = review()
  const [base, setBase] = useState<'ortho' | 'plan'>('ortho')
  const [schema, setSchema] = useState(false)
  const [gridOn, setGridOn] = useState(readGrid)
  const gridRef = useRef(gridOn)
  gridRef.current = gridOn
  const [beyondPhoto, setBeyondPhoto] = useState(false)
  const loupeEl = useRef<HTMLDivElement>(null)
  const loupeCanvas = useRef<HTMLCanvasElement>(null)
  const gps = useGps(garden.center)
  const [cadastre, setCadastre] = useState(true)
  const [adult, setAdult] = useState(false)
  const [ready, setReady] = useState(false)
  const [tileProblem, setTileProblem] = useState(false)
  const tileNoticeTurn = useBanner('carte', tileProblem)
  const [legendOpen, setLegendOpen] = useState(false)
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [names, setNames] = useState(() => readNames(plants.length))
  const namesRef = useRef(names)
  namesRef.current = names
  const gardenRef = useRef(garden)
  gardenRef.current = garden
  const placingRef = useRef(placingSpeciesId)
  placingRef.current = placingSpeciesId
  const plantsRef = useRef(plants)
  plantsRef.current = plants
  const movingRef = useRef(movingPlantId)
  movingRef.current = movingPlantId
  const [snapOn, setSnapOn] = useState(readSnap)
  const snapRef = useRef(snapOn)
  snapRef.current = snapOn
  const aimRef = useRef(!!aim)
  aimRef.current = !!aim
  const labelMarkers = useRef<maplibregl.Marker[]>([])
  const [pendingSel, setPendingSel] = useState<string>()
  const aidRef = useRef<{ snapAt: (p: XY, excludeId?: string) => SnapResult; draw: (r: SnapResult, excludeId?: string) => void; clear: () => void; finish: (p: XY) => void; refreshAim: () => void; grid: () => void }>()

  // ----- Aides au placement : accrochage, guides, règle de distances, grille -----
  aidRef.current = {
    snapAt(p, excludeId) {
      const m = map.current
      if (!snapRef.current || !m) return { point: p, guides: [] }
      const g = gardenRef.current
      const others = plantsRef.current.filter((x) => x.id !== excludeId).map((x) => x.position)
      const t: SnapTargets = {
        parcel: g.parcel,
        buildings: (g.buildings ?? []).map((b) => b.ring),
        plants: others,
        rows: detectRows(others, { near: p }),
      }
      return snapPoint(p, t, thresholdMeters(SNAP_PX, m.getZoom(), g.center.lat))
    },
    draw(r, excludeId) {
      const m = map.current
      if (!m || !m.getSource('guides')) return
      const g = gardenRef.current
      const ll = (q: XY): [number, number] => {
        const x = toLonLat(g.center, q)
        return [x.lon, x.lat]
      }
      const line = (a: XY, b: XY, props: Record<string, unknown> = {}): GeoJSON.Feature => ({ type: 'Feature', properties: props, geometry: { type: 'LineString', coordinates: [ll(a), ll(b)] } })
      const others = plantsRef.current.filter((x) => x.id !== excludeId).map((x) => x.position)
      const speciesId = excludeId ? plantsRef.current.find((x) => x.id === excludeId)?.speciesId : placingRef.current
      const species = speciesId ? SPECIES_BY_ID[speciesId] : undefined
      const legalM = species ? legalDistance(species, r.point, g.parcel).requiredM : undefined
      const ruler = measureRuler(r.point, { parcel: g.parcel, buildings: (g.buildings ?? []).map((b) => b.ring), plants: others, legalM })
      ;(m.getSource('guides') as GeoJSONSource).setData({
        type: 'FeatureCollection',
        features: r.guides.filter((q) => q.from.x !== q.to.x || q.from.y !== q.to.y).map((q) => line(q.from, q.to)),
      })
      ;(m.getSource('ruler') as GeoJSONSource).setData({ type: 'FeatureCollection', features: ruler.map((q) => line(q.from, q.to)) })
      // Cercle de la plante à sa taille adulte, avec son point central : net, quelle que soit la photo.
      const ghost = m.getSource('ghost') as GeoJSONSource | undefined
      if (ghost) {
        const feats: GeoJSON.Feature[] = [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: ll(r.point) } }]
        if (species) feats.push(circle(g.center, r.point, Math.max(0.15, species.envergureAdulteM / 2), {}))
        ghost.setData({ type: 'FeatureCollection', features: feats })
      }
      setPlacingInfo({ summary: rulerSummary(ruler) })
      const items = ruler.map((q) => {
        const mid = { x: (q.from.x + q.to.x) / 2, y: (q.from.y + q.to.y) / 2 }
        const word = q.kind === 'limite' ? 'Limite ' : q.kind === 'batiment' ? 'Maison ' : ''
        return { mid, text: word + frMeters(q.distM), kind: q.kind, warn: !!q.tooClose }
      })
      while (labelMarkers.current.length < items.length) {
        const el = document.createElement('div')
        el.classList.add('dist-label')
        const mk = new maplibregl.Marker({ element: el }).setLngLat([0, 0]).addTo(m)
        labelMarkers.current.push(mk)
      }
      labelMarkers.current.forEach((mk, i) => {
        const el = mk.getElement()
        const it = items[i]
        if (!it) {
          el.style.display = 'none'
          return
        }
        const [lon, lat] = ll(it.mid)
        mk.setLngLat([lon, lat])
        el.style.display = ''
        // classList : la classe `maplibregl-marker` (position absolue) doit rester.
        el.classList.remove('limite', 'voisine', 'batiment', 'warn')
        el.classList.add(it.kind)
        if (it.warn) el.classList.add('warn')
        el.textContent = it.text
      })
    },
    clear() {
      const m = map.current
      if (m?.getSource('guides')) {
        ;(m.getSource('guides') as GeoJSONSource).setData(emptyFc())
        ;(m.getSource('ruler') as GeoJSONSource).setData(emptyFc())
        ;(m.getSource('ghost') as GeoJSONSource).setData(emptyFc())
      }
      setPlacingInfo({ summary: '' })
      labelMarkers.current.forEach((mk) => (mk.getElement().style.display = 'none'))
    },
    finish(pos) {
      aidRef.current?.clear()
      const mv = movingRef.current
      if (mv) {
        movePlant(mv, pos)
        return
      }
      const sp = placingRef.current
      if (sp) placePlant(gardenRef.current, sp, pos)
    },
    // Viseur : guides et règle suivent le centre de la carte.
    refreshAim() {
      const m = map.current
      if (!m || !aimRef.current || !(placingRef.current || movingRef.current)) return
      const c = m.getCenter()
      const r = aidRef.current!.snapAt(toLocal(gardenRef.current.center, { lon: c.lng, lat: c.lat }), movingRef.current)
      aidRef.current!.draw(r, movingRef.current)
    },
    grid() {
      const m = map.current
      const src = m?.getSource('grid') as GeoJSONSource | undefined
      if (!m || !src) return
      const g = gardenRef.current
      const step = gridRef.current && (placingRef.current || movingRef.current) ? gridStepM(m.getZoom(), g.center.lat) : null
      if (!step) {
        src.setData(emptyFc())
        return
      }
      const b = m.getBounds()
      const sw = toLocal(g.center, { lon: b.getWest(), lat: b.getSouth() })
      const ne = toLocal(g.center, { lon: b.getEast(), lat: b.getNorth() })
      const ll = (q: XY): [number, number] => {
        const x = toLonLat(g.center, q)
        return [x.lon, x.lat]
      }
      const onFive = (v: number) => Math.abs(Math.round(v / 5) * 5 - v) < 1e-6
      src.setData({
        type: 'FeatureCollection',
        features: gridLines(sw, ne, step).map((s) => ({
          type: 'Feature' as const,
          properties: { major: onFive(s.a.x === s.b.x ? s.a.x : s.a.y) },
          geometry: { type: 'LineString' as const, coordinates: [ll(s.a), ll(s.b)] },
        })),
      })
    },
  }

  // ----- Loupe : appui prolongé du doigt, zone agrandie au-dessus du doigt avec un réticule -----
  // La photo peut être floue : on vise sur les traits nets (limites, maisons, cercles), sans que le doigt cache l'endroit.
  const suppressClick = useRef(0)
  const attachLoupe = (m: MLMap): (() => void) => {
    const cont = m.getCanvasContainer()
    const box = loupeEl.current
    const lc = loupeCanvas.current
    const ctx = lc?.getContext('2d')
    if (!box || !lc || !ctx) return () => {}
    let timer: number | undefined
    let down: XY | undefined
    let active = false
    let target: XY | undefined
    let result: SnapResult | undefined
    const view = () => ({ w: cont.clientWidth, h: cont.clientHeight })
    const rel = (e: PointerEvent): XY => {
      const r = cont.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    const eligible = () => !!(placingRef.current || movingRef.current) && !aimRef.current
    const aimAt = (finger: XY) => {
      const ll = m.unproject([finger.x, finger.y])
      const a = aidRef.current!
      const r = a.snapAt(toLocal(gardenRef.current.center, { lon: ll.lng, lat: ll.lat }), movingRef.current)
      a.draw(r, movingRef.current)
      const sp = toLonLat(gardenRef.current.center, r.point)
      const px = m.project([sp.lon, sp.lat])
      target = { x: px.x, y: px.y }
      result = r
      const c = loupeCenter(finger, view())
      box.style.transform = `translate(${c.x - LOUPE_SIZE / 2}px, ${c.y - LOUPE_SIZE / 2}px)`
      m.triggerRepaint()
    }
    const paint = () => {
      if (!active || !target) return
      const cv = m.getCanvas()
      const ratio = cv.clientWidth ? cv.width / cv.clientWidth : 1
      if (lc.width !== Math.round(LOUPE_SIZE * ratio)) lc.width = lc.height = Math.round(LOUPE_SIZE * ratio)
      const src = loupeSource(target, LOUPE_SIZE, LOUPE_ZOOM, ratio)
      ctx.clearRect(0, 0, lc.width, lc.height)
      ctx.drawImage(cv, src.sx, src.sy, src.sw, src.sw, 0, 0, lc.width, lc.height)
    }
    const stop = (commit: boolean) => {
      window.clearTimeout(timer)
      timer = undefined
      down = undefined
      if (!active) return
      active = false
      box.classList.remove('on')
      m.dragPan.enable()
      m.touchZoomRotate.enable()
      suppressClick.current = performance.now() + 600 // le toucher qui suit ne doit pas déplacer le point
      const r = result
      result = undefined
      if (!commit || !r) return
      setPlacingInfo({ note: '' })
      ;(m.getSource('gpsfix') as GeoJSONSource).setData(emptyFc())
      if (confirmBeforePlacing()) setUi({ placingSpot: r.point })
      else aidRef.current!.finish(r.point)
    }
    const onDown = (e: PointerEvent) => {
      if (!e.isPrimary) return stop(false)
      if (e.pointerType === 'mouse' || !eligible()) return
      if ((e.target as HTMLElement | null)?.closest('.marker-hit, .maplibregl-ctrl')) return
      down = rel(e)
      const start = down
      timer = window.setTimeout(() => {
        if (!down || !eligible()) return
        active = true
        // Le doigt ne doit plus déplacer la carte : seul le point visé bouge.
        m.dragPan.disable()
        m.touchZoomRotate.disable()
        box.classList.add('on')
        aimAt(start)
      }, LOUPE_HOLD_MS)
    }
    const onMove = (e: PointerEvent) => {
      if (active) return aimAt(rel(e))
      if (!down) return
      const p = rel(e)
      if (Math.hypot(p.x - down.x, p.y - down.y) > LOUPE_SLOP_PX) {
        window.clearTimeout(timer)
        down = undefined
      }
    }
    const onUp = () => stop(true)
    const onCancel = () => stop(false)
    const onTouchMove = (e: TouchEvent) => {
      if (active && e.cancelable) e.preventDefault()
    }
    const onMenu = (e: Event) => {
      if (active || down) e.preventDefault()
    }
    cont.addEventListener('pointerdown', onDown)
    cont.addEventListener('pointermove', onMove)
    cont.addEventListener('pointerup', onUp)
    cont.addEventListener('pointercancel', onCancel)
    cont.addEventListener('touchmove', onTouchMove, { passive: false })
    cont.addEventListener('contextmenu', onMenu)
    m.on('render', paint)
    return () => {
      window.clearTimeout(timer)
      cont.removeEventListener('pointerdown', onDown)
      cont.removeEventListener('pointermove', onMove)
      cont.removeEventListener('pointerup', onUp)
      cont.removeEventListener('pointercancel', onCancel)
      cont.removeEventListener('touchmove', onTouchMove)
      cont.removeEventListener('contextmenu', onMenu)
      m.off('render', paint)
    }
  }

  const fit = (animate = true) =>
    map.current?.fitBounds(gardenBounds(garden, plantsRef.current), {
      padding: fitPadding(),
      maxZoom: 21,
      duration: animate ? 600 : 0,
    })

  // Création de la carte
  useEffect(() => {
    if (!el.current) return
    const m = new maplibregl.Map({
      container: el.current,
      center: [garden.center.lon, garden.center.lat],
      zoom: 19,
      maxZoom: PHOTO_MAP_MAXZOOM, // la photo n'a pas de détail au-delà : zoom utile + 1 niveau
      attributionControl: false,
      style: {
        version: 8,
        sources: {
          ortho: { type: 'raster', tiles: [ORTHO_TILES], tileSize: TILE_SIZE, maxzoom: ORTHO_MAXZOOM, attribution: IGN_ATTRIBUTION },
          plan: { type: 'raster', tiles: [PLAN_TILES], tileSize: 256, maxzoom: PLAN_MAXZOOM, attribution: IGN_ATTRIBUTION },
          cadastre: { type: 'raster', tiles: [CADASTRE_TILES], tileSize: 256, maxzoom: CADASTRE_MAXZOOM },
        },
        layers: [
          { id: 'schema', type: 'background', paint: { 'background-color': SCHEMA_BG }, layout: { visibility: 'none' } },
          { id: 'ortho', type: 'raster', source: 'ortho', paint: orthoPaint(rv.ortho) },
          { id: 'plan', type: 'raster', source: 'plan', layout: { visibility: 'none' } },
          { id: 'cadastre', type: 'raster', source: 'cadastre', paint: { 'raster-opacity': 0.7 } },
        ],
      },
    })
    m.addControl(new maplibregl.AttributionControl({ compact: true }))
    // Boutons + et − sur tous les écrans (44 px, voir app.css) ; la boussole seulement sur grand écran.
    m.addControl(new maplibregl.NavigationControl({ visualizePitch: true, showCompass: !isPhone() }), 'top-right')
    m.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left')
    m.on('load', () => {
      m.fitBounds(gardenBounds(garden, plantsRef.current), { padding: fitPadding(), maxZoom: 21, duration: 0 })
      m.addSource('parcel', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      m.addSource('buildings', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      m.addSource('canopy', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      for (const id of ['grid', 'uncert', 'guides', 'ruler', 'ghost', 'adult', 'gpsfix']) m.addSource(id, { type: 'geojson', data: emptyFc() })
      m.addLayer({ id: 'buildings', type: 'fill', source: 'buildings', paint: { 'fill-color': '#ffffff', 'fill-opacity': 0.18, 'fill-outline-color': '#ffffff' } })
      // Contour net des maisons voisines (BD TOPO) : il ne dépend pas de la netteté de la photo.
      m.addLayer({ id: 'buildings-line', type: 'line', source: 'buildings', paint: { 'line-color': '#ffffff', 'line-width': 2, 'line-opacity': 0.95 } })
      m.addLayer({ id: 'parcel', type: 'line', source: 'parcel', paint: { 'line-color': cssVar('--parcel', '#ffe066'), 'line-width': 3 } })
      m.addLayer({
        id: 'canopy',
        type: 'fill',
        source: 'canopy',
        paint: { 'fill-color': ['get', 'color'], 'fill-opacity': ['case', ['get', 'projet'], 0.2, 0.4] },
      })
      m.addLayer({ id: 'canopy-line', type: 'line', source: 'canopy', paint: { 'line-color': '#ffffff', 'line-width': 1, 'line-opacity': 0.7 } })
      // Placement : cercles des plantes en place à leur taille adulte, puis cercle de la plante à poser avec son point central.
      m.addLayer({ id: 'adult-line', type: 'line', source: 'adult', paint: { 'line-color': '#ffffff', 'line-width': 1.25, 'line-opacity': 0.85, 'line-dasharray': [3, 2] } })
      m.addLayer({ id: 'gpsfix-fill', type: 'fill', source: 'gpsfix', paint: { 'fill-color': cssVar('--cta', '#b8532d'), 'fill-opacity': 0.16 } })
      m.addLayer({ id: 'gpsfix-line', type: 'line', source: 'gpsfix', paint: { 'line-color': cssVar('--cta', '#b8532d'), 'line-width': 2, 'line-dasharray': [2, 2] } })
      m.addLayer({ id: 'ghost-fill', type: 'fill', source: 'ghost', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': cssVar('--sun', '#e2a72e'), 'fill-opacity': 0.2 } })
      m.addLayer({ id: 'ghost-line', type: 'line', source: 'ghost', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'line-color': cssVar('--sun', '#e2a72e'), 'line-width': 2.5 } })
      m.addLayer({ id: 'ghost-dot', type: 'circle', source: 'ghost', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 4, 'circle-color': '#ffffff', 'circle-stroke-color': '#000000', 'circle-stroke-width': 1.5 } })
      // Cercle d'incertitude des plantes scannées, grille d'aide, guides d'alignement et règle (au-dessus des disques).
      m.addLayer({ id: 'uncert-fill', type: 'fill', source: 'uncert', paint: { 'fill-color': cssVar('--cta', '#b8532d'), 'fill-opacity': 0.14 } })
      m.addLayer({ id: 'uncert-line', type: 'line', source: 'uncert', paint: { 'line-color': cssVar('--cta', '#b8532d'), 'line-width': 2, 'line-dasharray': [2, 2] } })
      m.addLayer({ id: 'grid', type: 'line', source: 'grid', paint: { 'line-color': '#ffffff', 'line-width': ['case', ['get', 'major'], 1.2, 0.6], 'line-opacity': ['case', ['get', 'major'], 0.55, 0.28] } })
      m.addLayer({ id: 'ruler', type: 'line', source: 'ruler', paint: { 'line-color': '#ffffff', 'line-width': 1.5, 'line-opacity': 0.95 } })
      m.addLayer({ id: 'guides', type: 'line', source: 'guides', paint: { 'line-color': cssVar('--sun', '#e2a72e'), 'line-width': 1.5, 'line-dasharray': [3, 2] } })
      setReady(true)
    })
    const aimNow = () => aimRef.current && (placingRef.current || movingRef.current)
    m.on('click', (e) => {
      if (performance.now() < suppressClick.current) return // fin d'un appui prolongé (loupe)
      if (aimNow()) return // en mode Viser, on déplace la carte : le bouton « Placer ici » pose la plante
      const mv = movingRef.current
      const sp = placingRef.current
      if (!mv && !sp) return
      const local = toLocal(gardenRef.current.center, { lon: e.lngLat.lng, lat: e.lngLat.lat })
      const a = aidRef.current!
      const r = a.snapAt(local, mv)
      setPlacingInfo({ note: '' })
      ;(m.getSource('gpsfix') as GeoJSONSource).setData(emptyFc())
      if (confirmBeforePlacing()) {
        // Téléphone : le toucher choisit l'endroit (on peut corriger en touchant ailleurs), « Valider » le confirme.
        setUi({ placingSpot: r.point })
        a.draw(r, mv)
        return
      }
      a.finish(r.point)
    })
    // Souris : aperçu de l'accrochage et des distances sous le curseur.
    m.on('mousemove', (e) => {
      if (aimNow() || !(placingRef.current || movingRef.current)) return
      const a = aidRef.current!
      const r = a.snapAt(toLocal(gardenRef.current.center, { lon: e.lngLat.lng, lat: e.lngLat.lat }), movingRef.current)
      a.draw(r, movingRef.current)
    })
    m.getCanvas().addEventListener('mouseleave', () => {
      if (!aimNow()) aidRef.current?.clear()
    })
    m.on('move', () => aidRef.current?.refreshAim())
    // Mention discrète quand la photo ne peut plus gagner en précision (variantes de revue).
    let beyond = false
    m.on('zoom', () => {
      const b = m.getZoom() >= PHOTO_NOTE_ZOOM
      if (b !== beyond) {
        beyond = b
        setBeyondPhoto(b)
      }
    })
    m.on('moveend', () => aidRef.current?.grid())
    // Tuiles IGN : un message discret après plusieurs échecs de suite, effacé dès qu'une tuile arrive.
    let tileErrors = 0
    m.on('error', (e) => {
      const ev = e as unknown as { sourceId?: string; tile?: unknown }
      if (!ev.tile && !(ev.sourceId && TILE_SOURCES.has(ev.sourceId))) return
      if (++tileErrors >= TILE_ERRORS_BEFORE_NOTICE) setTileProblem(true)
    })
    m.on('data', (e) => {
      if (e.dataType === 'source' && 'tile' in e && tileErrors > 0) {
        tileErrors = 0
        setTileProblem(false)
      }
    })
    map.current = m
    if (rv.debug) (window as unknown as { __pjMap?: MLMap }).__pjMap = m
    const detachLoupe = attachLoupe(m)
    return () => {
      detachLoupe()
      markers.current.forEach((mk) => mk.remove())
      markers.current.clear()
      scanMarkers.current.forEach((mk) => mk.remove())
      scanMarkers.current.clear()
      m.remove()
      map.current = undefined
      setReady(false)
      setTileProblem(false)
    }
  }, [garden.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fonds et calques
  useEffect(() => {
    const m = map.current
    if (!m || !ready) return
    // Fond schématique : uni, sans photo, plan ni cadastre en image ; seuls les traits nets restent.
    const photo = base === 'ortho' && !schema
    m.setLayoutProperty('plan', 'visibility', base === 'plan' && !schema ? 'visible' : 'none')
    m.setLayoutProperty('cadastre', 'visibility', cadastre && !schema ? 'visible' : 'none')
    // La photo ne se zoome pas au-delà de son zoom utile + 1 niveau (étirement ≤ ×2) ; plan et schéma gardent 22.
    m.setMaxZoom(photo ? PHOTO_MAP_MAXZOOM : MAP_MAXZOOM)
  }, [base, cadastre, schema, ready])

  useEffect(() => {
    const m = map.current
    if (!m || !ready) return
    ;(m.getSource('parcel') as GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: garden.parcel ? [ringFeature(garden.center, garden.parcel)] : [],
    })
    ;(m.getSource('buildings') as GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: (garden.buildings ?? []).map((b) => ringFeature(garden.center, b.ring)),
    })
  }, [garden, ready])

  // La parcelle vient d'être récupérée (bouton « Réessayer ») : on recadre dessus.
  const hasParcel = !!garden.parcel?.length
  const hadParcel = useRef(hasParcel)
  useEffect(() => {
    if (hasParcel && !hadParcel.current && ready) fit()
    hadParcel.current = hasParcel
  }, [hasParcel, ready]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const m = map.current
    if (!m || !ready) return
    ;(m.getSource('canopy') as GeoJSONSource).setData({ type: 'FeatureCollection', features: canopyFeatures(garden, plants, adult) })
  }, [garden, plants, adult, ready])

  // Marqueurs déplaçables (un par plante). Zone tactile de 40 px autour d'un point de 14 px.
  useEffect(() => {
    const m = map.current
    if (!m || !ready) return
    const seen = new Set<string>()
    for (const p of plants) {
      seen.add(p.id)
      const s = SPECIES_BY_ID[p.speciesId]
      const ll = toLonLat(garden.center, p.position)
      let mk = markers.current.get(p.id)
      if (!mk) {
        const hit = document.createElement('div')
        hit.className = 'marker-hit'
        hit.tabIndex = 0
        hit.setAttribute('role', 'button')
        hit.appendChild(document.createElement('span'))
        const tag = document.createElement('span')
        tag.className = 'marker-label'
        hit.appendChild(tag)
        const select = () => setUi({ selectedPlantId: p.id })
        hit.addEventListener('click', (ev) => {
          ev.stopPropagation()
          select()
        })
        hit.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter' || ev.key === ' ') {
            ev.preventDefault()
            select()
            return
          }
          // Flèches : déplace la plante de 50 cm (2 m avec Maj), sans glisser.
          const cur = plantsRef.current.find((x) => x.id === p.id)
          const np = cur && nudgePosition(cur.position, ev.key, ev.shiftKey)
          if (np) {
            ev.preventDefault()
            updatePlant(p.id, { position: np })
          }
        })
        mk = new maplibregl.Marker({ element: hit, draggable: true, clickTolerance: dragThresholdPx(isTouch()) }).setLngLat([ll.lon, ll.lat]).addTo(m)
        let from: XY | undefined
        mk.on('dragstart', () => {
          from = plantsRef.current.find((x) => x.id === p.id)?.position
        })
        // Glisser : l'aimant ramène le point sur la limite, la façade ou l'alignement le plus proche.
        mk.on('drag', () => {
          const g = gardenRef.current
          const a = aidRef.current!
          const cur = mk!.getLngLat()
          const r = a.snapAt(toLocal(g.center, { lon: cur.lng, lat: cur.lat }), p.id)
          if (r.snappedTo) {
            const sn = toLonLat(g.center, r.point)
            mk!.setLngLat([sn.lon, sn.lat])
          }
          a.draw(r, p.id)
        })
        mk.on('dragend', () => {
          const pos = mk!.getLngLat()
          const g = gardenRef.current
          aidRef.current?.clear()
          const next = toLocal(g.center, { lon: pos.lng, lat: pos.lat })
          const round = { x: Math.round(next.x * 100) / 100, y: Math.round(next.y * 100) / 100 }
          updatePlant(p.id, { position: round })
          setUi({ selectedPlantId: p.id })
          const before = from
          if (before) moveWithUndo(p.id, before, round)
        })
        markers.current.set(p.id, mk)
      } else mk.setLngLat([ll.lon, ll.lat])
      const hit = mk.getElement()
      const dot = hit.firstElementChild as HTMLElement
      const tag = hit.lastElementChild as HTMLElement
      const sel = p.id === selectedPlantId
      hit.classList.add('marker-hit')
      hit.classList.toggle('selected', sel)
      dot.className = 'map-marker' + (sel ? ' selected' : '') + (p.status === 'projet' ? ' projet' : '')
      dot.style.width = dot.style.height = (sel ? 26 : 18) + 'px'
      dot.style.background = s?.couleurAccent ?? s?.couleur ?? cssVar('--accent-2', '#4f8a4b')
      const label = plantName(p) + (p.status === 'projet' ? ' (prévue)' : '')
      hit.title = label
      hit.setAttribute('aria-label', label)
      // Le nom s'affiche pour la plante choisie, et pour toutes si « Afficher les noms » est actif.
      tag.textContent = names || sel ? plantName(p) : ''
      tag.hidden = !(names || sel)
    }
    for (const [id, mk] of markers.current) {
      if (!seen.has(id)) {
        mk.remove()
        markers.current.delete(id)
      }
    }
  }, [plants, selectedPlantId, garden.center, ready, names])

  // « 📍 plante » d'une tâche, « Voir sur la carte » : la carte se centre sur la plante.
  // Plantes scannées « à valider » : pastilles en pointillés, un appui rouvre la revue.
  const scanQueue = useScanQueue()
  const scanMarkers = useRef(new Map<string, maplibregl.Marker>())
  useEffect(() => {
    void loadQueue()
  }, [])
  useEffect(() => {
    const m = map.current
    if (!m || !ready) return
    const live = forGarden(scanQueue, garden.id).filter((i) => i.status === 'a-valider' || i.status === 'en-attente')
    const seen = new Set<string>()
    live.forEach((i, n) => {
      seen.add(i.id)
      const ll = toLonLat(garden.center, i.position)
      let mk = scanMarkers.current.get(i.id)
      if (!mk) {
        const hit = document.createElement('button')
        hit.className = 'scan-pending-hit main'
        hit.type = 'button'
        hit.style.border = '0'
        hit.style.background = 'transparent'
        hit.appendChild(Object.assign(document.createElement('span'), { className: 'scan-pending' }))
        hit.addEventListener('click', (ev) => {
          ev.stopPropagation()
          setPendingSel(i.id)
        })
        mk = new maplibregl.Marker({ element: hit }).setLngLat([ll.lon, ll.lat]).addTo(m)
        scanMarkers.current.set(i.id, mk)
      } else mk.setLngLat([ll.lon, ll.lat])
      const hit = mk.getElement()
      hit.setAttribute('aria-label', `Plante à valider ${n + 1}. Toucher pour la revoir.`)
      hit.title = 'Plante à valider'
      ;(hit.firstElementChild as HTMLElement).textContent = String(n + 1)
    })
    for (const [id, mk] of scanMarkers.current) {
      if (!seen.has(id)) {
        mk.remove()
        scanMarkers.current.delete(id)
      }
    }
  }, [scanQueue, garden.id, garden.center, ready])

  // Cercle d'erreur autour des plantes scannées non validées : ±1 à 2 m si la carte est recalée, sinon 3 m.
  const uncertM = uncertaintyRadiusM(garden.calibration?.rmsM)
  const liveScan = forGarden(scanQueue, garden.id).filter((i) => i.status === 'a-valider' || i.status === 'en-attente')
  const liveKey = liveScan.map((i) => `${i.id}:${i.position.x}:${i.position.y}`).join('|')
  useEffect(() => {
    const m = map.current
    if (!m || !ready) return
    ;(m.getSource('uncert') as GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: liveScan.map((i) => circle(garden.center, i.position, uncertM, {})),
    })
  }, [liveKey, uncertM, garden.center, ready]) // eslint-disable-line react-hooks/exhaustive-deps

  // « Placer ici » (bannière) pose la plante sous le viseur.
  useEffect(
    () =>
      registerAim(() => {
        const m = map.current
        if (!m) return
        const a = aidRef.current!
        // Viseur : le centre de la carte. Sinon : l'endroit touché, en attente de « Valider ».
        if (aimRef.current) {
          const c = m.getCenter()
          const local = toLocal(gardenRef.current.center, { lon: c.lng, lat: c.lat })
          a.finish(a.snapAt(local, movingRef.current).point)
          return
        }
        const spot = getUi().placingSpot
        if (spot) a.finish(spot)
      }),
    [],
  )

  // Début de placement : zoom assez fort pour viser au mètre ; la grille et le viseur suivent.
  const placingNow = !!(placingSpeciesId || movingPlantId)
  useEffect(() => {
    const m = map.current
    if (!m || !ready) return
    if (placingNow) {
      const placeZoom = Math.min(PLACE_ZOOM, m.getMaxZoom()) // 19 sur la photo : au-delà elle ne gagne aucun détail
      if (m.getZoom() < placeZoom - 0.5) {
        const mv = movingPlantId ? plantsRef.current.find((x) => x.id === movingPlantId) : undefined
        const ll = mv ? toLonLat(gardenRef.current.center, mv.position) : undefined
        m.easeTo({ zoom: placeZoom, ...(ll ? { center: [ll.lon, ll.lat] as [number, number] } : {}), duration: 400 })
      }
    } else {
      aidRef.current?.clear()
    }
    aidRef.current?.grid()
    aidRef.current?.refreshAim()
  }, [placingNow, aim, ready]) // eslint-disable-line react-hooks/exhaustive-deps

  // Placement : les plantes en place à leur taille adulte (trait pointillé), pour juger des distances sans voir la photo.
  useEffect(() => {
    const m = map.current
    if (!m || !ready) return
    const feats = placingNow
      ? plants.flatMap((p) => {
          const sp = SPECIES_BY_ID[p.speciesId]
          return p.id === movingPlantId || !sp ? [] : [circle(garden.center, p.position, Math.max(0.15, sp.envergureAdulteM / 2), {})]
        })
      : []
    ;(m.getSource('adult') as GeoJSONSource).setData({ type: 'FeatureCollection', features: feats })
    if (!placingNow) {
      setSchema(false)
      ;(m.getSource('gpsfix') as GeoJSONSource).setData(emptyFc())
      setPlacingInfo({ note: '' })
    }
  }, [placingNow, plants, movingPlantId, garden.center, ready])

  // Endroit touché, en attente de « Valider » : une épingle bien visible (le doigt la cache moins que la plante).
  const spotMarker = useRef<maplibregl.Marker>()
  useEffect(() => {
    const m = map.current
    if (!m || !ready) return
    if (!placingSpot || !placingNow || aim) {
      spotMarker.current?.remove()
      spotMarker.current = undefined
      return
    }
    const ll = toLonLat(gardenRef.current.center, placingSpot)
    if (!spotMarker.current) {
      const pin = document.createElement('div')
      pin.className = 'spot-pin'
      pin.setAttribute('aria-hidden', 'true')
      spotMarker.current = new maplibregl.Marker({ element: pin }).setLngLat([ll.lon, ll.lat]).addTo(m)
    } else spotMarker.current.setLngLat([ll.lon, ll.lat])
  }, [placingSpot, placingNow, aim, ready])

  const { focusPlantId } = useUi()
  useEffect(() => {
    const m = map.current
    if (!m || !ready || !focusPlantId) return
    const p = plantsRef.current.find((x) => x.id === focusPlantId)
    setUi({ focusPlantId: undefined })
    if (!p) return
    const ll = toLonLat(gardenRef.current.center, p.position)
    m.easeTo({ center: [ll.lon, ll.lat], zoom: Math.max(m.getZoom(), 19), duration: 500 })
  }, [focusPlantId, ready])

  useEffect(() => {
    const c = map.current?.getCanvas()
    if (c) c.style.cursor = placingSpeciesId || movingPlantId ? 'crosshair' : ''
  }, [placingSpeciesId, movingPlantId, ready])

  useEffect(() => {
    aidRef.current?.grid()
  }, [gridOn, ready])

  const setGridPref = (on: boolean) => {
    setGridOn(on)
    try {
      localStorage.setItem(GRID_KEY, on ? '1' : '0')
    } catch {
      /* mémoire indisponible */
    }
  }

  // « Je suis ici » : la plante se place à la position GPS recalée de la personne debout à côté d'elle, avec son cercle d'incertitude.
  const gpsBusy = gps.state.status === 'mesure'
  useEffect(() => {
    if (gps.state.status === 'mesure') setPlacingInfo({ note: `Mesure de votre position : ${Math.round(gps.state.progress * 100)} %. Restez immobile.` })
    else if (gps.state.status === 'erreur' && gps.state.problem) setPlacingInfo({ note: gpsMessage(gps.state.problem).message })
  }, [gps.state.status, gps.state.progress, gps.state.problem])
  async function placeHere() {
    const m = map.current
    if (!m || gpsBusy) return
    setUi({ aim: false, placingSpot: undefined })
    aidRef.current?.clear()
    const sample = await gps.start(5000)
    if (!sample || !map.current) return
    const prop = proposePosition(sample, gardenRef.current.calibration)
    const a = aidRef.current!
    ;(m.getSource('gpsfix') as GeoJSONSource).setData({ type: 'FeatureCollection', features: [circle(gardenRef.current.center, prop.position, gpsCircleRadiusM(prop.accuracyM), {})] })
    setUi({ placingSpot: prop.position })
    a.draw({ point: prop.position, guides: [] }, movingRef.current)
    const ll = toLonLat(gardenRef.current.center, prop.position)
    m.easeTo({ center: [ll.lon, ll.lat], zoom: Math.max(m.getZoom(), Math.min(PLACE_ZOOM, m.getMaxZoom())), offset: [0, -90], duration: 400 })
    setPlacingInfo({ note: `Position GPS à ± ${frMeters(Math.max(0.5, prop.accuracyM))} près (cercle sur la carte). ${sample.quality === 'faible' ? 'Signal faible.' : ''}`.trim() })
  }

  const setSnapPref = (on: boolean) => {
    setSnapOn(on)
    try {
      localStorage.setItem(SNAP_KEY, on ? '1' : '0')
    } catch {
      /* mémoire indisponible */
    }
  }
  const pendingItem = pendingSel ? liveScan.find((i) => i.id === pendingSel) : undefined
  const pendingNo = pendingItem ? liveScan.indexOf(pendingItem) + 1 : 0

  // La carte « à valider » couvre le bas : on remonte la plante pour que son cercle reste visible.
  useEffect(() => {
    const m = map.current
    const it = pendingSel ? scanQueue.find((x) => x.id === pendingSel) : undefined
    if (!m || !it) return
    const ll = toLonLat(gardenRef.current.center, it.position)
    m.easeTo({ center: [ll.lon, ll.lat], zoom: Math.max(m.getZoom(), 20.3), offset: [0, -110], duration: 400 })
  }, [pendingSel]) // eslint-disable-line react-hooks/exhaustive-deps

  const setNamesPref = (on: boolean) => {
    setNames(on)
    try {
      localStorage.setItem(NAMES_KEY, on ? '1' : '0')
    } catch {
      /* mémoire indisponible */
    }
  }

  return (
    <div className="workspace">
      <div className={'canvas-wrap' + (placingSpeciesId || movingPlantId ? ' placing' : '')}>
        <div ref={el} className="map" />
        <div className="map-top">
          {!placingNow && (
          <div className="floating row map-toolbar" role="toolbar" aria-label="Réglages de la carte">
            <button className={'btn small' + (base === 'ortho' ? ' primary' : '')} aria-pressed={base === 'ortho'} onClick={() => setBase('ortho')}>
              Vue photo
            </button>
            <button className={'btn small' + (base === 'plan' ? ' primary' : '')} aria-pressed={base === 'plan'} onClick={() => setBase('plan')}>
              Vue plan
            </button>
            <button className={'btn small' + (optionsOpen ? ' on' : '')} aria-expanded={optionsOpen} aria-controls="map-options" onClick={() => setOptionsOpen((o) => !o)}>
              Options <span aria-hidden>{optionsOpen ? '▴' : '▾'}</span>
            </button>
          </div>
          )}
          {placingNow && (
            <div className="floating map-aid" role="toolbar" aria-label="Aides au placement">
              <div className="map-aid-row">
                <button className={'btn small aim-first' + (aim ? ' primary' : '')} aria-pressed={!!aim} onClick={() => setUi({ aim: !aim })}>
                  {aim ? '✓ ' : ''}Viser
                </button>
                <button className="btn small" onClick={() => openScan('mesures', movingPlantId ? { kind: 'plant', plantId: movingPlantId } : { kind: 'new' })}>
                  Par mesures
                </button>
                <button className="btn small" disabled={gpsBusy} onClick={() => void placeHere()}>
                  Je suis ici
                </button>
              </div>
              <div className="map-aid-row">
                <button className={'btn small' + (snapOn ? ' primary' : '')} aria-pressed={snapOn} onClick={() => setSnapPref(!snapOn)}>
                  {snapOn ? '✓ ' : ''}Aimanter
                </button>
                <button className={'btn small' + (gridOn ? ' primary' : '')} aria-pressed={gridOn} onClick={() => setGridPref(!gridOn)}>
                  {gridOn ? '✓ ' : ''}Grille
                </button>
                <button className={'btn small' + (schema ? ' primary' : '')} aria-pressed={schema} aria-label="Fond schématique" onClick={() => setSchema((v) => !v)}>
                  {schema ? '✓ ' : ''}Schéma
                </button>
              </div>
            </div>
          )}
          {optionsOpen && !placingNow && (
            <div id="map-options" className="floating stack map-options">
              <button className="btn small" onClick={() => fit()}>
                <Icon name="pin" size={16} /> Recentrer sur mon terrain
              </button>
              <button className={'btn small' + (cadastre ? ' on' : '')} aria-pressed={cadastre} onClick={() => setCadastre((c) => !c)}>
                {cadastre ? '✓ ' : ''}Limites du terrain
              </button>
              <button className={'btn small' + (adult ? ' on' : '')} aria-pressed={adult} onClick={() => setAdult((a) => !a)}>
                {adult ? '✓ ' : ''}Taille adulte
              </button>
              <button className={'btn small' + (names ? ' on' : '')} aria-pressed={names} onClick={() => setNamesPref(!names)}>
                {names ? '✓ ' : ''}Afficher les noms
              </button>
              {garden.calibration && (
                <button className="btn small" onClick={() => openScan('recaler')}>
                  Ajouter un repère pour améliorer la précision
                </button>
              )}
              <button className={'btn small' + (legendOpen ? ' on' : '')} aria-pressed={legendOpen} onClick={() => setLegendOpen((o) => !o)}>
                {legendOpen ? '✓ ' : ''}Légende
              </button>
              <button className="btn small" aria-haspopup="dialog" onClick={openHelp}>
                Aide sur cet écran
              </button>
            </div>
          )}
          {legendOpen && !placingNow && (
            <ul className="floating legend small" aria-label="Légende de la carte">
              <li>
                <span className="swatch line parcel" aria-hidden /> Trait jaune : limites du terrain
              </li>
              <li>
                <span className="swatch disc" aria-hidden /> Disque : largeur de la plante
              </li>
              <li>
                <span className="swatch dashed" aria-hidden /> Pointillé : plante prévue
              </li>
              <li>
                <span className="swatch building" aria-hidden /> Blanc : maisons voisines
              </li>
              <li>
                <span className="swatch dashed" aria-hidden /> Cercle en pointillés : la plante scannée est à peu près ici
              </li>
            </ul>
          )}
          {tileProblem && tileNoticeTurn && (
            <div className="alert small map-notice" role="status">
              Les images de la carte ne s’affichent pas. Elles reviendront dès que la connexion reviendra.
            </div>
          )}
          {beyondPhoto && base === 'ortho' && !schema && (
            <p className="map-photo-note small" role="note">
              La photo n’est pas plus précise de plus près.
            </p>
          )}
          <GardenDataBanner garden={garden} compact />
        </div>
        {plants.length === 0 && !placingSpeciesId && !movingPlantId && (
          <div className="floating map-empty">
            <PlantScene size={72} className="map-empty-art" />
            <p>
              <strong>Votre jardin est vide.</strong> Ajoutez votre première plante, puis touchez la carte là où elle pousse.
            </p>
            <PlaceAction>
              <Icon name="plus" /> Ajouter une plante au jardin
            </PlaceAction>
          </div>
        )}
        {placingNow && aim && <div className="aim-cross" aria-hidden />}
        <div ref={loupeEl} className="loupe" aria-hidden style={{ width: LOUPE_SIZE, height: LOUPE_SIZE }}>
          <div className="loupe-lens">
            <canvas ref={loupeCanvas} width={LOUPE_SIZE} height={LOUPE_SIZE} />
            <span className="loupe-cross" />
          </div>
          <span className="loupe-cap">{placingInfo.summary.split(' · ').slice(0, 2).join(' · ')}</span>
        </div>
        {pendingItem && !placingNow && (
          <div className="floating pending-card" role="status">
            <p style={{ margin: 0 }}>
              <strong>
                Plante à valider {pendingNo} : {itemName(pendingItem)}.
              </strong>
              <br />
              Sa place est connue à ± {frMeters(uncertM)} près.
            </p>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn primary small" onClick={() => openScan('scanner')}>
                Revoir
              </button>
              <button className="btn small" onClick={() => openScan('mesures', { kind: 'item', itemId: pendingItem.id })}>
                Affiner
              </button>
              {garden.calibration && (
                <button className="btn small" onClick={() => openScan('recaler')}>
                  Ajouter un repère pour améliorer la précision
                </button>
              )}
              <button className="btn ghost small" onClick={() => setPendingSel(undefined)}>
                Fermer
              </button>
            </div>
          </div>
        )}
        <PlacingBanner />
      </div>
      <SidePanel {...head} tall={!!selectedPlantId} collapse={!!(placingSpeciesId || movingPlantId)}>
        <GardenSide garden={garden} hint="Touchez une plante pour ouvrir sa fiche." />
      </SidePanel>
    </div>
  )
}
