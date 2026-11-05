import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Modal } from '../../components/Modal'
import { IGN_ATTRIBUTION, PLAN_TILES, TILE_SIZE } from '../../lib/ign'
import type { GeocodeResult } from '../../lib/ign'
import { cssVar } from '../map/colors'

/**
 * « Mon adresse n'apparaît pas » : on pointe le jardin sur une carte (plan IGN), puis « Utiliser ce point ».
 * Renvoie un résultat de la même forme qu'une adresse trouvée ; l'étiquette porte les coordonnées arrondies.
 */
export default function LocationPicker({ onPick, onClose }: { onPick: (r: GeocodeResult) => void; onClose: () => void }) {
  const el = useRef<HTMLDivElement>(null)
  const [point, setPoint] = useState<{ lon: number; lat: number }>()

  useEffect(() => {
    if (!el.current) return
    const m = new maplibregl.Map({
      container: el.current,
      center: [2.5, 46.6],
      zoom: 4.6,
      maxZoom: 19,
      attributionControl: false,
      style: {
        version: 8,
        sources: { plan: { type: 'raster', tiles: [PLAN_TILES], tileSize: TILE_SIZE, maxzoom: 19, attribution: IGN_ATTRIBUTION } },
        layers: [{ id: 'plan', type: 'raster', source: 'plan' }],
      },
    })
    m.addControl(new maplibregl.AttributionControl({ compact: true }))
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    let marker: maplibregl.Marker | undefined
    m.on('click', (e) => {
      marker ??= new maplibregl.Marker({ color: cssVar('--sun', '#e2a72e') })
      marker.setLngLat(e.lngLat).addTo(m)
      setPoint({ lon: e.lngLat.lng, lat: e.lngLat.lat })
    })
    m.getCanvas().style.cursor = 'crosshair'
    return () => {
      marker?.remove()
      m.remove()
    }
  }, [])

  return (
    <Modal title="Pointer mon jardin sur la carte" full onClose={onClose}>
      <div className="stack">
        <p style={{ margin: 0 }}>Zoomez jusqu’à votre jardin, puis touchez-le sur la carte.</p>
        <div ref={el} className="spot-map location-map" role="application" aria-label="Carte de France : touchez l’emplacement de votre jardin" />
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
      </div>
    </Modal>
  )
}
