import { useEffect, useRef, useState } from 'react'
import maplibregl, { type GeoJSONSource, type Map as MLMap } from 'maplibre-gl'
import { SPECIES_BY_ID } from '../../data/species'
import { IGN_ATTRIBUTION, ORTHO_MAXZOOM, ORTHO_TILES, TILE_SIZE } from '../../lib/ign'
import { toLocal, toLonLat } from '../../lib/geo'
import type { Garden, Plant, XY } from '../../types'
import { cssVar } from '../map/colors'
import { orthoPaint, photoCapZoom, review } from '../map/photoZoom'

function contextData(garden: Garden, plants: Plant[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = []
  if (garden.parcel) {
    const c = garden.parcel.map((p) => {
      const ll = toLonLat(garden.center, p)
      return [ll.lon, ll.lat]
    })
    features.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [...c, c[0]] } })
  }
  for (const p of plants) {
    const ll = toLonLat(garden.center, p.position)
    features.push({ type: 'Feature', properties: { color: SPECIES_BY_ID[p.speciesId]?.couleur ?? '#6a9a5a' }, geometry: { type: 'Point', coordinates: [ll.lon, ll.lat] } })
  }
  return { type: 'FeatureCollection', features }
}

/** Emprise : parcelle, à défaut plantes, à défaut ±15 m autour du centre. */
function boundsOf(garden: Garden, plants: Plant[]): maplibregl.LngLatBoundsLike {
  const pts: XY[] = garden.parcel?.length ? garden.parcel : plants.map((p) => p.position)
  const local = pts.length ? pts : [{ x: -15, y: -15 }, { x: 15, y: 15 }]
  const xs = local.map((p) => p.x)
  const ys = local.map((p) => p.y)
  const sw = toLonLat(garden.center, { x: Math.min(...xs) - 2, y: Math.min(...ys) - 2 })
  const ne = toLonLat(garden.center, { x: Math.max(...xs) + 2, y: Math.max(...ys) + 2 })
  return [[sw.lon, sw.lat], [ne.lon, ne.lat]]
}

/** Mini-carte : un clic choisit l'emplacement à évaluer. */
export function SpotPicker({ garden, plants, spot, onPick }: { garden: Garden; plants: Plant[]; spot?: XY; onPick: (p: XY) => void }) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<MLMap>()
  const marker = useRef<maplibregl.Marker>()
  const pick = useRef(onPick)
  pick.current = onPick
  const latest = useRef({ garden, plants })
  latest.current = { garden, plants }
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!el.current) return
    const g = latest.current.garden
    const m = new maplibregl.Map({
      container: el.current,
      bounds: boundsOf(g, latest.current.plants),
      fitBoundsOptions: { padding: 24, maxZoom: 20 },
      maxZoom: photoCapZoom(review()), // 22, sauf variante de revue « repères »
      attributionControl: false,
      // Sur mobile, un doigt fait défiler la page ; deux doigts déplacent la carte.
      cooperativeGestures: true,
      locale: {
        'CooperativeGesturesHandler.WindowsHelpText': 'Ctrl + molette pour zoomer la carte',
        'CooperativeGesturesHandler.MacHelpText': '⌘ + molette pour zoomer la carte',
        'CooperativeGesturesHandler.MobileHelpText': 'Utilisez deux doigts pour déplacer la carte',
      },
      style: {
        version: 8,
        sources: { ortho: { type: 'raster', tiles: [ORTHO_TILES], tileSize: TILE_SIZE, maxzoom: ORTHO_MAXZOOM, attribution: IGN_ATTRIBUTION } },
        layers: [{ id: 'ortho', type: 'raster', source: 'ortho', paint: orthoPaint(review().ortho) }],
      },
    })
    m.addControl(new maplibregl.AttributionControl({ compact: true }))
    m.on('load', () => {
      m.addSource('ctx', { type: 'geojson', data: contextData(latest.current.garden, latest.current.plants) })
      m.addLayer({ id: 'parcel', type: 'line', source: 'ctx', filter: ['==', '$type', 'LineString'], paint: { 'line-color': cssVar('--parcel', '#ffe066'), 'line-width': 3 } })
      m.addLayer({
        id: 'plants',
        type: 'circle',
        source: 'ctx',
        filter: ['==', '$type', 'Point'],
        paint: { 'circle-radius': 5, 'circle-color': ['get', 'color'], 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.5 },
      })
      setReady(true)
    })
    m.on('click', (e) => pick.current(toLocal(latest.current.garden.center, { lon: e.lngLat.lng, lat: e.lngLat.lat })))
    m.getCanvas().style.cursor = 'crosshair'
    map.current = m
    return () => {
      marker.current?.remove()
      marker.current = undefined
      m.remove()
      map.current = undefined
      setReady(false)
    }
  }, [garden.id])

  // Parcelle et plantes à jour quand elles changent (réessai IGN, plante ajoutée ou déplacée).
  useEffect(() => {
    const m = map.current
    if (!m || !ready) return
    ;(m.getSource('ctx') as GeoJSONSource | undefined)?.setData(contextData(garden, plants))
  }, [garden, plants, ready])

  // Recadrage quand la parcelle apparaît ou change.
  const parcelKey = garden.parcel ? `${garden.parcel.length}:${garden.parcel[0].x}:${garden.parcel[0].y}` : ''
  useEffect(() => {
    const m = map.current
    if (!m || !ready || !parcelKey) return
    m.fitBounds(boundsOf(latest.current.garden, latest.current.plants), { padding: 24, maxZoom: 20, duration: 0 })
  }, [parcelKey, ready])

  useEffect(() => {
    const m = map.current
    if (!m) return
    if (!spot) {
      marker.current?.remove()
      marker.current = undefined
      return
    }
    const ll = toLonLat(garden.center, spot)
    if (!marker.current) marker.current = new maplibregl.Marker({ color: cssVar('--sun', '#e2a72e') })
    marker.current.setLngLat([ll.lon, ll.lat]).addTo(m)
  }, [spot, garden.center, ready])

  return <div ref={el} className="spot-map" role="application" aria-label="Carte du jardin : touchez un emplacement" />
}
