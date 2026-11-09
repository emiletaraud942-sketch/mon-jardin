import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { MAP_LOCALE_FR } from '../map/mapLocale'
import '../../lib/mapWorker'
import { MapUnsupported } from '../../components/MapUnsupported'
import { Modal } from '../../components/Modal'
import { IGN_ATTRIBUTION, PLAN_MAXZOOM, PLAN_TILES, TILE_SIZE } from '../../lib/ign'
import { PLAN_MAP_MAXZOOM } from '../map/photoZoom'
import type { GeocodeResult } from '../../lib/ign'
import { webgl2Supported } from '../../lib/webgl'
import { cssVar } from '../map/colors'

/** Carte de France (plan IGN) : un toucher pose le repère. Seulement montée si l'appareil a WebGL 2. */
function PlanMap({ onPoint }: { onPoint: (p: { lon: number; lat: number }) => void }) {
  const el = useRef<HTMLDivElement>(null)
  const pick = useRef(onPoint)
  pick.current = onPoint

  useEffect(() => {
    if (!el.current) return
    const m = new maplibregl.Map({
      container: el.current,
      center: [2.5, 46.6],
      zoom: 4.6,
      maxZoom: PLAN_MAP_MAXZOOM,
      attributionControl: false,
      locale: MAP_LOCALE_FR,
      style: {
        version: 8,
        sources: { plan: { type: 'raster', tiles: [PLAN_TILES], tileSize: TILE_SIZE, maxzoom: PLAN_MAXZOOM, attribution: IGN_ATTRIBUTION } },
        layers: [{ id: 'plan', type: 'raster', source: 'plan' }],
      },
    })
    m.addControl(new maplibregl.AttributionControl({ compact: true }))
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    let marker: maplibregl.Marker | undefined
    m.on('click', (e) => {
      marker ??= new maplibregl.Marker({ color: cssVar('--sun', '#e2a72e') })
      marker.setLngLat(e.lngLat).addTo(m)
      pick.current({ lon: e.lngLat.lng, lat: e.lngLat.lat })
    })
    m.getCanvas().style.cursor = 'crosshair'
    return () => {
      marker?.remove()
      m.remove()
    }
  }, [])

  return <div ref={el} className="spot-map location-map" role="application" aria-label="Carte de France : touchez l’emplacement de votre jardin" />
}

/**
 * « Mon adresse n'apparaît pas » : on pointe le jardin sur le plan IGN, puis « Utiliser ce point ».
 * Renvoie un résultat de la même forme qu'une adresse trouvée ; l'étiquette porte les coordonnées arrondies.
 */
export default function LocationPicker({ onPick, onClose }: { onPick: (r: GeocodeResult) => void; onClose: () => void }) {
  const [point, setPoint] = useState<{ lon: number; lat: number }>()
  const supported = webgl2Supported()

  return (
    <Modal title="Pointer mon jardin sur la carte" full onClose={onClose}>
      <div className="stack" style={{ padding: '12px 16px 16px' }}>
        {supported ? (
          <>
            <p style={{ margin: 0 }}>Zoomez jusqu’à votre jardin, puis touchez-le sur la carte.</p>
            <PlanMap onPoint={setPoint} />
            <button
              className="btn primary big"
              disabled={!point}
              onClick={() => {
                if (!point) return
                onPick({ label: `Point choisi sur la carte (${point.lat.toFixed(4).replace('.', ',')} N, ${point.lon.toFixed(4).replace('.', ',')} E)`, lon: point.lon, lat: point.lat })
              }}
            >
              Utiliser ce point
            </button>
            {!point && <p className="small muted" style={{ margin: 0 }}>Touchez la carte pour poser le repère.</p>}
          </>
        ) : (
          <MapUnsupported />
        )}
      </div>
    </Modal>
  )
}
