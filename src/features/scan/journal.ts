import type { LonLat } from '../../types'
import { toLocal } from '../../lib/geo'
import { problemFromCode, type GpsProblem } from './gps'
import { cameraHeading, type HeadingPoint, type TrackPoint } from './videoLog'

// Journal de marche : positions GPS et caps horodatés pendant que l'on filme. Tout reste dans la mémoire du téléphone.

export interface Journal {
  track: TrackPoint[]
  heads: HeadingPoint[]
  /** Dernière précision reçue (m). */
  accuracy: () => number | undefined
  /** Une boussole répond-elle ? */
  hasCompass: () => boolean
  stop: () => void
}

/** Plafond de relevés gardés (une marche de 10 minutes à 1 relevé par seconde). */
const MAX_POINTS = 1200

export function startJournal(center: LonLat, onProblem: (p: GpsProblem) => void): Journal {
  const track: TrackPoint[] = []
  const heads: HeadingPoint[] = []
  let acc: number | undefined
  let lastHead = 0
  const watch = navigator.geolocation.watchPosition(
    (pos) => {
      const p = toLocal(center, { lon: pos.coords.longitude, lat: pos.coords.latitude })
      acc = pos.coords.accuracy
      if (track.length < MAX_POINTS) track.push({ t: Date.now(), x: p.x, y: p.y, accuracy: pos.coords.accuracy })
    },
    (err) => onProblem(problemFromCode(err.code)),
    { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
  )
  const onOrient = (e: Event) => {
    const now = Date.now()
    if (now - lastHead < 200 || heads.length >= MAX_POINTS * 5) return
    const o = e as DeviceOrientationEvent & { webkitCompassHeading?: number }
    let deg: number | undefined
    if (typeof o.webkitCompassHeading === 'number' && Number.isFinite(o.webkitCompassHeading)) deg = o.webkitCompassHeading
    else if ((o.absolute || e.type === 'deviceorientationabsolute') && o.alpha != null && o.beta != null && o.gamma != null) deg = cameraHeading(o.alpha, o.beta, o.gamma)
    if (deg === undefined) return
    lastHead = now
    heads.push({ t: now, deg })
  }
  window.addEventListener('deviceorientationabsolute', onOrient)
  window.addEventListener('deviceorientation', onOrient)
  return {
    track,
    heads,
    accuracy: () => acc,
    hasCompass: () => heads.length > 0,
    stop: () => {
      navigator.geolocation.clearWatch(watch)
      window.removeEventListener('deviceorientationabsolute', onOrient)
      window.removeEventListener('deviceorientation', onOrient)
    },
  }
}
