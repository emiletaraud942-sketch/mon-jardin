import { useEffect, useRef } from 'react'
import * as maplibregl from 'maplibre-gl'
import '../../lib/mapWorker'
import type { Map as MLMap } from 'maplibre-gl'
import { toLonLat } from '../../lib/geo'
import type { Garden } from '../../types'
import { pointName } from './geometry'
import { openPanorama } from './panoUi'

const CAMERA_SVG =
  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l1.5-2h7L17 8h3v11H4Z"/><circle cx="12" cy="13" r="3.4"/></svg>'

/** Pastilles « photo » sur la carte, une par point de vue. Un toucher ouvre la visionneuse. */
export function usePanoramaMarkers(map: React.MutableRefObject<MLMap | undefined>, ready: boolean, garden: Garden, hidden: boolean) {
  const markers = useRef(new Map<string, maplibregl.Marker>())
  const list = garden.panoramas
  useEffect(() => {
    const m = map.current
    if (!m || !ready) return
    const seen = new Set<string>()
    ;(hidden ? [] : list ?? []).forEach((p, i) => {
      seen.add(p.id)
      const ll = toLonLat(garden.center, p)
      let mk = markers.current.get(p.id)
      if (!mk) {
        const hit = document.createElement('button')
        hit.type = 'button'
        hit.className = 'pano-pin'
        hit.innerHTML = '<span class="pano-pin-dot">' + CAMERA_SVG + '</span>'
        hit.addEventListener('click', (ev) => {
          ev.stopPropagation()
          openPanorama('view', { pointId: p.id })
        })
        mk = new maplibregl.Marker({ element: hit }).setLngLat([ll.lon, ll.lat]).addTo(m)
        markers.current.set(p.id, mk)
      } else mk.setLngLat([ll.lon, ll.lat])
      const el = mk.getElement()
      el.setAttribute('aria-label', `Photos du ${pointName(i).toLowerCase()}`)
      el.title = `Photos du ${pointName(i).toLowerCase()}`
    })
    for (const [id, mk] of markers.current) {
      if (!seen.has(id)) {
        mk.remove()
        markers.current.delete(id)
      }
    }
  }, [map, ready, list, garden.center, hidden])
  // La carte est refaite quand le jardin change : on retire les pastilles.
  useEffect(
    () => () => {
      markers.current.forEach((mk) => mk.remove())
      markers.current.clear()
    },
    [garden.id],
  )
}
